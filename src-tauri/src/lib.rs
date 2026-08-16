use tauri::Manager;
use std::fs;

pub mod db;
pub mod scraper;
pub mod ai;
pub mod telemetry;
pub mod commands;
pub mod logger;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // PORTABLE MODE: Resolve the directory where CineVault.exe lives, rather than %APPDATA%
            let exe_path = std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let app_data_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new(".")).to_path_buf();
            
            // 1. Portable Logging Directory
            let logs_dir = app_data_dir.join("logs");
            let _ = logger::Logger::init(&logs_dir);
            logger::Logger::info(&format!("CineVault Booting. Base Directory: {:?}", app_data_dir));

            // 2. Database
            let db_path = app_data_dir.join("cinevault.db");
            logger::Logger::info(&format!("Initializing SQLite Database at {:?}", db_path));
            let repo = db::repository::Repository::new(&db_path).expect("Failed to initialize database");
            repo.init().expect("Failed to create tables");
            app.manage(repo);

            // 3. Telemetry
            let hardware_monitor = telemetry::hardware::HardwareMonitor::new();
            app.manage(hardware_monitor);

            // 4. AI Models Directory
            let models_dir = app_data_dir.join("models");
            fs::create_dir_all(&models_dir).unwrap_or_default();
            logger::Logger::info(&format!("Mounting AI Models Vault at {:?}", models_dir));
            let ai_engine = ai::engine::LocalAIEngine::new(models_dir);
            app.manage(ai_engine);

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_telemetry,
            commands::extract_imdb,
            commands::generate_ai_summary,
            commands::get_model_vault_status,
            commands::set_active_ai_model,
            commands::download_ai_model,
            commands::save_media_entry,
            commands::get_all_media,
            commands::export_database_json,
            commands::import_database_json,
            commands::app_minimize,
            commands::app_maximize,
            commands::app_close,
            commands::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineVault desktop application");
}
