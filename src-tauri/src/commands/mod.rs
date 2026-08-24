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
use crate::ai::engine::{
    InferenceRequest, InferenceResponse, LocalAIEngine, ModelStatusItem, ModelVaultStatus,
};
use crate::ai::downloader::ModelDownloader;
use crate::ai::models::ModelMetadata;
use crate::db::repository::{FullDatabaseExport, MediaRecord, Repository};
use sha2::{Digest, Sha256};

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

/**
 * Persisted shape of one user-imported GGUF under app_settings key
 * `customModels` (camelCase on the wire). Defaults keep older entries
 * parseable when new fields are introduced.
 */
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomModelEntry {
    pub id: String,
    pub name: String,
    pub filename: String,
    #[serde(default = "default_custom_context_length")]
    pub context_length: u32,
    #[serde(default = "default_custom_prompt_format")]
    pub prompt_format: String,
}

fn default_custom_context_length() -> u32 {
    4096
}

fn default_custom_prompt_format() -> String {
    "chatml".to_string()
}

/**
 * Read persisted `customModels` from settings (blocking SQLite via
 * spawn_blocking) and install them into the engine catalog. Must run BEFORE
 * any consumer of [`LocalAIEngine::effective_catalog`] in a command:
 * vault status, activation checks, and inference lookup all include customs.
 */
async fn hydrate_custom_models(
    repo: &State<'_, std::sync::Arc<Repository>>,
    engine: &State<'_, LocalAIEngine>,
) {
    let entries: Vec<CustomModelEntry> = load_stored_settings(repo)
        .await
        .and_then(|settings| settings.get("customModels").cloned())
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();

    let vault_dir = engine.get_vault_dir();
    let mut metas = Vec::with_capacity(entries.len());
    for entry in entries {
        // Disk size feeds the VRAM budget model; a missing file degrades to
        // 0 MB rather than blocking status rendering.
        let file_size_mb = tokio::fs::metadata(vault_dir.join(&entry.filename))
            .await
            .map(|meta| meta.len() / (1024 * 1024))
            .unwrap_or(0);
        metas.push(ModelMetadata {
            id: entry.id.clone(),
            name: entry.name.clone(),
            parameter_size: "Unknown".to_string(),
            quantization: "GGUF".to_string(),
            file_size_mb,
            download_url: String::new(),
            filename: entry.filename.clone(),
            sha256_checksum: String::new(),
            context_length: entry.context_length as usize,
            is_default: false,
            prompt_format: entry.prompt_format.clone(),
        });
    }

    engine.set_custom_models(metas);
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

    // CPU-forced detection: modern `inferenceMode: "cpu_only"` OR the legacy
    // boolean `forcedCpuMode`. Read through the blocking pool like every
    // other DB touchpoint; absent/unparsed settings mean GPU-auto (false).
    let forced_cpu_mode = load_stored_settings(&repo)
        .await
        .map(|settings| {
            let legacy_flag = settings
                .get("forcedCpuMode")
                .or_else(|| settings.get("forced_cpu_mode"))
                .and_then(|flag| flag.as_bool())
                .unwrap_or(false);
            let cpu_only_mode =
                settings.get("inferenceMode").and_then(|mode| mode.as_str()) == Some("cpu_only");
            cpu_only_mode || legacy_flag
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
pub async fn extract_imdb(
    imdb_url: String,
    repo: State<'_, std::sync::Arc<Repository>>,
    app_handle: AppHandle,
) -> Result<ScrapedMedia, String> {
    let mut scraped = ImdbScraper::scrape_url(&imdb_url).await?;

    // ── Optional OMDb enrichment ────────────────────────────────────────────
    // IMDb's HTML page is bot-walled, so the fields its JSON-LD used to carry
    // (rating/runtime/genres/directors) are unavailable from the suggestion
    // API. When the user has saved an OMDb API key (free tier), overlay those
    // fields here. Absent key = silently skip (suggestion data still stands).
    if let Some(api_key) = load_stored_settings(&repo)
        .await
        .and_then(|settings| settings.get("omdbApiKey").cloned())
        .and_then(|value| value.as_str().map(|s| s.trim().to_string()))
        .filter(|key| !key.is_empty())
    {
        match enrich_from_omdb(&scraped.imdb_id, &api_key).await {
            Ok(omdb) => merge_omdb_enrichment(&mut scraped, omdb),
            Err(e) => crate::logger::Logger::warn(&format!(
                "OMDb enrichment skipped for {}: {}",
                scraped.imdb_id, e
            )),
        }
    }

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

/// Raw fields we consume from an OMDb title response. OMDb emits PascalCase
/// keys EXCEPT its imdb* family (lowercase i) - hence the explicit rename.
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

/// "148 min" -> Some(148); anything unparsable -> None.
fn parse_omdb_runtime(runtime: &str) -> Option<i32> {
    runtime
        .split_whitespace()
        .next()
        .and_then(|token| token.parse::<i32>().ok())
}

/// Overlay OMDb data onto the scraped base. OMDb wins only where the base is
/// missing/thin; the base is never degraded (same philosophy as the scraper's
/// HTML-enrichment merge).
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

/// Query OMDb by IMDb id. Any network/parse failure returns Err and the
/// caller logs-and-continues - enrichment must never break extraction.
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

    // OMDb signals failure in-band: {"Response":"False","Error":"..."}
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

    // Custom GGUF models must be visible to vault status + inference lookup.
    hydrate_custom_models(&repo, &engine).await;

    // â”€â”€ SAFE VRAM clamp - computed UNCONDITIONALLY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // When the request omits gpu_layers we derive a safe offload count from
    // live VRAM telemetry REGARDLESS of whether any settings blob exists yet
    // (fresh installs). Absence of settings must never fall through to the
    // engine's "-1 = offload all" path, which hard-crashes low-VRAM GPUs.
    if request.gpu_layers.is_none() {
        let active_model_mb = engine
            .get_vault_status()
            .models
            .iter()
            .find(|m| m.is_active)
            .map(|m| m.file_size_mb)
            .unwrap_or(1500);
        let telemetry = monitor.sample_telemetry(false, active_model_mb);
        request.gpu_layers = Some(telemetry.gpu_layers_offloaded as i64); // safe count
    }

    // â”€â”€ Inject persisted user preferences when the request omits them â”€â”€â”€â”€
    // The settings read is a blocking SQLite call - route it through
    // spawn_blocking like every other DB touchpoint. Settings may only
    // OVERRIDE the computed clamp above: cpu_only pins to zero layers, an
    // explicit user layer count wins; anything else keeps the safe count.
    if let Some(settings) = load_stored_settings(&repo).await {
        if request.temperature.is_none() {
            request.temperature = settings
                .get("temperature")
                .and_then(|t| t.as_f64())
                .map(|t| t as f32);
        }
        match settings.get("inferenceMode").and_then(|mode| mode.as_str()) {
            // 'cpu_only' pins inference to the CPU...
            Some("cpu_only") => request.gpu_layers = Some(0),
            _ => {
                if let Some(user_layers) =
                    settings.get("gpuLayers").and_then(|layers| layers.as_i64())
                {
                    request.gpu_layers = Some(user_layers);
                }
            }
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
pub async fn get_model_vault_status(
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<ModelVaultStatus, String> {
    // Persisted custom models join the static catalog in the response.
    hydrate_custom_models(&repo, &engine).await;
    Ok(engine.get_vault_status())
}

#[tauri::command]
pub async fn set_active_ai_model(
    model_id: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    // Reject unknown model ids so the UI can never "activate" a phantom entry.
    // Customs count as known once hydrated.
    hydrate_custom_models(&repo, &engine).await;
    if !engine.is_known_model(&model_id) {
        return Err(format!("Unknown model ID: {}", model_id));
    }
    engine.set_active_model(&model_id);
    Ok(true)
}

#[tauri::command]
pub async fn download_ai_model(
    model_id: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    hydrate_custom_models(&repo, &engine).await;

    // Lookup stays on the STATIC catalog only: customs are already on disk
    // and have no download URL - they can never be "downloaded".
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

/**
 * Import a LOCAL .gguf file into the Model Vault end-to-end (Wave-3 C1):
 * validate GGUF magic bytes, copy into the vault under a sanitized unique
 * filename, persist metadata into the `customModels` settings array
 * (read-merge via spawn_blocking), hydrate the engine catalog and return
 * the full catalog-style status item for the new model.
 */
#[tauri::command]
pub async fn import_custom_model(
    source_path: String,
    display_name: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<ModelStatusItem, String> {
    use tokio::io::AsyncReadExt;

    // 1. Magic-byte validation: a real GGUF always starts with "GGUF".
    const GGUF_MAGIC: [u8; 4] = [0x47, 0x47, 0x55, 0x46]; // 'G' 'G' 'U' 'F'
    let mut source = tokio::fs::File::open(&source_path)
        .await
        .map_err(|e| format!("Cannot open source file: {}", e))?;
    let mut magic = [0u8; 4];
    source
        .read_exact(&mut magic)
        .await
        .map_err(|e| format!("File too small to be a GGUF model: {}", e))?;
    drop(source);
    if magic != GGUF_MAGIC {
        return Err(format!(
            "NOT_A_GGUF_FILE: '{}' lacks the GGUF magic header",
            display_name.trim()
        ));
    }

    // 2. Filename derivation: sanitized displayName + lowercased source
    // extension (.gguf default), collision-proofed with _2/_3 suffixes.
    let source_extension = std::path::Path::new(&source_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{}", ext.to_ascii_lowercase()))
        .unwrap_or_else(|| ".gguf".to_string());
    let sanitized_base: String = display_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    let trimmed_base = sanitized_base.trim_matches('.').to_string();
    let base = if trimmed_base.is_empty() {
        "custom-model".to_string()
    } else {
        trimmed_base
    };

    let vault_dir = engine.get_vault_dir();
    tokio::fs::create_dir_all(&vault_dir)
        .await
        .map_err(|e| format!("Failed to create Model Vault dir: {}", e))?;

    let mut candidate_filename = format!("{}{}", base, source_extension);
    let mut suffix = 2u32;
    while vault_dir.join(&candidate_filename).exists() {
        candidate_filename = format!("{}_{}{}", base, suffix, source_extension);
        suffix += 1;
    }

    // 3. Streamed copy into the vault.
    let target_path = vault_dir.join(&candidate_filename);
    tokio::fs::copy(&source_path, &target_path)
        .await
        .map_err(|e| format!("Failed to copy model into the Model Vault: {}", e))?;

    // 4. Persist metadata: READ-MERGE the `customModels` settings array on
    // the blocking pool; entries sharing this id are replaced (idempotent).
    let entry = CustomModelEntry {
        id: format!("custom_{}", uuid::Uuid::new_v4()),
        name: if display_name.trim().is_empty() {
            base.clone()
        } else {
            display_name.trim().to_string()
        },
        filename: candidate_filename.clone(),
        context_length: default_custom_context_length(),
        prompt_format: default_custom_prompt_format(),
    };

    let repo_handle = std::sync::Arc::clone(repo.inner());
    let entry_for_save = entry.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut list: Vec<CustomModelEntry> = repo_handle
            .get_app_settings_json()
            .ok()
            .flatten()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|settings| settings.get("customModels").cloned())
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        list.retain(|existing| existing.id != entry_for_save.id);
        list.push(entry_for_save);

        let patch = serde_json::json!({ "customModels": list });
        let serialized =
            serde_json::to_string(&patch).map_err(|e| format!("Custom model payload not serializable: {}", e))?;
        repo_handle
            .save_app_settings_json(&serialized)
            .map_err(|e| format!("Failed to persist custom model metadata: {}", e))
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))??;

    crate::logger::Logger::info(&format!(
        "Imported custom model '{}' as {} ({})",
        entry.name, entry.id, candidate_filename
    ));

    // 5. Hydrate + return the catalog-style item for this id.
    hydrate_custom_models(&repo, &engine).await;
    engine
        .get_vault_status()
        .models
        .into_iter()
        .find(|item| item.id == entry.id)
        .ok_or_else(|| format!("Imported model '{}' missing from catalog after hydration", entry.id))
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

/**
 * Restore media rows from an export JSON. The embedded SHA-256 checksum is
 * verified (fail-closed) BEFORE any row is written; a mismatch rejects the
 * whole backup with `CHECKSUM_MISMATCH`. Import itself is fully
 * transactional - any bad row aborts the entire restore.
 */
#[tauri::command]
pub async fn import_database_json(
    json_content: String,
    repo: State<'_, std::sync::Arc<Repository>>
) -> Result<bool, String> {
    let parsed: FullDatabaseExport = serde_json::from_str(&json_content)
        .map_err(|e| format!("Invalid JSON schema: {}", e))?;

    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        // Integrity gate: recompute the canonical checksum over the
        // DESERIALIZED document and compare to the embedded digest.
        if !crate::db::repository::verify_export_checksum(&parsed) {
            return Err(
                "CHECKSUM_MISMATCH: backup file integrity verification failed".to_string(),
            );
        }

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

/**
 * Download the update installer from an allow-listed GitHub release asset and
 * spawn it. The filename is sanitized before it ever touches the filesystem.
 *
 * When `expected_sha256` is Some and non-empty (GitHub publishes asset
 * digests), the SHA-256 is computed WHILE streaming and verified fail-closed
 * BEFORE the installer is spawned; a mismatch deletes the temp file and
 * aborts. None/empty skips verification (legacy behavior).
 */
#[tauri::command]
pub async fn download_and_install_update(
    installer_url: String,
    filename: String,
    expected_sha256: Option<String>,
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
    // Streamed hashing: digest is computed chunk-by-chunk while writing so
    // verification never needs a second pass over the file.
    let mut hasher = Sha256::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                hasher.update(&chunk);
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

    // Fail-closed checksum gate BEFORE spawning anything: a mismatched
    // installer is deleted, never executed.
    let expected_digest = expected_sha256
        .as_deref()
        .map(str::trim)
        .filter(|digest| !digest.is_empty());
    if let Some(expected) = expected_digest {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&target_path).await;
            return Err(format!(
                "UPDATE_CHECKSUM_MISMATCH: expected {} got {}",
                expected, actual
            ));
        }
        crate::logger::Logger::info("Update installer SHA-256 verification passed.");
    }

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
