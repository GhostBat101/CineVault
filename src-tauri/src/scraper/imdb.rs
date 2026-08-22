//! scraper/imdb.rs
//! ─────────────────────────────────────────────────────────────
//! WHAT: IMDb metadata extraction. [`ImdbScraper::scrape_url`] resolves a
//!       title from a user-supplied URL or bare id, parses schema.org
//!       JSON-LD first, falls back to DOM scraping, then to IMDb's public
//!       suggestion API, enriching synopses via Wikipedia.
//!
//! DESIGN NOTES:
//!   - The whole flow is wrapped in a [`SCRAPE_TIMEOUT_SECS`] budget so a
//!     hung network can never wedge the command forever.
//!   - ID extraction is a strict hand-rolled scanner (the crate has NO
//!     `regex` dependency): it only accepts `tt` followed by 7..=10 ASCII
//!     digits, not glued into a longer token, anywhere in the input.
//!   - `poster_local_path` is populated by the caller (commands/mod.rs)
//!     after best-effort local caching; this module always leaves it None.
//!
//! USES:    reqwest, scraper (DOM), serde_json, tokio (timeout), urlencoding.
//! USED BY: src-tauri/src/commands/mod.rs (`extract_imdb`),
//!          src/types/index.ts mirrors ScrapedMedia as its TS contract.

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

        // Attempt 1: Fetch HTML and parse schema.org JSON-LD
        if let Ok(resp) = client.get(&clean_url).send().await {
            if resp.status().is_success() {
                if let Ok(response_text) = resp.text().await {
                    if let Some(mut scraped) = Self::parse_json_ld(&imdb_id, &response_text) {
                        if scraped.synopsis.as_ref().map(|s| s.len() < 30).unwrap_or(true) {
                            if let Some(wiki_text) = Self::fetch_wikipedia_summary(&scraped.title, scraped.year).await {
                                scraped.synopsis = Some(wiki_text);
                            }
                        }
                        return Ok(scraped);
                    }
                    if let Ok(mut scraped) = Self::parse_dom_fallback(&imdb_id, &response_text) {
                        if scraped.synopsis.as_ref().map(|s| s.len() < 30).unwrap_or(true) {
                            if let Some(wiki_text) = Self::fetch_wikipedia_summary(&scraped.title, scraped.year).await {
                                scraped.synopsis = Some(wiki_text);
                            }
                        }
                        return Ok(scraped);
                    }
                }
            }
        }

        // Attempt 2: Fallback to IMDb JSON Suggestion API + Wikipedia Summary API
        Self::fetch_suggestion_api(&imdb_id).await
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
            format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}_\(TV_series)", wiki_title),
        ];

        for url in candidates {
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
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
        let first_char = imdb_id.chars().next().unwrap_or('t').to_ascii_lowercase();
        let api_url = format!("https://v2.sg.media-imdb.com/suggestion/{}/{}.json", first_char, imdb_id);

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
                    if id == imdb_id {
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

    fn parse_dom_fallback(imdb_id: &str, html: &str) -> Result<ScrapedMedia, String> {
        let document = Html::parse_document(html);

        let title_selector = Selector::parse("h1").map_err(|e| e.to_string())?;
        let title = document.select(&title_selector)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
            .unwrap_or_else(|| "Unknown Title".to_string());

        let plot_selector = Selector::parse("span[data-testid=\"plot-xs_to_m\"], span[data-testid=\"plot-xl\"]").ok();
        let synopsis = plot_selector.and_then(|sel| {
            document.select(&sel).next().map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
        });

        Ok(ScrapedMedia {
            imdb_id: imdb_id.to_string(),
            title,
            original_title: None,
            year: None,
            media_type: "movie".to_string(),
            runtime_minutes: None,
            imdb_rating: None,
            poster_url: None,
            poster_local_path: None,
            synopsis,
            genres: vec![],
            directors: vec![],
            cast_members: vec![],
        })
    }
}

// ── TESTS ───────────────────────────────────────────────────────────────────
// Contract for ID extraction: bare IDs, full URLs, surrounding punctuation,
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

// ── Regression tests for audit BUG-HIGH-01 / BUG-MED-02 / BUG-MED-03 ───────

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
