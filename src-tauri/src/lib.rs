pub mod db;
pub mod scraper;
pub mod ai;
pub mod telemetry;
pub mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_telemetry,
            commands::extract_imdb,
            commands::generate_ai_summary,
            commands::save_media_entry,
            commands::get_all_media,
            commands::export_database_json,
            commands::import_database_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineVault desktop application");
}
