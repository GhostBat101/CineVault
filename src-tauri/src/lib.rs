//! Native desktop host and application bootstrapping entry point.
//! Purpose: Boots Tauri runtime, initializes portable logging and SQLite repository, and registers all invoke handlers.
//! Communication Matrix: Main application entry point invoked by src-tauri/src/main.rs; exposes IPC commands to webview.

use tauri::Manager;
use std::fs;
use std::path::Path;

pub mod ai;
pub mod commands;
pub mod db;
pub mod logger;
pub mod scraper;
pub mod telemetry;

fn dir_is_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe_file = dir.join(".cinevault_write_probe");
    match fs::File::create(&probe_file) {
        Ok(_) => {
            let _ = fs::remove_file(&probe_file);
            true
        }
        Err(_) => false,
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let exe_path = std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let exe_dir = exe_path.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();

            let (base_dir, base_dir_source) = if dir_is_writable(&exe_dir) {
                (exe_dir, "portable (beside executable)")
            } else {
                let fallback = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::env::temp_dir().join("CineVault"));
                fs::create_dir_all(&fallback).unwrap_or_default();
                (fallback, "app-data fallback (portable dir not writable)")
            };

            let logs_dir = base_dir.join("logs");
            let _ = logger::Logger::init(&logs_dir);
            logger::Logger::info(&format!(
                "CineVault Booting. Base Directory: {:?} ({})",
                base_dir, base_dir_source
            ));

            let db_path = base_dir.join("cinevault.db");
            logger::Logger::info(&format!("Initializing SQLite Database at {:?}", db_path));
            let repo = db::repository::Repository::new(&db_path).map_err(|e| {
                format!(
                    "CineVault could not open its database at {:?}: {}. \
                     Check that the folder is writable and no other instance is running.",
                    db_path, e
                )
            })?;
            repo.run_migrations().map_err(|e| {
                format!(
                    "CineVault could not prepare its database schema: {}. \
                     Check disk space and folder permissions, then restart.",
                    e
                )
            })?;

            app.manage(std::sync::Arc::new(repo));

            let hardware_monitor = telemetry::hardware::HardwareMonitor::new();
            app.manage(hardware_monitor);

            let models_dir = base_dir.join("models");
            fs::create_dir_all(&models_dir).unwrap_or_default();
            logger::Logger::info(&format!("Mounting AI Models Vault at {:?}", models_dir));
            let ai_engine = ai::engine::LocalAIEngine::new(models_dir);
            app.manage(ai_engine);

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_telemetry,
            commands::extract_imdb,
            commands::import_poster_asset,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::generate_ai_summary,
            commands::get_model_vault_status,
            commands::set_active_ai_model,
            commands::download_ai_model,
            commands::import_custom_model,
            commands::save_media_entry,
            commands::get_all_media,
            commands::delete_media_entry,
            commands::export_database_json,
            commands::import_database_json,
            commands::app_minimize,
            commands::app_maximize,
            commands::app_close,
            commands::download_and_install_update,
            commands::get_characters,
            commands::save_characters,
            commands::get_relationships,
            commands::save_relationships,
            commands::get_beat_sheet,
            commands::save_beat_sheet,
            commands::get_cinematography_cues,
            commands::save_cinematography_cues,
            commands::get_lore_notes,
            commands::save_lore_notes,
            commands::migrate_suite_from_local_storage
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineVault desktop application");
}
