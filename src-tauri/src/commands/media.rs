//! Media catalog and settings persistence IPC commands.
//! Purpose: Handles IMDb ingestion, poster caching/importing, media CRUD, full vault export/import, and application settings.
//! Communication Matrix: Invoked by frontend api.ts; interfaces with scraper::imdb, db::repository, and tauri runtime.

use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use crate::db::repository::{FullDatabaseExport, MediaRecord, Repository};
use crate::scraper::imdb::{ImdbScraper, ScrapedMedia};

const POSTER_IMPORT_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct OmdbEnrichment {
    #[serde(default)]
    runtime: Option<String>,
    #[serde(default)]
    genre: Option<String>,
    #[serde(default)]
    director: Option<String>,
    #[serde(default)]
    plot: Option<String>,
    #[serde(default, rename = "imdbRating")]
    imdb_rating: Option<String>,
}

fn parse_omdb_runtime(runtime: &str) -> Option<i32> {
    runtime
        .split_whitespace()
        .next()
        .and_then(|token| token.parse::<i32>().ok())
}

fn merge_omdb_enrichment(base: &mut ScrapedMedia, omdb: OmdbEnrichment) {
    if base.imdb_rating.is_none() {
        base.imdb_rating = omdb
            .imdb_rating
            .as_deref()
            .and_then(|r| r.parse::<f32>().ok());
    }
    if base.runtime_minutes.is_none() {
        base.runtime_minutes = omdb.runtime.as_deref().and_then(parse_omdb_runtime);
    }
    if base.genres.is_empty() {
        base.genres = omdb
            .genre
            .map(|g| {
                g.split(',')
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty() && item != "N/A")
                    .collect()
            })
            .unwrap_or_default();
    }
    if base.directors.is_empty() {
        base.directors = omdb
            .director
            .map(|d| {
                d.split(',')
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty() && item != "N/A")
                    .collect()
            })
            .unwrap_or_default();
    }
    if base.synopsis.as_deref().map(|s| s.len()).unwrap_or(0) < 30 {
        if let Some(plot) = omdb.plot.filter(|p| p != "N/A") {
            base.synopsis = Some(plot);
        }
    }
}

async fn enrich_from_omdb(imdb_id: &str, api_key: &str) -> Result<OmdbEnrichment, String> {
    let url = format!(
        "https://www.omdbapi.com/?i={}&apikey={}&plot=full",
        imdb_id, api_key
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let response: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .json()
        .await
        .map_err(|e| format!("decode: {e}"))?;

    if response.get("Response").and_then(|r| r.as_str()) == Some("False") {
        return Err(format!(
            "OMDb error: {}",
            response
                .get("Error")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown")
        ));
    }

    serde_json::from_value(response).map_err(|e| format!("shape: {e}"))
}

async fn cache_poster_locally(
    app_handle: &AppHandle,
    imdb_id: &str,
    poster_url: &str,
) -> Result<String, String> {
    let posters_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cannot resolve app cache dir: {}", e))?
        .join("posters");
    tokio::fs::create_dir_all(&posters_dir)
        .await
        .map_err(|e| format!("Failed to create poster cache dir: {}", e))?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(12))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to build poster HTTP client: {}", e))?;

    let response = client
        .get(poster_url)
        .send()
        .await
        .map_err(|e| format!("Poster download failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Poster download failed with status: {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read poster bytes: {}", e))?;

    let target_path = posters_dir.join(format!("{}.jpg", imdb_id));
    let mut file = tokio::fs::File::create(&target_path)
        .await
        .map_err(|e| format!("Failed to create poster file: {}", e))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("Failed to write poster file: {}", e))?;
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush poster file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn extract_imdb(
    imdb_url: String,
    repo: State<'_, std::sync::Arc<Repository>>,
    app_handle: AppHandle,
) -> Result<ScrapedMedia, String> {
    crate::logger::Logger::info(&format!("Scraping metadata for input: {}", imdb_url));
    let mut media = ImdbScraper::scrape_url(&imdb_url).await?;

    let repo_handle = std::sync::Arc::clone(repo.inner());
    let stored_key: Option<String> = tauri::async_runtime::spawn_blocking(move || {
        repo_handle
            .get_app_settings_json()
            .ok()
            .flatten()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.get("omdbApiKey").and_then(|k| k.as_str()).map(str::to_string))
    })
    .await
    .ok()
    .flatten();

    if let Some(key) = stored_key.filter(|k| !k.trim().is_empty()) {
        match enrich_from_omdb(&media.imdb_id, &key).await {
            Ok(omdb) => merge_omdb_enrichment(&mut media, omdb),
            Err(err) => crate::logger::Logger::warn(&format!("OMDb enrichment skipped: {err}")),
        }
    }

    if let Some(ref url) = media.poster_url {
        match cache_poster_locally(&app_handle, &media.imdb_id, url).await {
            Ok(cached_path) => {
                crate::logger::Logger::info(&format!(
                    "Cached poster for {} at {}",
                    media.imdb_id, cached_path
                ));
                media.poster_local_path = Some(cached_path);
            }
            Err(e) => {
                crate::logger::Logger::warn(&format!(
                    "Poster cache skipped for {}: {}",
                    media.imdb_id, e
                ));
            }
        }
    }

    Ok(media)
}

#[tauri::command]
pub async fn import_poster_asset(source_path: String, app_handle: AppHandle) -> Result<String, String> {
    let extension = std::path::Path::new(&source_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| "Poster file has no extension".to_string())?;
    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return Err(format!(
            "Unsupported poster format '.{}' (allowed: jpg, jpeg, png, webp)",
            extension
        ));
    }

    let source_meta = tokio::fs::metadata(&source_path)
        .await
        .map_err(|e| format!("Cannot access poster file: {}", e))?;
    if !source_meta.is_file() {
        return Err("Selected poster path is not a regular file".to_string());
    }
    if source_meta.len() > POSTER_IMPORT_MAX_BYTES {
        return Err(format!(
            "Poster file is {:.1} MB; the import limit is {} MB",
            source_meta.len() as f64 / (1024.0 * 1024.0),
            POSTER_IMPORT_MAX_BYTES / (1024 * 1024)
        ));
    }

    let posters_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cannot resolve app cache dir: {}", e))?
        .join("posters");
    tokio::fs::create_dir_all(&posters_dir)
        .await
        .map_err(|e| format!("Failed to create poster cache dir: {}", e))?;

    let target_path = posters_dir.join(format!("manual_{}.{}", uuid::Uuid::new_v4(), extension));
    tokio::fs::copy(&source_path, &target_path)
        .await
        .map_err(|e| format!("Failed to copy poster into the vault cache: {}", e))?;

    crate::logger::Logger::info(&format!(
        "Imported manual poster asset {} -> {}",
        source_path,
        target_path.to_string_lossy()
    ));
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_app_settings(
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Option<serde_json::Value>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_app_settings_json()
            .map_err(|e| e.to_string())
            .and_then(|json| match json {
                Some(raw) => serde_json::from_str(&raw)
                    .map(Some)
                    .map_err(|e| format!("Corrupt app settings store: {}", e)),
                None => Ok(None),
            })
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_app_settings(
    settings: serde_json::Value,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let raw = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_app_settings_json(&raw)
            .map_err(|e| e.to_string())
            .map(|_| true)
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_media_entry(
    media: MediaRecord,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<String, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.insert_media(&media)
            .map(|_| format!("Successfully saved media: {}", media.title))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn get_all_media(repo: State<'_, std::sync::Arc<Repository>>) -> Result<Vec<MediaRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_all_media().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn delete_media_entry(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let removed = repo.delete_media(&media_id).map_err(|e| e.to_string())?;
        Ok(removed > 0)
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn export_database_json(repo: State<'_, std::sync::Arc<Repository>>) -> Result<String, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.export_full_database()
            .map_err(|e| e.to_string())
            .and_then(|export| serde_json::to_string_pretty(&export).map_err(|e| e.to_string()))
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn import_database_json(
    json_content: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let parsed: FullDatabaseExport = serde_json::from_str(&json_content)
        .map_err(|e| format!("Invalid JSON schema: {}", e))?;

    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::db::repository::verify_export_checksum(&parsed) {
            return Err("CHECKSUM_MISMATCH: backup file integrity verification failed".to_string());
        }

        repo.import_full_database_transactional(&parsed)
            .map(|report| {
                crate::logger::Logger::info(&format!(
                    "Import complete: {} media rows restored.",
                    report.imported_media
                ));
                true
            })
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}
