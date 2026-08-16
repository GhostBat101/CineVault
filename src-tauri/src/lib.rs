use tauri::Manager;
use std::fs;

pub mod db;
pub mod scraper;
pub mod ai;
pub mod telemetry;
pub mod commands;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
            
            let db_path = app_data_dir.join("cinevault.db");
            let repo = db::repository::Repository::new(&db_path).expect("Failed to initialize database");
            repo.init().expect("Failed to create tables");
            app.manage(repo);

            let hardware_monitor = telemetry::hardware::HardwareMonitor::new();
            app.manage(hardware_monitor);

            let models_dir = app_data_dir.join("models");
            fs::create_dir_all(&models_dir).unwrap_or_default();
            let ai_engine = ai::engine::LocalAIEngine::new(models_dir);
            app.manage(ai_engine);

            Ok(())
        })
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
