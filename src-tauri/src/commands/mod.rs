use tauri::State;
use crate::telemetry::hardware::{TelemetryData, HardwareMonitor};
use crate::scraper::imdb::{ScrapedMedia, ImdbScraper};
use crate::ai::engine::{InferenceRequest, InferenceResponse, LocalAIEngine};
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
    
    // In a full implementation, we'd loop through parsed.media and insert them.
    for media in parsed.media {
        let _ = repo.insert_media(&media);
    }
    
    Ok(true)
}
