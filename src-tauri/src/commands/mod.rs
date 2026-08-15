use crate::telemetry::hardware::TelemetryData;
use crate::scraper::imdb::ScrapedMedia;
use crate::ai::engine::{InferenceRequest, InferenceResponse};

#[tauri::command]
pub async fn get_telemetry() -> Result<TelemetryData, String> {
    Ok(TelemetryData {
        cpu_usage_percent: 4.2,
        ram_used_mb: 1240,
        ram_total_mb: 16384,
        gpu_name: Some("DirectX 12 / Dedicated GPU".to_string()),
        vram_used_mb: 1120,
        vram_total_mb: 2048,
        is_vram_critical: false,
        active_offload_mode: "gpu_auto".to_string(),
        gpu_layers_offloaded: 28,
        total_gpu_layers: 28,
    })
}

#[tauri::command]
pub async fn extract_imdb(imdb_url: String) -> Result<ScrapedMedia, String> {
    // Stub for initial scaffolding
    Ok(ScrapedMedia {
        imdb_id: "tt1375666".to_string(),
        title: "Inception".to_string(),
        original_title: Some("Inception".to_string()),
        year: Some(2010),
        runtime_minutes: Some(148),
        imdb_rating: Some(8.8),
        poster_url: Some("https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg".to_string()),
        synopsis: Some("A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.".to_string()),
        genres: vec!["Action".to_string(), "Sci-Fi".to_string(), "Thriller".to_string()],
        directors: vec!["Christopher Nolan".to_string()],
        cast_members: vec![],
    })
}

#[tauri::command]
pub async fn generate_ai_summary(request: InferenceRequest) -> Result<InferenceResponse, String> {
    Ok(InferenceResponse {
        generated_text: format!("AI Analysis for: {}", request.prompt),
        model_used: "Llama-3.2-1B-Instruct-Q4_K_M".to_string(),
        total_tokens: 142,
    })
}

#[tauri::command]
pub async fn save_media_entry(media_json: String) -> Result<String, String> {
    Ok(format!("Saved entry: {}", media_json))
}

#[tauri::command]
pub async fn get_all_media() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn export_database_json() -> Result<String, String> {
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn import_database_json(_json_content: String) -> Result<bool, String> {
    Ok(true)
}
