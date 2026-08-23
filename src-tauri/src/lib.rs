//! src-tauri/src/lib.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Application entry point. Boots the Tauri v2 host: portable-mode
//!   directory resolution, logger init, SQLite repository init,
//!   telemetry monitor and local AI engine construction, then wires
//!   every command into the invoke handler.
//!
//! DESIGN NOTES:
//!   - PORTABLE MODE: everything (logs, DB, models) lives next to the
//!   executable rather than %APPDATA%, so the app runs from any folder.
//!   EXCEPTION: when that directory is not writable (Program Files installs,
//!   AV-locked dirs), boot falls back to the OS per-user app-data dir via a
//!   create+delete probe-file check - see [`dir_is_writable`].
//!   - The [`db::repository::Repository`] is managed as an `std::sync::Arc`
//!   so blocking SQLite calls can be cloned into
//!   `tauri::async_runtime::spawn_blocking` workers without holding a
//!   `State<'_>` borrow across an await point.
//!   - Schema creation/migration happens exactly once here via
//!   `Repository::run_migrations` (PRAGMA user_version driven).
//!
//! USES:    db::repository, telemetry::hardware, ai::engine, commands, logger.
//! USED BY: src-tauri/src/main.rs (calls cinevault_lib::run()).

use tauri::Manager;
use std::fs;
use std::path::Path;

pub mod db;
pub mod scraper;
pub mod ai;
pub mod telemetry;
pub mod commands;
pub mod logger;

/// Probe whether `dir` accepts writes by creating and removing a marker
/// file. Any failure along the way means the directory is unusable as the
/// portable base (read-only volume, permission denied, ...).
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
            // PORTABLE MODE: default base is the directory holding
            // CineVault.exe (logs/, cinevault.db and models/ all live beside
            // it). Installs under write-protected locations must not crash
            // boot: probe writability FIRST and fall back to the OS per-user
            // app-data dir when the probe fails.
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

            // 1. Logging Directory (inside whichever base won)
            let logs_dir = base_dir.join("logs");
            let _ = logger::Logger::init(&logs_dir);
            logger::Logger::info(&format!(
                "CineVault Booting. Base Directory: {:?} ({})",
                base_dir, base_dir_source
            ));

            // 2. Database
            // DB failures abort boot through the returned Err (Tauri supports
            // Err from setup) with clear user-facing text instead of a panic.
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
            // Arc-managed: DB commands clone this handle into spawn_blocking workers.
            app.manage(std::sync::Arc::new(repo));

            // 3. Telemetry
            let hardware_monitor = telemetry::hardware::HardwareMonitor::new();
            app.manage(hardware_monitor);

            // 4. AI Models Directory
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
            commands::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineVault desktop application");
}
