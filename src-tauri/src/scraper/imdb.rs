//! IMDb metadata scraper and HTML JSON-LD parser.
//! Purpose: Extracts title, year, runtime, poster, rating, cast, and synopsis from IMDb suggestion endpoints and schema.org JSON-LD.
//! Communication Matrix: Invoked by commands::media::extract_imdb; mirrors ScrapedMedia to frontend src/types/index.ts.

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, USER_AGENT};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

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

        let base: Option<ScrapedMedia> = Self::fetch_suggestion_api(&imdb_id).await.ok();

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

        if result.synopsis.as_ref().map(|s| s.len() < 30).unwrap_or(true) {
            if let Some(wiki_text) = Self::fetch_wikipedia_summary(&result.title, result.year).await {
                result.synopsis = Some(wiki_text);
            }
        }

        Ok(result)
    }

    fn is_bot_wall(html: &str) -> bool {
        html.contains("verify that you're not a robot")
            || html.contains("JavaScript is disabled")
            || html.len() < 10_000
    }

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

    pub fn extract_imdb_id(input: &str) -> Option<String> {
        let trimmed = input.trim();
        let bytes = trimmed.as_bytes();

        let mut i = 0;
        while i + 2 <= bytes.len() {
            let prev_alnum = i > 0 && bytes[i - 1].is_ascii_alphanumeric();
            let is_tt = (bytes[i] == b't' || bytes[i] == b'T')
                && (bytes[i + 1] == b't' || bytes[i + 1] == b'T');
            if !prev_alnum && is_tt {
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
                    return Some(trimmed[i..end].to_ascii_lowercase());
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
                    if id.eq_ignore_ascii_case(&lowered_id) {
                        let title = entry.get("l").and_then(|l| l.as_str()).unwrap_or("Untitled Media").to_string();
                        let year = entry.get("y").and_then(|y| y.as_i64()).map(|y| y as i32);
                        let poster_url = entry.get("i").and_then(|i| i.get("imageUrl")).and_then(|u| u.as_str()).map(|s| s.to_string());
                        let cast_str = entry.get("s").and_then(|s| s.as_str()).unwrap_or("");
                        let qid = entry.get("qid").or_else(|| entry.get("q")).and_then(|q| q.as_str()).unwrap_or("movie");
                        let media_type = if qid.contains("tv") || qid.contains("series") { "series".to_string() } else { "movie".to_string() };

                        let cast_members: Vec<ScrapedCastMember> = cast_str
                            .split(',')
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .map(|name| ScrapedCastMember {
                                name: name.to_string(),
                                character_name: None,
                                avatar_url: None,
                            })
                            .collect();

                        let wiki_synopsis = Self::fetch_wikipedia_summary(&title, year).await;
                        let synopsis = wiki_synopsis.unwrap_or_else(|| {
                            format!("{} ({}) starring {}.", title, year.unwrap_or(2024), cast_str)
                        });

                        return Ok(ScrapedMedia {
                            imdb_id: lowered_id,
                            title,
                            original_title: None,
                            year,
                            media_type,
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
                let types: Vec<&str> = match value.get("@type") {
                    Some(serde_json::Value::String(s)) => vec![s.as_str()],
                    Some(serde_json::Value::Array(arr)) => arr.iter().filter_map(|v| v.as_str()).collect(),
                    _ => vec![],
                };

                let is_matched = types.iter().any(|&t| matches!(t, "Movie" | "TVSeries" | "TVEpisode" | "TVMiniSeries"));
                if is_matched {
                    let title = value.get("name").and_then(|n| n.as_str()).unwrap_or("Unknown Title").to_string();
                    let synopsis = value.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());
                    let poster_url = value.get("image").and_then(|i| i.as_str()).map(|s| s.to_string());

                    let is_series = types.iter().any(|&t| t.contains("TV") || t.contains("Series") || t == "TVMiniSeries");
                    let media_type = if is_series { "series".to_string() } else { "movie".to_string() };

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

                    let genres = Self::as_json_array(value.get("genre").unwrap_or(&serde_json::Value::Null))
                        .iter()
                        .filter_map(|g| g.as_str())
                        .map(|g| g.to_string())
                        .collect();

                    let directors = Self::as_json_array(value.get("director").unwrap_or(&serde_json::Value::Null))
                        .iter()
                        .filter_map(|d| d.get("name").and_then(|n| n.as_str()).or_else(|| d.as_str()))
                        .map(|d| d.to_string())
                        .collect();

                    let mut cast_members = Vec::new();
                    if let Some(actors) = value.get("actor") {
                        for actor in Self::as_json_array(actors) {
                            if let Some(name) = actor.get("name").and_then(|n| n.as_str()).or_else(|| actor.as_str()) {
                                cast_members.push(ScrapedCastMember {
                                    name: name.to_string(),
                                    character_name: None,
                                    avatar_url: actor.get("image").and_then(|i| i.as_str()).map(|s| s.to_string()),
                                });
                            }
                        }
                    }

                    return Some(ScrapedMedia {
                        imdb_id: imdb_id.to_ascii_lowercase(),
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

    fn as_json_array(value: &serde_json::Value) -> Vec<&serde_json::Value> {
        match value {
            serde_json::Value::Array(items) => items.iter().collect(),
            single @ serde_json::Value::Object(_) => vec![single],
            _ => vec![],
        }
    }

    pub fn parse_iso_duration(iso: &str) -> Option<i32> {
        let upper = iso.trim().to_ascii_uppercase();
        let clean = if upper.starts_with("PT") {
            &upper[2..]
        } else {
            &upper
        };
        let mut total_minutes = 0;
        let mut current_digits = String::new();
        let mut parsed_any = false;

        for c in clean.chars() {
            if c.is_ascii_digit() {
                current_digits.push(c);
            } else if c == 'H' {
                if let Ok(h) = current_digits.parse::<i32>() {
                    total_minutes += h * 60;
                    parsed_any = true;
                }
                current_digits.clear();
            } else if c == 'M' {
                if let Ok(m) = current_digits.parse::<i32>() {
                    total_minutes += m;
                    parsed_any = true;
                }
                current_digits.clear();
            } else {
                current_digits.clear();
            }
        }

        if parsed_any && total_minutes > 0 {
            Some(total_minutes)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ImdbScraper;

    #[test]
    fn accepts_bare_ids_within_digit_window() {
        assert_eq!(ImdbScraper::extract_imdb_id("tt1375666"), Some("tt1375666".to_string()));
        assert_eq!(ImdbScraper::extract_imdb_id("tt0120655"), Some("tt0120655".to_string()));
        assert_eq!(
            ImdbScraper::extract_imdb_id("tt1234567890"),
            Some("tt1234567890".to_string())
        );
    }

    #[test]
    fn rejects_ids_outside_the_digit_window() {
        assert_eq!(ImdbScraper::extract_imdb_id("tt123456"), None);
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
        assert_eq!(ImdbScraper::extract_imdb_id("wordttx123456"), None);
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

#[cfg(test)]
mod duration_tests {
    use super::ImdbScraper;

    #[test]
    fn parses_standard_orders_without_panicking() {
        assert_eq!(ImdbScraper::parse_iso_duration("PT2H22M"), Some(142));
        assert_eq!(ImdbScraper::parse_iso_duration("PT2H"), Some(120));
        assert_eq!(ImdbScraper::parse_iso_duration("PT48M"), Some(48));
        assert_eq!(ImdbScraper::parse_iso_duration("PT45M30S"), Some(45));
        assert_eq!(ImdbScraper::parse_iso_duration("pt1h30m"), Some(90));
        assert_eq!(ImdbScraper::parse_iso_duration("PT15M2H"), Some(135));
    }

    #[test]
    fn malformed_order_must_not_panic_the_slice() {
        let _ = ImdbScraper::parse_iso_duration("PT1M2H");
        let _ = ImdbScraper::parse_iso_duration("PTM1H2");
        assert_eq!(ImdbScraper::parse_iso_duration(""), None);
        assert_eq!(ImdbScraper::parse_iso_duration("PTHM"), None);
    }

    #[test]
    fn accepts_uppercase_tt_prefixes() {
        assert_eq!(ImdbScraper::extract_imdb_id("TT0120655"), Some("tt0120655".to_string()));
        assert_eq!(ImdbScraper::extract_imdb_id("tT1375666"), Some("tt1375666".to_string()));
    }

    #[test]
    fn uppercase_ids_are_usable_as_identifiers() {
        match ImdbScraper::extract_imdb_id("TT1375666") {
            Some(id) => assert_eq!(id, "tt1375666"),
            None => panic!("uppercase TT must be accepted"),
        }
    }
}

#[cfg(test)]
mod flow_tests {
    use super::{ImdbScraper, ScrapedCastMember, ScrapedMedia};

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
        let real = format!("<html>{}<h1>Real Title</h1></html>", "x".repeat(20_000));
        assert!(!ImdbScraper::is_bot_wall(&real));
    }

    #[test]
    fn enrichment_overlays_base_without_degrading_it() {
        let mut base = base_media();
        let mut e = base_media();
        e.title = "JSON-LD Title".to_string();
        e.original_title = Some("Original".to_string());
        e.runtime_minutes = Some(148);
        e.imdb_rating = Some(8.5);
        e.genres = vec!["Sci-Fi".to_string()];
        e.directors = vec!["Christopher Nolan".to_string()];
        e.synopsis = Some("A much longer enriched synopsis from the real page.".to_string());
        e.cast_members = vec![];

        ImdbScraper::merge_enrichment(&mut base, e);

        assert_eq!(base.title, "Suggestion Title");
        assert_eq!(base.original_title.as_deref(), Some("Original"));
        assert_eq!(base.runtime_minutes, Some(148));
        assert_eq!(base.imdb_rating, Some(8.5));
        assert_eq!(base.genres, vec!["Sci-Fi".to_string()]);
        assert_eq!(base.directors, vec!["Christopher Nolan".to_string()]);
        assert!(base.synopsis.as_deref().unwrap().starts_with("A much longer"));
        assert_eq!(base.cast_members.len(), 1);
    }

    #[test]
    fn empty_enrichment_leaves_base_untouched() {
        let mut base = base_media();
        let before = base.clone();
        let e = base_media();
        ImdbScraper::merge_enrichment(&mut base, e);
        assert_eq!(base.synopsis, before.synopsis);
        assert_eq!(base.poster_url, before.poster_url);
    }
}
