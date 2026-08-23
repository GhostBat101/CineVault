//! commands/mod.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Every `#[tauri::command]` exposed to the webview, registered in
//!   lib.rs's invoke_handler. Thin layer: validate args, call into
//!   repository / scraper / AI engine / downloader, map errors to strings.
//!
//! ARG CASING CONTRACT: Tauri v2 auto-converts camelCase JS keys to these
//!   snake_case parameters (e.g. JS `{ imdbUrl }` -> `imdb_url`).
//!   Struct payloads (MediaRecord, InferenceRequest) are camelCase via
//!   serde rename_all - see services/api.ts for the mirrored contract.
//!
//! DESIGN NOTES:
//!   - Repository state is managed as `std::sync::Arc<Repository>` (see
//!   lib.rs). DB commands clone the Arc and run blocking SQLite calls via
//!   `tauri::async_runtime::spawn_blocking`, so slow queries never block
//!   the Tokio runtime threads that drive IPC and HTTP.
//!   - `extract_imdb` also populates `posterLocalPath` by best-effort caching
//!   the poster into `<app_cache_dir>/posters/<imdbId>.jpg`; any cache
//!   failure only logs a warning - extraction itself must not fail.
//!   - `import_poster_asset` lets users attach local artwork (Original
//!   Screenplays flow) by copying a validated image into the same posters
//!   cache under a fresh uuid name; requires the dialog plugin capability.
//!
//! USES:    telemetry/hardware, scraper/imdb, ai/{engine,downloader},
//!   db/repository, logger.
//! USED BY: src-tauri/src/lib.rs (generate_handler! list).

use tauri::{AppHandle, Emitter, State};
use crate::telemetry::hardware::{TelemetryData, HardwareMonitor};
use crate::scraper::imdb::{ScrapedMedia, ImdbScraper};
use crate::ai::engine::{InferenceRequest, InferenceResponse, LocalAIEngine, ModelVaultStatus};
use crate::ai::downloader::ModelDownloader;
use crate::db::repository::{FullDatabaseExport, MediaRecord, Repository};

/// Only these hosts may serve an auto-update installer executable.
const ALLOWED_UPDATE_HOSTS: [&str; 3] = [
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

/// Hard ceiling for the best-effort poster cache download inside extract_imdb.
const POSTER_CACHE_TIMEOUT_SECS: u64 = 8;

/// Hard ceiling for manually imported poster assets (8 MiB).
const POSTER_IMPORT_MAX_BYTES: u64 = 8 * 1024 * 1024;

/**
 * Read the persisted settings blob off the blocking pool (SQLite reads block;
 * never call this inline from an async command thread). Returns None when no
 * settings were ever saved or the read failed - callers treat that as defaults.
 */
async fn load_stored_settings(
    repo: &State<'_, std::sync::Arc<Repository>>,
) -> Option<serde_json::Value> {
    let repo_handle = std::sync::Arc::clone(repo.inner());
    let raw = tauri::async_runtime::spawn_blocking(move || {
        repo_handle.get_app_settings_json().ok().flatten()
    })
    .await
    .ok()
    .flatten()?;

    serde_json::from_str::<serde_json::Value>(&raw).ok()
}

#[tauri::command]
pub async fn get_telemetry(
    monitor: State<'_, HardwareMonitor>,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<TelemetryData, String> {
    // Feed the ACTIVE model's real catalog size into the VRAM budget model
    // instead of a hardcoded 1500MB guess.
    let active_model_mb = engine
        .get_vault_status()
        .models
        .iter()
        .find(|m| m.is_active)
        .map(|m| m.file_size_mb)
        .unwrap_or(1500);

    // forcedCpuMode is a user setting (default false when absent/unparsed);
    // read it through the blocking pool like every other DB touchpoint.
    let forced_cpu_mode = load_stored_settings(&repo)
        .await
        .map(|settings| {
            settings
                .get("forcedCpuMode")
                .or_else(|| settings.get("forced_cpu_mode"))
                .and_then(|flag| flag.as_bool())
                .unwrap_or(false)
        })
        .unwrap_or(false);

    Ok(monitor.sample_telemetry(forced_cpu_mode, active_model_mb))
}

/**
 * Scrape IMDb metadata for a title URL/bare ID, then best-effort cache the
 * poster locally. On success `posterLocalPath` points at
 * `<app cache dir>/posters/<imdbId>.jpg`; on any cache failure it stays null.
 */
#[tauri::command]
pub async fn extract_imdb(imdb_url: String, app_handle: AppHandle) -> Result<ScrapedMedia, String> {
    let mut scraped = ImdbScraper::scrape_url(&imdb_url).await?;

    // Poster caching must never fail extraction: own 8s budget + warn-only errors.
    let imdb_id = scraped.imdb_id.clone();
    if !imdb_id.is_empty() {
        if let Some(poster_url) = scraped
            .poster_url
            .clone()
            .filter(|u| !u.trim().is_empty())
        {
            let attempt = tokio::time::timeout(
                std::time::Duration::from_secs(POSTER_CACHE_TIMEOUT_SECS),
                cache_poster_locally(&app_handle, &imdb_id, &poster_url),
            )
            .await;
            match attempt {
                Ok(Ok(path)) => scraped.poster_local_path = Some(path),
                Ok(Err(e)) => crate::logger::Logger::warn(&format!(
                    "Poster caching skipped for {}: {}",
                    imdb_id, e
                )),
                Err(_) => crate::logger::Logger::warn(&format!(
                    "Poster caching timed out after {}s for {}",
                    POSTER_CACHE_TIMEOUT_SECS, imdb_id
                )),
            }
        }
    }

    Ok(scraped)
}

/**
 * Download one poster into `<app cache dir>/posters/<imdb_id>.jpg`.
 * Best-effort helper for [`extract_imdb`]; every failure mode returns Err so
 * the caller can log and continue with `poster_local_path = None`.
 * `imdb_id` is always a validated `tt\d{7,10}` token, so the filename is safe.
 */
async fn cache_poster_locally(
    app_handle: &AppHandle,
    imdb_id: &str,
    poster_url: &str,
) -> Result<String, String> {
    use tauri::Manager;
    use tokio::io::AsyncWriteExt;

    let posters_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cannot resolve app cache dir: {}", e))?
        .join("posters");
    tokio::fs::create_dir_all(&posters_dir)
        .await
        .map_err(|e| format!("Failed to create poster cache dir: {}", e))?;

    // Same UA pattern as the update installer download in this module.
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

/**
 * Import a LOCAL poster image (Original Screenplays flow) into the manual
 * posters cache. Validates the extension, enforces an 8 MiB ceiling, then
 * copies the file to `<app_cache_dir>/posters/manual_<uuid>.<ext>` so user
 * artwork can never collide with scraped `<imdbId>.jpg` entries.
 *
 * Returns the destination path string; every failure mode is Err(String).
 */
#[tauri::command]
pub async fn import_poster_asset(source_path: String, app_handle: AppHandle) -> Result<String, String> {
    use tauri::Manager;

    // 1. Extension whitelist (case-insensitive).
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

    // 2. Size ceiling: read via tokio so a huge selection fails fast,
    // before any bytes are copied.
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

    // 3. Resolve the SAME posters dir used by cache_poster_locally.
    let posters_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cannot resolve app cache dir: {}", e))?
        .join("posters");
    tokio::fs::create_dir_all(&posters_dir)
        .await
        .map_err(|e| format!("Failed to create poster cache dir: {}", e))?;

    // 4. Copy under a collision-proof uuid name.
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
pub async fn generate_ai_summary(
    mut request: InferenceRequest,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
    monitor: State<'_, HardwareMonitor>,
    app_handle: AppHandle,
) -> Result<InferenceResponse, String> {
    crate::logger::Logger::info(&format!("Generating AI Summary for prompt: {:.60}...", request.prompt));

    // â”€â”€ Inject persisted user preferences when the request omits them â”€â”€â”€â”€
    // The settings read is a blocking SQLite call - route it through
    // spawn_blocking like every other DB touchpoint.
    if let Some(settings) = load_stored_settings(&repo).await {
        if request.temperature.is_none() {
            request.temperature = settings
                .get("temperature")
                .and_then(|t| t.as_f64())
                .map(|t| t as f32);
        }
        if request.gpu_layers.is_none() {
            request.gpu_layers = match settings.get("inferenceMode").and_then(|m| m.as_str()) {
                // 'cpu_only' pins inference to the CPU...
                Some("cpu_only") => Some(0),
                // ...gpu_auto / unset derives a SAFE layer count from live
                // VRAM telemetry instead of blindly offloading ALL layers
                // (which hard-crashes low-VRAM GPUs on larger models).
                _ => {
                    let active_model_mb = engine
                        .get_vault_status()
                        .models
                        .iter()
                        .find(|m| m.is_active)
                        .map(|m| m.file_size_mb)
                        .unwrap_or(1500);
                    let telemetry = monitor.sample_telemetry(false, active_model_mb);
                    Some(telemetry.gpu_layers_offloaded as i64)
                }
            };
        }
    }

    // Check if active model file is on disk
    let status = engine.get_vault_status();
    let active_item = status.models.iter().find(|m| m.is_active);

    if let Some(item) = active_item {
        if !item.is_installed {
            crate::logger::Logger::warn(&format!("Active model '{}' is not installed. Initiating resilient first-use auto-download...", item.id));

            // 1. Check internet connectivity first
            if !ModelDownloader::is_internet_connected().await {
                let err_msg = "OFFLINE_NO_INTERNET: Cannot initialize local AI model without an internet connection. Please connect to download Llama 3.2 1B (808 MB) or import a local .GGUF in the Model Vault.".to_string();
                crate::logger::Logger::warn(&err_msg);
                return Err(err_msg);
            }

            // 2. Download with 5 retries
            let vault_dir = engine.get_vault_dir();
            let handle = app_handle.clone();
            let filename = item.filename.clone();
            let download_url = item.download_url.clone();
            let sha256 = item.sha256.clone();

            ModelDownloader::download_gguf_model(
                &download_url,
                &vault_dir,
                &filename,
                &sha256,
                move |progress| {
                    let _ = handle.emit("model_download_progress", progress);
                },
            ).await?;
        }
    }

    // â”€â”€ Streaming: forward every generated piece to the webview tagged with
    // the request's clientId, so only the OWNING useAISummary instance
    // consumes the stream (the event bus is global).
    let sink_handle = app_handle.clone();
    let client_tag = request.client_id.clone().unwrap_or_default();
    let token_sink: crate::ai::engine::TokenSink =
        std::sync::Arc::new(move |piece: &str| {
            let _ = sink_handle.emit(
                "ai:token",
                serde_json::json!({ "clientId": client_tag, "piece": piece }),
            );
        });

    engine.run_inference(request, Some(token_sink)).await
}

#[tauri::command]
pub async fn get_model_vault_status(engine: State<'_, LocalAIEngine>) -> Result<ModelVaultStatus, String> {
    Ok(engine.get_vault_status())
}

#[tauri::command]
pub async fn set_active_ai_model(model_id: String, engine: State<'_, LocalAIEngine>) -> Result<bool, String> {
    // Reject unknown model ids so the UI can never "activate" a phantom entry.
    let known = engine.get_supported_models().iter().any(|m| m.id == model_id);
    if !known {
        return Err(format!("Unknown model ID: {}", model_id));
    }
    engine.set_active_model(&model_id);
    Ok(true)
}

#[tauri::command]
pub async fn download_ai_model(
    model_id: String,
    engine: State<'_, LocalAIEngine>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let supported = engine.get_supported_models();
    let meta = supported.into_iter().find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unknown model ID: {}", model_id))?;

    let vault_dir = engine.get_vault_dir();
    let handle = app_handle.clone();

    let target = ModelDownloader::download_gguf_model(
        &meta.download_url,
        &vault_dir,
        &meta.filename,
        &meta.sha256_checksum,
        move |progress| {
            let _ = handle.emit("model_download_progress", progress);
        },
    ).await?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_media_entry(
    media: MediaRecord,
    repo: State<'_, std::sync::Arc<Repository>>
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

/// Permanently delete one media entry by id. Returns true when a row was removed.
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

/// Restore media rows from an export JSON. Fully transactional - any bad row
/// aborts the entire restore with a descriptive error.
#[tauri::command]
pub async fn import_database_json(
    json_content: String,
    repo: State<'_, std::sync::Arc<Repository>>
) -> Result<bool, String> {
    let parsed: FullDatabaseExport = serde_json::from_str(&json_content)
        .map_err(|e| format!("Invalid JSON schema: {}", e))?;

    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.import_media_transactional(&parsed.media)
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

#[tauri::command]
pub async fn app_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn app_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/**
 * Graceful shutdown via the custom titlebar close button. `window.close()`
 * runs the normal Tauri teardown path (CloseRequested listeners, webview
 * destruction, runtime exit) instead of the previous hard
 * `destroy()` + `process::exit(0)`, which skipped cleanup entirely.
 */
#[tauri::command]
pub async fn app_close(window: tauri::Window) -> Result<(), String> {
    crate::logger::Logger::info("Closing CineVault: flushing final log entries before window close.");
    window.close().map_err(|e| e.to_string())
}

/// Sanitize an installer filename down to a safe portable subset.
fn sanitize_installer_filename(filename: &str) -> Option<String> {
    let cleaned: String = filename
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    if cleaned.is_empty() || cleaned.starts_with('.') {
        return None;
    }
    Some(cleaned)
}

/// Path prefix every official installer URL must carry under the release
/// host. Compared case-insensitively.
const ALLOWED_UPDATE_PATH_PREFIX: &str = "/ghostbat101/cinevault/releases/download/";

/// Validate that an installer URL points at an allow-listed release host AND
/// at the official CineVault release-download path on it. Blocks lookalike
/// hosts and same-host paths that merely resemble the release route.
fn validate_installer_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url)
        .map_err(|_| "Invalid installer URL".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Installer download must use HTTPS".to_string());
    }
    let host = parsed.host_str().unwrap_or_default().to_lowercase();
    if !ALLOWED_UPDATE_HOSTS.contains(&host.as_str()) {
        return Err(format!("Installer host '{}' is not an allowed update source", host));
    }
    // Case-insensitive path check: only the official release download route
    // may serve installers, even on otherwise allow-listed hosts.
    let path = parsed.path().to_lowercase();
    if !path.starts_with(ALLOWED_UPDATE_PATH_PREFIX) {
        return Err(
            "Installer URL must point at GhostBat101/CineVault's official release download path"
                .to_string(),
        );
    }
    Ok(())
}

/// Download the update installer from an allow-listed GitHub release asset and
/// spawn it. The filename is sanitized before it ever touches the filesystem.
#[tauri::command]
pub async fn download_and_install_update(
    installer_url: String,
    filename: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    use tokio::io::AsyncWriteExt;
    use futures_util::StreamExt;

    // Security gate 1: only official release hosts.
    validate_installer_url(&installer_url)?;

    // Security gate 2: strict filename whitelist (blocks traversal/injection).
    let safe_filename = sanitize_installer_filename(&filename)
        .ok_or_else(|| "Invalid installer filename".to_string())?;
    let safe_filename = if safe_filename.ends_with(".exe") {
        safe_filename
    } else {
        format!("{}.exe", safe_filename)
    };

    crate::logger::Logger::info(&format!("Starting download of update installer from {}", installer_url));

    let temp_dir = std::env::temp_dir();
    let target_path = temp_dir.join(&safe_filename);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(15))
        .tcp_keepalive(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&installer_url).send().await
        .map_err(|e| format!("Failed to initiate installer download: {}", e))?;

    // After redirects, re-validate the final host (CDN hops must stay allow-listed).
    if let Some(final_host) = response.url().host_str() {
        let host = final_host.to_lowercase();
        if !ALLOWED_UPDATE_HOSTS.contains(&host.as_str()) {
            return Err(format!("Redirected to non-allow-listed host '{}'", host));
        }
    }

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&target_path).await
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = response.bytes_stream();
    let start_time = std::time::Instant::now();
    let mut last_emit_time = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                file.write_all(&chunk).await.map_err(|e| format!("Disk write error: {}", e))?;
                downloaded_bytes += chunk.len() as u64;
                let elapsed = start_time.elapsed().as_secs_f32().max(0.1);
                let speed_mbps = ((downloaded_bytes as f32) / (1024.0 * 1024.0)) / elapsed;
                let percentage = if total_bytes > 0 {
                    ((downloaded_bytes as f32 / total_bytes as f32) * 100.0).min(100.0)
                } else {
                    0.0
                };

                if last_emit_time.elapsed().as_millis() >= 80 {
                    let _ = app_handle.emit("app_update_progress", serde_json::json!({
                        "downloadedBytes": downloaded_bytes,
                        "totalBytes": total_bytes,
                        "percentage": percentage,
                        "speedMbps": speed_mbps,
                        "isCompleted": false
                    }));
                    last_emit_time = std::time::Instant::now();
                }
            }
            Err(e) => return Err(format!("Download interrupted: {}", e)),
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {}", e))?;

    let _ = app_handle.emit("app_update_progress", serde_json::json!({
        "downloadedBytes": downloaded_bytes,
        "totalBytes": total_bytes,
        "percentage": 100.0,
        "speedMbps": 0.0,
        "isCompleted": true
    }));

    crate::logger::Logger::info(&format!("Installer downloaded to {:?}. Spawning setup wizard...", target_path));

    // Spawn the installer
    std::process::Command::new(&target_path)
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {}", e))?;

    // Exit through the Tauri runtime: AppHandle::exit posts the exit event
    // through the event loop so cleanup hooks (incl. SQLite WAL shutdown on
    // teardown) still run - the previous std::process::exit(0) skipped ALL
    // of that. The explicit Ok(true) keeps the tail-expression warning-free.
    app_handle.exit(0);
    Ok(true)
}
