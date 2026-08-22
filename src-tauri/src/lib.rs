//! src-tauri/src/lib.rs
//! ─────────────────────────────────────────────────────────────
//! WHAT: Application entry point. Boots the Tauri v2 host: portable-mode
//!       directory resolution, logger init, SQLite repository init,
//!       telemetry monitor and local AI engine construction, then wires
//!       every command into the invoke handler.
//!
//! DESIGN NOTES:
//!   - PORTABLE MODE: everything (logs, DB, models) lives next to the
//!     executable rather than %APPDATA%, so the app runs from any folder.
//!   - The [`db::repository::Repository`] is managed as an `std::sync::Arc`
//!     so blocking SQLite calls can be cloned into
//!     `tauri::async_runtime::spawn_blocking` workers without holding a
//!     `State<'_>` borrow across an await point.
//!   - Schema creation/migration happens exactly once here via
//!     `Repository::run_migrations` (PRAGMA user_version driven).
//!
//! USES:    db::repository, telemetry::hardware, ai::engine, commands, logger.
//! USED BY: src-tauri/src/main.rs (calls cinevault_lib::run()).

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
            repo.run_migrations().expect("Failed to run database migrations");
            // Arc-managed: DB commands clone this handle into spawn_blocking workers.
            app.manage(std::sync::Arc::new(repo));

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
            commands::get_app_settings,
            commands::save_app_settings,
            commands::generate_ai_summary,
            commands::get_model_vault_status,
            commands::set_active_ai_model,
            commands::download_ai_model,
            commands::save_media_entry,
            commands::get_all_media,
            commands::delete_media_entry,
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
