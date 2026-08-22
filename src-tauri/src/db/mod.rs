//! db/mod.rs
//! ─────────────────────────────────────────────────────────────
//! WHAT: Database module root. Re-exports [`repository::Repository`],
//!       the single owner of the SQLite connection and ALL persistence
//!       logic (schema migrations, CRUD, settings store, import/export).
//!
//! DESIGN NOTES:
//!   - `Repository::run_migrations` (db/repository.rs) is THE one migration
//!     entry point. Schema versioning is tracked with SQLite's built-in
//!     `PRAGMA user_version`, so future migrations slot into a simple
//!     ascending match ladder there.
//!   - The former `DatabaseManager` struct and static `INITIAL_SCHEMA`
//!     string lived here; both were deleted because they duplicated
//!     repository state, created a second migration path, and had no
//!     callers. Do not reintroduce parallel schema definitions.
//!
//! USES:    db::repository.
//! USED BY: src-tauri/src/lib.rs (constructs + manages Repository),
//!          src-tauri/src/commands/mod.rs (DB commands).

pub mod repository;

pub use repository::*;
