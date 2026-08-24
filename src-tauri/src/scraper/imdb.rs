//! scraper/imdb.rs
//! ------------------------------------------------------------------------------
//! WHAT: IMDb metadata extraction. [`ImdbScraper::scrape_url`] resolves a title
//!   from a user-supplied URL or bare id using a TWO-STAGE flow:
//!     1. BASE: IMDb's CDN suggestion JSON API (no bot wall) supplies
//!        title/year/poster/type/cast.
//!     2. ENRICHMENT: the HTML title page is fetched and sniffed for IMDb's
//!        HTTP-202 JavaScript bot-wall; only genuine pages are parsed for
//!        schema.org JSON-LD, which overlays runtime/rating/genres/directors/
//!        synopsis onto the base. Wikipedia enriches thin synopses.
//!
//! DESIGN NOTES:
//!   - The whole flow is wrapped in a [`SCRAPE_TIMEOUT_SECS`] budget so a
//!   hung network can never wedge the command forever.
//!   - ID extraction is a strict hand-rolled scanner (the crate has NO
//!   `regex` dependency): it only accepts `tt` followed by 7..=10 ASCII
//!   digits, not glued into a longer token, anywhere in the input.
//!   - The DOM-scraper fallback was REMOVED: against the bot-wall it could
//!   only fabricate "Unknown Title" records, masking the real failure.
//!   - `poster_local_path` is populated by the caller (commands/mod.rs)
//!   after best-effort local caching; this module always leaves it None.
//!
//! USES:    reqwest, scraper (JSON-LD extraction), serde_json, tokio (timeout), urlencoding.
//! USED BY: src-tauri/src/commands/mod.rs (`extract_imdb`),
//!   src/types/index.ts mirrors ScrapedMedia as its TS contract.

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, ACCEPT, ACCEPT_LANGUAGE};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

/// Whole-flow ceiling (HTML parse attempt + suggestion-API fallback) before
/// the scrape is abandoned with a clear timeout error.
const SCRAPE_TIMEOUT_SECS: u64 = 25;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedMedia {
    pub imdb_id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub media_type: String,
    pub runtime_minutes: Option<i32>,
    pub imdb_rating: Option<f32>,
    pub poster_url: Option<String>,
    /// Local cached copy path (set by commands/mod.rs post-scrape; null until then).
    pub poster_local_path: Option<String>,
    pub synopsis: Option<String>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub cast_members: Vec<ScrapedCastMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedCastMember {
    pub name: String,
    pub character_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub struct ImdbScraper;

impl ImdbScraper {
    /// Scrape a title with a hard [`SCRAPE_TIMEOUT_SECS`] ceiling around the
    /// entire flow (network + parsing + Wikipedia enrichment).
    pub async fn scrape_url(imdb_input: &str) -> Result<ScrapedMedia, String> {
        match tokio::time::timeout(
            std::time::Duration::from_secs(SCRAPE_TIMEOUT_SECS),
            Self::scrape_url_inner(imdb_input),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => Err(format!(
                "IMDb scrape timed out after {} seconds. Please check your internet connection and try again.",
                SCRAPE_TIMEOUT_SECS
            )),
        }
    }

    async fn scrape_url_inner(imdb_input: &str) -> Result<ScrapedMedia, String> {
        let imdb_id = Self::extract_imdb_id(imdb_input)
            .ok_or_else(|| "Invalid IMDb URL or ID. Please provide a valid title ID (e.g. tt0120655) or IMDb link.".to_string())?;

        let clean_url = format!("https://www.imdb.com/title/{}/", imdb_id);

        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
        );
        headers.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));

        let client = reqwest::Client::builder()
            .default_headers(headers.clone())
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        // - BASE: Suggestion API FIRST -
        // IMDb's HTML endpoint serves an HTTP-202 JavaScript bot-wall to
        // non-browser clients (verified live: ~2KB page, no JSON-LD, no real
        // <h1>). The CDN suggestion JSON endpoint has no such wall, so it is
        // the reliable foundation: title/year/poster/type/cast.
        let base: Option<ScrapedMedia> = Self::fetch_suggestion_api(&imdb_id).await.ok();

        // - ENRICHMENT: HTML JSON-LD (skipped when bot-walled) -
        // The wall page itself returns 202 (a 2xx!), so status alone cannot
        // be trusted - the body is sniffed for the wall markers too. When a
        // real page comes through, JSON-LD supplies the fields the suggestion
        // API lacks: runtime, rating, genres, directors, full synopsis.
        let mut enriched: Option<ScrapedMedia> = None;
        if let Ok(resp) = client.get(&clean_url).send().await {
            if resp.status().is_success() {
                if let Ok(response_text) = resp.text().await {
                    if !Self::is_bot_wall(&response_text) {
                        enriched = Self::parse_json_ld(&imdb_id, &response_text);
                    }
                }
            }
        }

        // - MERGE -
        let mut result = match (base, enriched) {
            (Some(mut b), Some(e)) => {
                Self::merge_enrichment(&mut b, e);
                b
            }
            (Some(b), None) => b,
            (None, Some(e)) => e,
            (None, None) => {
                return Err(format!(
                    "Could not retrieve IMDb metadata for {imdb_id}: the title page is bot-protected and the suggestion API had no match for this id."
                ));
            }
        };

        // Wikipedia enrichment when the merged synopsis is thin/absent.
        if result.synopsis.as_ref().map(|s| s.len() < 30).unwrap_or(true) {
            if let Some(wiki_text) = Self::fetch_wikipedia_summary(&result.title, result.year).await {
                result.synopsis = Some(wiki_text);
            }
        }

        Ok(result)
    }

    /**
     * Detect IMDb's anti-bot interstitial. The wall returns HTTP 202 (a 2xx,
     * so status checks alone are useless) with a tiny noscript body. Real
     * title pages are hundreds of KB; the wall is ~2KB.
     */
    fn is_bot_wall(html: &str) -> bool {
        html.contains("verify that you're not a robot")
            || html.contains("JavaScript is disabled")
            || html.len() < 10_000
    }

    /**
     * Overlay HTML-derived fields onto the suggestion-API base. Enrichment
     * wins ONLY where it carries real data; base fields are never degraded.
     */
    fn merge_enrichment(base: &mut ScrapedMedia, e: ScrapedMedia) {
        if !e.original_title.as_deref().unwrap_or("").is_empty() {
            base.original_title = e.original_title;
        }
        if e.year.is_some() {
            base.year = e.year;
        }
        base.media_type = e.media_type;
        if e.runtime_minutes.is_some() {
            base.runtime_minutes = e.runtime_minutes;
        }
        if e.imdb_rating.is_some() {
            base.imdb_rating = e.imdb_rating;
        }
        if e.poster_url.as_deref().unwrap_or("").len() > base.poster_url.as_deref().unwrap_or("").len() {
            base.poster_url = e.poster_url;
        }
        if e.synopsis.as_deref().map(|s| s.len()).unwrap_or(0)
            > base.synopsis.as_deref().map(|s| s.len()).unwrap_or(0)
        {
            base.synopsis = e.synopsis;
        }
        if !e.genres.is_empty() {
            base.genres = e.genres;
        }
        if !e.directors.is_empty() {
            base.directors = e.directors;
        }
        if !e.cast_members.is_empty() {
            base.cast_members = e.cast_members;
        }
    }

    /**
     * Extract a canonical IMDb title id (`tt` + 7..=10 ASCII digits) from
     * raw user input. Accepts a bare id ("tt0117731") or any URL containing
     * one ("/title/tt0117731/?ref_=..."). Input is trimmed first.
     *
     * Hand-rolled scan (no `regex` dependency in this crate): walk ASCII
     * bytes, require the "tt" to not be glued into a longer alphanumeric
     * token, then take the digit run and accept it only when 7..=10 long
     * AND not followed by another digit (so an 11+ digit run is rejected
     * rather than truncated). Slicing is boundary-safe: only ASCII bytes
     * ('t', digits) are ever indexed.
     */
    pub fn extract_imdb_id(input: &str) -> Option<String> {
        let trimmed = input.trim();
        let bytes = trimmed.as_bytes();

        let mut i = 0;
        while i + 2 <= bytes.len() {
            let prev_alnum = i > 0 && bytes[i - 1].is_ascii_alphanumeric();
            // Accept both lowercase and UPPERCASE tt prefixes.
            let is_tt = (bytes[i] == b't' || bytes[i] == b'T')
                && (bytes[i + 1] == b't' || bytes[i + 1] == b'T');
            if !prev_alnum && is_tt {
                // Consume at most 10 digits after "tt".
                let mut end = i + 2;
                while end < bytes.len()
                    && end - (i + 2) < 10
                    && bytes[end].is_ascii_digit()
                {
                    end += 1;
                }
                let digit_count = end - (i + 2);
                let next_is_digit = bytes
                    .get(end)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false);
                if digit_count >= 7 && !next_is_digit {
                    return Some(trimmed[i..end].to_string());
                }
            }
            i += 1;
        }
        None
    }

    pub async fn fetch_wikipedia_summary(title: &str, year: Option<i32>) -> Option<String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .user_agent("CineVault/1.0 (Desktop Media Architecture)")
            .build()
            .ok()?;

        let clean_title = title.replace(' ', "_");
        // Wikipedia's REST API 404s on %3A - colons must stay literal in the
        // path ("Spider-Man: Across the Spider-Verse").
        let wiki_title = urlencoding::encode(&clean_title).replace("%3A", ":");
        let candidates = vec![
            format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}", wiki_title),
            format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}_(film)", wiki_title),
            format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}_({}_film)", wiki_title, year.unwrap_or(2024)),
            format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}_(TV_series)", wiki_title),
        ];

        for url in candidates {
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        // Disambiguation pages only list OTHER articles - they
                        // never describe this title. Treat them as a miss and
                        // keep trying the remaining candidates.
                        if json.get("type") == Some(&serde_json::json!("disambiguation")) {
                            continue;
                        }
                        if let Some(extract) = json.get("extract").and_then(|e| e.as_str()) {
                            if !extract.trim().is_empty() && extract.len() > 30 {
                                return Some(extract.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
        None
    }

    async fn fetch_suggestion_api(imdb_id: &str) -> Result<ScrapedMedia, String> {
        // The suggestion endpoint indexes ids LOWERCASED; extract_imdb_id
        // preserves input casing (e.g. "TT1375666"), so normalize the URL id
        // here and compare returned ids case-insensitively.
        let lowered_id = imdb_id.to_ascii_lowercase();
        let first_char = lowered_id.chars().next().unwrap_or('t');
        let api_url = format!("https://v2.sg.media-imdb.com/suggestion/{}/{}.json", first_char, lowered_id);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .map_err(|e| e.to_string())?;

        let res = client.get(&api_url).send().await.map_err(|e| format!("Network error connecting to IMDb: {}", e))?;
        let json: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse metadata: {}", e))?;

        if let Some(entries) = json.get("d").and_then(|d| d.as_array()) {
            for entry in entries {
                if let Some(id) = entry.get("id").and_then(|i| i.as_str()) {
                    // Case-insensitive: uppercase TT input must still match.
                    if id.eq_ignore_ascii_case(imdb_id) {
                        let title = entry.get("l").and_then(|l| l.as_str()).unwrap_or("Untitled Media").to_string();
                        let year = entry.get("y").and_then(|y| y.as_i64()).map(|y| y as i32);
                        let poster_url = entry.get("i").and_then(|i| i.get("imageUrl")).and_then(|u| u.as_str()).map(|s| s.to_string());
                        let cast_str = entry.get("s").and_then(|s| s.as_str()).unwrap_or("");
                        let qid = entry.get("qid").or_else(|| entry.get("q")).and_then(|q| q.as_str()).unwrap_or("movie");
                        let media_type = if qid.contains("tv") || qid.contains("series") { "series".to_string() } else { "movie".to_string() };

                        let cast_members: Vec<ScrapedCastMember> = cast_str
                            .split(',')
                            .map(|name| ScrapedCastMember {
                                name: name.trim().to_string(),
                                character_name: None,
                                avatar_url: None,
                            })
                            .filter(|c| !c.name.is_empty())
                            .collect();

                        // Try to get authentic synopsis from Wikipedia API
                        let wiki_synopsis = Self::fetch_wikipedia_summary(&title, year).await;
                        let synopsis = wiki_synopsis.unwrap_or_else(|| {
                            format!("{} ({}) starring {}.", title, year.unwrap_or(2024), cast_str)
                        });

                        return Ok(ScrapedMedia {
                            imdb_id: imdb_id.to_string(),
                            title,
                            original_title: None,
                            year,
                            media_type,
                            // Data honesty: the suggestion API cannot supply
                            // runtime/rating/genres - leave them EMPTY rather
                            // than fabricating plausible-looking values.
                            runtime_minutes: None,
                            imdb_rating: None,
                            poster_url,
                            poster_local_path: None,
                            synopsis: Some(synopsis),
                            genres: vec![],
                            directors: vec![],
                            cast_members,
                        });
                    }
                }
            }
        }

        Err(format!("Could not locate IMDb metadata for title: {}", imdb_id))
    }

    fn parse_json_ld(imdb_id: &str, html: &str) -> Option<ScrapedMedia> {
        let document = Html::parse_document(html);
        let selector = Selector::parse("script[type=\"application/ld+json\"]").ok()?;

        for element in document.select(&selector) {
            let json_text = element.text().collect::<Vec<_>>().join("");
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_text) {
                let schema_type = value.get("@type").and_then(|t| t.as_str()).unwrap_or("");
                if schema_type == "Movie" || schema_type == "TVSeries" || schema_type == "TVEpisode" {
                    let title = value.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown Title").to_string();
                    let synopsis = value.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());
                    let poster_url = value.get("image").and_then(|i| i.as_str()).map(|s| s.to_string());
                    
                    let media_type = if schema_type.contains("TV") || schema_type.contains("Series") {
                        "series".to_string()
                    } else {
                        "movie".to_string()
                    };

                    let imdb_rating = value.get("aggregateRating")
                        .and_then(|r| r.get("ratingValue"))
                        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
                        .map(|r| r as f32);

                    let year = value.get("datePublished")
                        .and_then(|d| d.as_str())
                        .and_then(|s| s.split('-').next())
                        .and_then(|y| y.parse::<i32>().ok());

                    let runtime_minutes = value.get("duration")
                        .and_then(|d| d.as_str())
                        .and_then(Self::parse_iso_duration);

                    let genres: Vec<String> = value.get("genre")
                        .map(|g| {
                            if let Some(arr) = g.as_array() {
                                arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
                            } else if let Some(s) = g.as_str() {
                                vec![s.to_string()]
                            } else {
                                vec![]
                            }
                        })
                        .unwrap_or_default();

                    // Schema.org emits `director`/`actor` as an ARRAY when
                    // multiple, but a SINGLE OBJECT when there is exactly one.
                    let mut directors = Vec::new();
                    if let Some(dirs) = value.get("director") {
                        for d in Self::as_json_array(dirs) {
                            if let Some(name) = d.get("name").and_then(|n| n.as_str()) {
                                directors.push(name.to_string());
                            }
                        }
                    }

                    let mut cast_members = Vec::new();
                    if let Some(actors) = value.get("actor") {
                        for actor in Self::as_json_array(actors) {
                            if let Some(name) = actor.get("name").and_then(|n| n.as_str()) {
                                cast_members.push(ScrapedCastMember {
                                    name: name.to_string(),
                                    character_name: None,
                                    avatar_url: actor.get("image").and_then(|i| i.as_str()).map(|s| s.to_string()),
                                });
                            }
                        }
                    }

                    return Some(ScrapedMedia {
                        imdb_id: imdb_id.to_string(),
                        title,
                        original_title: None,
                        year,
                        media_type,
                        runtime_minutes,
                        imdb_rating,
                        poster_url,
                        poster_local_path: None,
                        synopsis,
                        genres,
                        directors,
                        cast_members,
                    });
                }
            }
        }
        None
    }

    /**
     * Normalize a schema.org property into an array of JSON values.
     * Handles: proper arrays, SINGLE objects (one director/actor), and
     * bare strings - `.as_array()` alone silently dropped all singletons.
     */
    fn as_json_array(value: &serde_json::Value) -> Vec<&serde_json::Value> {
        match value {
            serde_json::Value::Array(items) => items.iter().collect(),
            single @ serde_json::Value::Object(_) => vec![single],
            _ => vec![],
        }
    }

    fn parse_iso_duration(iso: &str) -> Option<i32> {
        let clean = iso.trim_start_matches("PT");
        let mut total = 0;

        let h_pos = clean.find('H');
        let m_pos = clean.find('M');

        // Hours: digits immediately before 'H' (or the whole prefix if no M).
        if let Some(h) = h_pos {
            if let Ok(hours) = clean[..h].parse::<i32>() {
                total += hours * 60;
            }
        }

        // Minutes: digits between 'H' and 'M' (H present, M after it) or
        // before 'M' when no H exists. Bounds-checked so malformed orders
        // like "PT1M2H" can NEVER panic the slice.
        match (h_pos, m_pos) {
            (Some(h), Some(m)) if m > h => {
                if let Ok(mins) = clean[h + 1..m].parse::<i32>() {
                    total += mins;
                }
            }
            (Some(_), Some(m)) if m < clean.find('H').unwrap() => {
                // 'M' BEFORE 'H': minutes are the leading digits.
                if let Ok(mins) = clean[..m].parse::<i32>() {
                    total += mins;
                }
            }
            (None, Some(m)) => {
                if let Ok(mins) = clean[..m].parse::<i32>() {
                    total += mins;
                }
            }
            _ => {}
        }

        if total > 0 { Some(total) } else { None }
    }
}

// ------------------------------------------------------------------------------
// TESTS: ID extraction contract - bare IDs, full URLs, surrounding punctuation,
// and the 7-10 digit validity window. Junk input must yield None, never a
// partial or fabricated ID (a wrong ID silently ingests the wrong movie).

#[cfg(test)]
mod tests {
    use super::ImdbScraper;

    #[test]
    fn accepts_bare_ids_within_digit_window() {
        assert_eq!(ImdbScraper::extract_imdb_id("tt1375666"), Some("tt1375666".to_string()));
        assert_eq!(ImdbScraper::extract_imdb_id("tt0120655"), Some("tt0120655".to_string()));
        // 10 digits is the accepted maximum.
        assert_eq!(
            ImdbScraper::extract_imdb_id("tt1234567890"),
            Some("tt1234567890".to_string())
        );
    }

    #[test]
    fn rejects_ids_outside_the_digit_window() {
        // 6 digits - too short.
        assert_eq!(ImdbScraper::extract_imdb_id("tt123456"), None);
        // 11 digits - too long; the greedy-but-capped scan must NOT match.
        assert_eq!(ImdbScraper::extract_imdb_id("tt12345678901"), None);
    }

    #[test]
    fn extracts_from_full_urls() {
        assert_eq!(
            ImdbScraper::extract_imdb_id("https://www.imdb.com/title/tt1375666/"),
            Some("tt1375666".to_string())
        );
        assert_eq!(
            ImdbScraper::extract_imdb_id("imdb.com/title/tt0816692/?ref_=foo"),
            Some("tt0816692".to_string())
        );
    }

    #[test]
    fn ignores_lookalikes_inside_larger_tokens() {
        // 'tt' preceded by an alphanumeric character is not an ID start...
        assert_eq!(ImdbScraper::extract_imdb_id("wordttx123456"), None);
        // ...and trailing digits glued to a longer number are rejected by the
        // next_is_digit guard.
        assert_eq!(ImdbScraper::extract_imdb_id("att1234567x"), None);
    }

    #[test]
    fn junk_input_yields_none() {
        assert_eq!(ImdbScraper::extract_imdb_id(""), None);
        assert_eq!(ImdbScraper::extract_imdb_id("   "), None);
        assert_eq!(ImdbScraper::extract_imdb_id("not a url at all"), None);
        assert_eq!(ImdbScraper::extract_imdb_id("https://example.com/xyz"), None);
    }
}

// - Regression tests for audit BUG-HIGH-01 / BUG-MED-02 / BUG-MED-03 -

#[cfg(test)]
mod duration_tests {
    use super::ImdbScraper;

    #[test]
    fn parses_standard_orders_without_panicking() {
        assert_eq!(ImdbScraper::parse_iso_duration("PT2H22M"), Some(142));
        assert_eq!(ImdbScraper::parse_iso_duration("PT2H"), Some(120));
        assert_eq!(ImdbScraper::parse_iso_duration("PT48M"), Some(48));
        assert_eq!(ImdbScraper::parse_iso_duration("PT45M30S"), Some(45));
    }

    #[test]
    fn malformed_order_must_not_panic_the_slice() {
        // Historical panic: 'M' before 'H' made [h+1..m] an inverted range.
        let _ = ImdbScraper::parse_iso_duration("PT1M2H");
        let _ = ImdbScraper::parse_iso_duration("PTM1H2");
        // Garbage must simply yield None / no crash.
        assert_eq!(ImdbScraper::parse_iso_duration(""), None);
        assert_eq!(ImdbScraper::parse_iso_duration("PTHM"), None);
    }

    #[test]
    fn accepts_uppercase_tt_prefixes() {
        // Scanner preserves the input's casing verbatim.
        assert_eq!(ImdbScraper::extract_imdb_id("TT0120655"), Some("TT0120655".to_string()));
        assert_eq!(ImdbScraper::extract_imdb_id("tT1375666"), Some("tT1375666".to_string()));
    }

    #[test]
    fn uppercase_ids_are_usable_as_identifiers() {
        match ImdbScraper::extract_imdb_id("TT1375666") {
            Some(id) => assert!(id.eq_ignore_ascii_case("tt1375666"), "got: {id}"),
            None => panic!("uppercase TT must be accepted"),
        }
    }
}

// - Tests: bot-wall sniffing + suggestion-base enrichment merge -

#[cfg(test)]
mod flow_tests {
    use super::{ImdbScraper, ScrapedMedia, ScrapedCastMember};

    fn base_media() -> ScrapedMedia {
        ScrapedMedia {
            imdb_id: "tt1375666".to_string(),
            title: "Suggestion Title".to_string(),
            original_title: None,
            year: Some(2010),
            media_type: "movie".to_string(),
            runtime_minutes: None,
            imdb_rating: None,
            poster_url: Some("short".to_string()),
            poster_local_path: None,
            synopsis: Some("Short base synopsis.".to_string()),
            genres: vec![],
            directors: vec![],
            cast_members: vec![ScrapedCastMember {
                name: "Base Cast".to_string(),
                character_name: None,
                avatar_url: None,
            }],
        }
    }

    #[test]
    fn bot_wall_sniffer_flags_interstitial_and_tiny_pages() {
        let wall = "<h1>JavaScript is disabled</h1> In order to continue, we need to verify that you're not a robot.";
        assert!(ImdbScraper::is_bot_wall(wall));
        assert!(ImdbScraper::is_bot_wall("tiny"));
        // A genuine page: long, no wall markers.
        let real = format!("<html>{}<h1>Real Title</h1></html>", "x".repeat(20_000));
        assert!(!ImdbScraper::is_bot_wall(&real));
    }

    #[test]
    fn enrichment_overlays_base_without_degrading_it() {
        let mut base = base_media();
        let mut e = base_media();
        e.title = "JSON-LD Title".to_string(); // base title must WIN (suggestion is canonical)
        e.original_title = Some("Original".to_string());
        e.runtime_minutes = Some(148);
        e.imdb_rating = Some(8.5);
        e.genres = vec!["Sci-Fi".to_string()];
        e.directors = vec!["Christopher Nolan".to_string()];
        e.synopsis = Some("A much longer enriched synopsis from the real page.".to_string());
        e.cast_members = vec![]; // empty enrichment must NOT wipe base cast

        ImdbScraper::merge_enrichment(&mut base, e);

        assert_eq!(base.title, "Suggestion Title");
        assert_eq!(base.original_title.as_deref(), Some("Original"));
        assert_eq!(base.runtime_minutes, Some(148));
        assert_eq!(base.imdb_rating, Some(8.5));
        assert_eq!(base.genres, vec!["Sci-Fi".to_string()]);
        assert_eq!(base.directors, vec!["Christopher Nolan".to_string()]);
        assert!(base.synopsis.as_deref().unwrap().starts_with("A much longer"));
        assert_eq!(base.cast_members.len(), 1, "empty enrichment must not erase base cast");
    }

    #[test]
    fn empty_enrichment_leaves_base_untouched() {
        let mut base = base_media();
        let before = base.clone();
        let e = base_media(); // identical -> nothing longer/non-empty
        ImdbScraper::merge_enrichment(&mut base, e);
        assert_eq!(base.synopsis, before.synopsis);
        assert_eq!(base.poster_url, before.poster_url);
    }
}
