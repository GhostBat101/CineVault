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
    engine: State<'_, LocalAIEngine>
) -> Result<InferenceResponse, String> {
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
