use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, ACCEPT, ACCEPT_LANGUAGE};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedMedia {
    pub imdb_id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub runtime_minutes: Option<i32>,
    pub imdb_rating: Option<f32>,
    pub poster_url: Option<String>,
    pub synopsis: Option<String>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub cast_members: Vec<ScrapedCastMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedCastMember {
    pub name: String,
    pub character_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub struct ImdbScraper;

impl ImdbScraper {
    pub async fn scrape_url(imdb_url: &str) -> Result<ScrapedMedia, String> {
        let imdb_id = Self::extract_imdb_id(imdb_url)
            .ok_or_else(|| "Invalid IMDb URL. Expected format: https://www.imdb.com/title/tt1234567/".to_string())?;

        let clean_url = format!("https://www.imdb.com/title/{}/", imdb_id);

        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        );
        headers.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        let response_text = client
            .get(&clean_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch IMDb page: {}", e))?
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        // Tier 1: Try JSON-LD parsing (schema.org/Movie or schema.org/TVSeries)
        if let Some(scraped) = Self::parse_json_ld(&imdb_id, &response_text) {
            return Ok(scraped);
        }

        // Tier 2: Fallback to DOM CSS selectors
        Self::parse_dom_fallback(&imdb_id, &response_text)
    }

    pub fn extract_imdb_id(url: &str) -> Option<String> {
        if let Some(pos) = url.find("tt") {
            let sub = &url[pos..];
            let id: String = sub.chars().take_while(|c| c.is_alphanumeric()).collect();
            if id.starts_with("tt") && id.len() >= 7 {
                return Some(id);
            }
        }
        None
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
                    
                    let imdb_rating = value.get("aggregateRating")
                        .and_then(|r| r.get("ratingValue"))
                        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
                        .map(|r| r as f32);

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

                    let mut cast_members = Vec::new();
                    if let Some(actors) = value.get("actor").and_then(|a| a.as_array()) {
                        for actor in actors {
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
                        year: None,
                        runtime_minutes: None,
                        imdb_rating,
                        poster_url,
                        synopsis,
                        genres,
                        directors: vec![],
                        cast_members,
                    });
                }
            }
        }
        None
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
            runtime_minutes: None,
            imdb_rating: None,
            poster_url: None,
            synopsis,
            genres: vec![],
            directors: vec![],
            cast_members: vec![],
        })
    }
}
