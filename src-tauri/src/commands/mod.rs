//! Commands module root.
//! Purpose: Organizes and re-exports all Tauri IPC commands registered in lib.rs invoke_handler.
//! Communication Matrix: Submodules ai, director, media, telemetry, updater re-exported to src-tauri/src/lib.rs.

pub mod ai;
pub mod director;
pub mod media;
pub mod telemetry;
pub mod updater;

pub use ai::*;
pub use director::*;
pub use media::*;
pub use telemetry::*;
pub use updater::*;
