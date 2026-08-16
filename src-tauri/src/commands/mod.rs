use tauri::{AppHandle, Emitter, State};
use crate::telemetry::hardware::{TelemetryData, HardwareMonitor};
use crate::scraper::imdb::{ScrapedMedia, ImdbScraper};
use crate::ai::engine::{InferenceRequest, InferenceResponse, LocalAIEngine, ModelVaultStatus};
use crate::ai::downloader::ModelDownloader;
use crate::db::repository::{MediaRecord, FullDatabaseExport, Repository};

#[tauri::command]
pub async fn get_telemetry(monitor: State<'_, HardwareMonitor>) -> Result<TelemetryData, String> {
    // For now, assume model size of 1500MB (1.5B param Q4) and false for CPU forced mode
    Ok(monitor.sample_telemetry(false, 1500))
}

#[tauri::command]
pub async fn extract_imdb(imdb_url: Option<String>, imdbUrl: Option<String>) -> Result<ScrapedMedia, String> {
    let target = imdb_url.or(imdbUrl).ok_or_else(|| "No IMDb URL or ID provided".to_string())?;
    ImdbScraper::scrape_url(&target).await
}

#[tauri::command]
pub async fn generate_ai_summary(
    request: InferenceRequest,
    engine: State<'_, LocalAIEngine>,
    app_handle: AppHandle,
) -> Result<InferenceResponse, String> {
    crate::logger::Logger::info(&format!("Generating AI Summary for prompt: {:.60}...", request.prompt));
    
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
    
    engine.run_inference(request).await
}

#[tauri::command]
pub async fn get_model_vault_status(engine: State<'_, LocalAIEngine>) -> Result<ModelVaultStatus, String> {
    Ok(engine.get_vault_status())
}

#[tauri::command]
pub async fn set_active_ai_model(model_id: String, engine: State<'_, LocalAIEngine>) -> Result<bool, String> {
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
    repo: State<'_, Repository>
) -> Result<String, String> {
    repo.insert_media(&media).map_err(|e| e.to_string())?;
    Ok(format!("Successfully saved media: {}", media.title))
}

#[tauri::command]
pub async fn get_all_media(repo: State<'_, Repository>) -> Result<Vec<MediaRecord>, String> {
    repo.get_all_media().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_database_json(repo: State<'_, Repository>) -> Result<String, String> {
    let export = repo.export_full_database().map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_database_json(
    json_content: String,
    repo: State<'_, Repository>
) -> Result<bool, String> {
    let parsed: FullDatabaseExport = serde_json::from_str(&json_content)
        .map_err(|e| format!("Invalid JSON schema: {}", e))?;
    
    for media in parsed.media {
        let _ = repo.insert_media(&media);
    }
    
    Ok(true)
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

#[tauri::command]
pub async fn app_close(window: tauri::Window) -> Result<(), String> {
    crate::logger::Logger::info("Closing CineVault via titlebar close button.");
    let _ = window.destroy();
    std::process::exit(0);
}

#[tauri::command]
pub async fn download_and_install_update(
    installer_url: String,
    filename: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    use tokio::io::AsyncWriteExt;
    use futures_util::StreamExt;

    crate::logger::Logger::info(&format!("Starting download of update installer from {}", installer_url));
    
    let temp_dir = std::env::temp_dir();
    let safe_filename = if filename.ends_with(".exe") { filename } else { format!("{}.exe", filename) };
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

    // Exit current app so setup can proceed
    std::process::exit(0);
}
