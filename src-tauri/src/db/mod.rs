//! Database module root.
//! Purpose: Organizes SQLite schemas, migrations, domain models, and CRUD operations for media and Director Suite entities.
//! Communication Matrix: Exported to src-tauri/src/lib.rs and src-tauri/src/commands/*.

pub mod director;
pub mod migrations;
pub mod models;
pub mod repository;

pub use repository::*;

