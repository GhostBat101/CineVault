//! db/repository.rs
//! ─────────────────────────────────────────────────────────────
//! WHAT: SQLite persistence layer. Owns the `media` and `app_settings`
//!       tables, provides CRUD + upsert semantics, full-database JSON
//!       export/import, reproducible integrity checksums, and schema
//!       migrations driven by `PRAGMA user_version`.
//!
//! DESIGN NOTES:
//!   - [`Repository::run_migrations`] is the ONE migration entry point.
//!     The applied schema version is stored in SQLite's built-in
//!     `user_version` pragma; new migrations are added as ascending match
//!     arms (`v if v < 2 => ...` and so on) so upgrades apply in order.
//!     Migration 1 additionally attempts a UNIQUE partial index on
//!     media(imdb_id); if legacy duplicate rows block it, boot continues
//!     with a logged warning (application-level dedupe still guards writes).
//!   - All timestamps are ISO-8601 UTC strings produced by [`iso_utc_now`]
//!     (no external chrono dependency; frontend writes the same format).
//!   - Writes use explicit `INSERT ... ON CONFLICT(id) DO UPDATE` upserts -
//!     NOT `INSERT OR REPLACE`, which deletes+reinserts rows and can cascade
//!     unexpected identity changes.
//!   - Ingest dedupe: a second entry carrying an imdb_id that already exists
//!     under a different primary key is REJECTED with a clear error so the
//!     UI can surface it (import bypasses this check intentionally). The
//!     unique index (when present) backstops this at the engine level.
//!   - Import runs inside one transaction; any row failure rolls back the
//!     whole restore and reports the offending row.
//!   - The connection Mutex is poison-tolerant: a panic in one command must
//!     never wedge every later DB call, so locks use
//!     `.lock().unwrap_or_else(|poisoned| poisoned.into_inner())`.
//!
//! USES:    rusqlite (bundled), serde/serde_json, sha2, crate::logger.
//! USED BY: src-tauri/src/lib.rs (managed state),
//!          src-tauri/src/commands/mod.rs (all media/settings/export commands).

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Schema/export version reported by exports - keep in sync with tauri.conf.json.
const EXPORT_FORMAT_VERSION: &str = "0.3";

// ── RECORD STRUCTS (serde camelCase on the wire) ────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRecord {
    pub id: String,
    pub imdb_id: Option<String>,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub media_type: String,
    pub runtime_minutes: Option<i32>,
    pub imdb_rating: Option<f32>,
    pub poster_url: Option<String>,
    pub poster_local_path: Option<String>,
    pub synopsis: Option<String>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub raw_scraped_json: Option<String>,
    pub ai_summary: Option<String>,
    pub ai_model_used: Option<String>,
    pub user_status: String,
    pub user_rating: Option<f32>,
    /// Free-form personal review / notes (migration v2).
    #[serde(default)]
    pub review_notes: Option<String>,
    /// Favorite flag (migration v2). Stored as 0/1.
    #[serde(default)]
    pub is_favorite: bool,
    /// ISO date the item was marked completed (migration v2).
    #[serde(default)]
    pub watched_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRecord {
    pub id: String,
    pub media_id: String,
    pub name: String,
    pub actor_name: Option<String>,
    pub role_type: String,
    pub motivation: Option<String>,
    pub secret_backstory: Option<String>,
    pub avatar_url: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryArcRecord {
    pub id: String,
    pub media_id: String,
    pub parent_arc_id: Option<String>,
    pub title: String,
    pub arc_type: String,
    pub description: Option<String>,
    pub order_index: i32,
    pub is_resolved: bool,
    pub resolution_notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeatSheetRecord {
    pub id: String,
    pub media_id: String,
    pub framework: String,
    pub title: String,
    pub logline: Option<String>,
    pub beats_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipRecord {
    pub id: String,
    pub media_id: String,
    pub source_character_id: String,
    pub target_character_id: String,
    pub relationship_type: String,
    pub tension_score: i32,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CinematographyRecord {
    pub id: String,
    pub media_id: String,
    pub scene_title: String,
    pub dominant_color: Option<String>,
    pub accent_color: Option<String>,
    pub shadow_color: Option<String>,
    pub lighting_style: Option<String>,
    pub lens_choice: Option<String>,
    pub aspect_ratio: Option<String>,
    pub audio_notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRecord {
    pub id: String,
    pub media_id: String,
    pub title: String,
    pub chronological_order: i32,
    pub in_universe_timestamp: Option<String>,
    pub description: Option<String>,
    pub impact_level: String,
    pub involved_character_ids: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreNoteRecord {
    pub id: String,
    pub media_id: String,
    pub character_id: Option<String>,
    pub arc_id: Option<String>,
    pub category: String,
    pub title: String,
    pub content_markdown: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Whole-vault backup document. The checksum is computed over the serialized
/// document with `sha256_checksum` set to "" (see [`Repository::export_full_database`]).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDatabaseExport {
    pub version: String,
    pub exported_at: String,
    pub sha256_checksum: String,
    pub media: Vec<MediaRecord>,
    pub characters: Vec<CharacterRecord>,
    pub story_arcs: Vec<StoryArcRecord>,
    pub beat_sheets: Vec<BeatSheetRecord>,
    pub relationships: Vec<RelationshipRecord>,
    pub cinematography_cues: Vec<CinematographyRecord>,
    pub timeline_events: Vec<TimelineRecord>,
    pub lore_notes: Vec<LoreNoteRecord>,
}

/// Result of a bulk import: accepted rows vs rejected rows with reasons.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported_media: usize,
    pub failed_rows: usize,
    pub first_error: Option<String>,
}

// ── REPOSITORY ──────────────────────────────────────────────────────────────

pub struct Repository {
    pub conn: std::sync::Mutex<Connection>,
}

impl Repository {
    pub fn new(db_path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Optimize for performance and concurrency
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;"
        )?;

        Ok(Self {
            conn: std::sync::Mutex::new(conn),
        })
    }

    /**
     * The ONE schema migration entry point. Reads `PRAGMA user_version`
     * and applies every pending migration in ascending order, bumping the
     * version after each one. Safe to call on every boot.
     *
     * Migration 1: base tables (`media`, `app_settings`) + indexes.
     * Migration 2: personal tracking columns on `media`
     *              (review_notes / is_favorite / watched_date).
     */
    pub fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

        // Apply EVERY pending migration in ascending order within one boot -
        // a fresh database (version 0) must reach v2 here, not on restart.
        while version < 2 {
            if version < 1 {
                conn.execute_batch(
                    r#"
                    CREATE TABLE IF NOT EXISTS media (
                        id TEXT PRIMARY KEY,
                        imdb_id TEXT,
                        title TEXT NOT NULL,
                        original_title TEXT,
                        year INTEGER,
                        media_type TEXT NOT NULL,
                        runtime_minutes INTEGER,
                        imdb_rating REAL,
                        poster_url TEXT,
                        poster_local_path TEXT,
                        synopsis TEXT,
                        genres TEXT,
                        directors TEXT,
                        raw_scraped_json TEXT,
                        ai_summary TEXT,
                        ai_model_used TEXT,
                        user_status TEXT NOT NULL,
                        user_rating REAL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_media_imdb_id ON media(imdb_id);

                    -- Single-row settings store: whole AppSettings JSON in `data`.
                    CREATE TABLE IF NOT EXISTS app_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        data TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    "#,
                )?;

                // Backstop for insert_media's application-level dedupe:
                // enforce imdb_id uniqueness at the engine level. Legacy
                // databases may already contain duplicate rows; that must
                // not block boot, so we degrade gracefully with a warning.
                match conn.execute_batch(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_media_imdb_id_unique
                     ON media(imdb_id)
                     WHERE imdb_id IS NOT NULL AND imdb_id <> ''",
                ) {
                    Ok(_) => {}
                    Err(e) => {
                        crate::logger::Logger::warn(&format!(
                            "Could not create unique index on media(imdb_id): {}. \
                             Duplicate imdb_id rows exist; run deduplication before \
                             uniqueness can be enforced.",
                            e
                        ));
                    }
                }

                conn.pragma_update(None, "user_version", 1)?;
                version = 1;
            }

            if version < 2 {
                // Migration 2: personal tracking columns on media.
                // ALTER TABLE ADD COLUMN errors when the column exists, so each
                // column is probed via pragma_table_info first - robust against
                // partially-migrated databases without relying on error prose.
                const MIGRATION_2_COLUMNS: [&str; 3] = [
                    "review_notes",
                    "is_favorite",
                    "watched_date",
                ];
                const MIGRATION_2_DDL: [&str; 3] = [
                    "ALTER TABLE media ADD COLUMN review_notes TEXT",
                    "ALTER TABLE media ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
                    "ALTER TABLE media ADD COLUMN watched_date TEXT",
                ];
                for (column, ddl) in MIGRATION_2_COLUMNS.iter().zip(MIGRATION_2_DDL.iter()) {
                    let exists: i64 = conn.query_row(
                        "SELECT COUNT(*) FROM pragma_table_info('media') WHERE name = ?1",
                        params![column],
                        |r| r.get(0),
                    )?;
                    if exists == 0 {
                        conn.execute_batch(ddl)?;
                    }
                }
                conn.pragma_update(None, "user_version", 2)?;
                version = 2;
            }
        }

        Ok(())
    }

    // ── MEDIA CRUD ───────────────────────────────────────────────────────

    /// Look up the primary key of a media row by its IMDb id (dedupe helper).
    fn find_media_id_by_imdb(&self, conn: &Connection, imdb_id: &str) -> Result<Option<String>> {
        let mut stmt = conn.prepare("SELECT id FROM media WHERE imdb_id = ?1 LIMIT 1")?;
        let mut rows = stmt.query(params![imdb_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(row.get(0)?));
        }
        Ok(None)
    }

    /**
     * Upsert one media row. Rejects entries whose imdbId already belongs to a
     * DIFFERENT record (duplicate ingest); identical ids are plain updates.
     */
    pub fn insert_media(&self, record: &MediaRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(imdb_id) = &record.imdb_id {
            let imdb_trimmed = imdb_id.trim();
            if !imdb_trimmed.is_empty() {
                if let Some(existing_id) = self.find_media_id_by_imdb(&conn, imdb_trimmed)? {
                    if existing_id != record.id {
                        return Err(rusqlite::Error::InvalidParameterName(format!(
                            "DUPLICATE_IMDB_ID: '{}' already exists in your vault as {}",
                            imdb_trimmed, existing_id
                        )));
                    }
                }
            }
        }

        let genres_json = serde_json::to_string(&record.genres).unwrap_or_else(|_| "[]".to_string());
        let directors_json = serde_json::to_string(&record.directors).unwrap_or_else(|_| "[]".to_string());

        // Explicit upsert: update-in-place keeps the physical row identity
        // (unlike INSERT OR REPLACE which deletes + reinserts).
        conn.execute(
            r#"
            INSERT INTO media (
                id, imdb_id, title, original_title, year, media_type,
                runtime_minutes, imdb_rating, poster_url, poster_local_path,
                synopsis, genres, directors, raw_scraped_json, ai_summary,
                ai_model_used, user_status, user_rating, review_notes,
                is_favorite, watched_date, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
            ON CONFLICT(id) DO UPDATE SET
                imdb_id = excluded.imdb_id,
                title = excluded.title,
                original_title = excluded.original_title,
                year = excluded.year,
                media_type = excluded.media_type,
                runtime_minutes = excluded.runtime_minutes,
                imdb_rating = excluded.imdb_rating,
                poster_url = excluded.poster_url,
                poster_local_path = excluded.poster_local_path,
                synopsis = excluded.synopsis,
                genres = excluded.genres,
                directors = excluded.directors,
                raw_scraped_json = excluded.raw_scraped_json,
                ai_summary = excluded.ai_summary,
                ai_model_used = excluded.ai_model_used,
                user_status = excluded.user_status,
                user_rating = excluded.user_rating,
                review_notes = excluded.review_notes,
                is_favorite = excluded.is_favorite,
                watched_date = excluded.watched_date,
                updated_at = excluded.updated_at
            "#,
            params![
                record.id,
                record.imdb_id,
                record.title,
                record.original_title,
                record.year,
                record.media_type,
                record.runtime_minutes,
                record.imdb_rating,
                record.poster_url,
                record.poster_local_path,
                record.synopsis,
                genres_json,
                directors_json,
                record.raw_scraped_json,
                record.ai_summary,
                record.ai_model_used,
                record.user_status,
                record.user_rating,
                record.review_notes,
                record.is_favorite as i64,
                record.watched_date,
                record.created_at,
                record.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_all_media(&self) -> Result<Vec<MediaRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            r#"
            SELECT id, imdb_id, title, original_title, year, media_type,
                   runtime_minutes, imdb_rating, poster_url, poster_local_path,
                   synopsis, genres, directors, raw_scraped_json, ai_summary,
                   ai_model_used, user_status, user_rating, review_notes,
                   is_favorite, watched_date, created_at, updated_at
            FROM media
            ORDER BY created_at DESC
            "#
        )?;

        let rows = stmt.query_map([], |row| {
            let genres_str: String = row.get(11).unwrap_or_else(|_| "[]".to_string());
            let directors_str: String = row.get(12).unwrap_or_else(|_| "[]".to_string());

            Ok(MediaRecord {
                id: row.get(0)?,
                imdb_id: row.get(1)?,
                title: row.get(2)?,
                original_title: row.get(3)?,
                year: row.get(4)?,
                media_type: row.get(5)?,
                runtime_minutes: row.get(6)?,
                imdb_rating: row.get(7)?,
                poster_url: row.get(8)?,
                poster_local_path: row.get(9)?,
                synopsis: row.get(10)?,
                genres: serde_json::from_str(&genres_str).unwrap_or_default(),
                directors: serde_json::from_str(&directors_str).unwrap_or_default(),
                raw_scraped_json: row.get(13)?,
                ai_summary: row.get(14)?,
                ai_model_used: row.get(15)?,
                user_status: row.get(16)?,
                user_rating: row.get(17)?,
                // Migration-2 columns: 0/1 integer -> bool.
                review_notes: row.get(18)?,
                is_favorite: row.get::<_, Option<i64>>(19)?.unwrap_or(0) != 0,
                watched_date: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    /// Delete one media row by primary key; returns affected row count.
    pub fn delete_media(&self, id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM media WHERE id = ?1", params![id])
    }

    // ── APP SETTINGS (single-row JSON store) ─────────────────────────────

    /** Read the persisted AppSettings JSON blob, or None when never saved. */
    pub fn get_app_settings_json(&self) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare("SELECT data FROM app_settings WHERE id = 1")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(row.get(0)?));
        }
        Ok(None)
    }

    /**
     * Persist a PARTIAL AppSettings patch by MERGING it into the stored JSON
     * blob. The UI sends one key at a time (debounced sliders); replacing the
     * whole document would wipe sibling keys (e.g. saving `inferenceMode`
     * erasing `temperature`). Merge semantics keep every previously-saved key.
     */
    pub fn save_app_settings_json(&self, json_data: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        // Read-modify-write under the same lock acquisition.
        let existing: Option<String> = {
            let mut stmt = conn.prepare("SELECT data FROM app_settings WHERE id = 1")?;
            let mut rows = stmt.query([])?;
            match rows.next()? {
                Some(row) => Some(row.get(0)?),
                None => None,
            }
        };

        let incoming: serde_json::Value = serde_json::from_str(json_data)
            .unwrap_or(serde_json::Value::Null);

        let merged = match existing
            .as_deref()
            .map(|raw| serde_json::from_str::<serde_json::Value>(raw))
        {
            // Both sides objects -> shallow-merge keys, incoming wins.
            Some(Ok(serde_json::Value::Object(old)))
                if matches!(incoming, serde_json::Value::Object(_)) =>
            {
                if let serde_json::Value::Object(new) = incoming {
                    let mut merged_map = old;
                    for (key, value) in new {
                        merged_map.insert(key, value);
                    }
                    serde_json::Value::Object(merged_map)
                } else {
                    unreachable!("guarded above")
                }
            }
            // No existing row / corrupt row / non-object payloads: replace.
            _ => incoming,
        };

        let serialized = serde_json::to_string(&merged)
            .map_err(|e| rusqlite::Error::InvalidParameterName(format!(
                "Settings payload not serializable: {e}"
            )))?;

        conn.execute(
            "INSERT INTO app_settings (id, data, updated_at) VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            params![serialized, iso_utc_now()],
        )?;
        Ok(())
    }

    // ── FULL RELATIONAL EXPORT / IMPORT ──────────────────────────────────

    /**
     * Export every table to a checksummed JSON document.
     * Checksum contract: SHA-256 over the serialized document while
     * `sha256Checksum` is the empty string - fully reproducible for verifiers.
     */
    pub fn export_full_database(&self) -> Result<FullDatabaseExport> {
        let media = self.get_all_media()?;

        let mut export_data = FullDatabaseExport {
            version: EXPORT_FORMAT_VERSION.to_string(),
            exported_at: iso_utc_now(),
            sha256_checksum: String::new(),
            media,
            characters: vec![],
            story_arcs: vec![],
            beat_sheets: vec![],
            relationships: vec![],
            cinematography_cues: vec![],
            timeline_events: vec![],
            lore_notes: vec![],
        };

        // Hash the canonical form (checksum field empty), then embed the hash.
        let serialized = serde_json::to_string(&export_data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        export_data.sha256_checksum = format!("{:x}", hasher.finalize());

        Ok(export_data)
    }

    /**
     * Restore media rows from a parsed export inside ONE transaction:
     * any failing row aborts the whole import and reports the offender.
     */
    pub fn import_media_transactional(&self, records: &[MediaRecord]) -> Result<ImportReport> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        let mut imported: usize = 0;
        let mut failed: usize = 0;
        let mut first_error: Option<String> = None;

        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO media (
                    id, imdb_id, title, original_title, year, media_type,
                    runtime_minutes, imdb_rating, poster_url, poster_local_path,
                    synopsis, genres, directors, raw_scraped_json, ai_summary,
                    ai_model_used, user_status, user_rating, review_notes,
                    is_favorite, watched_date, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
                ON CONFLICT(id) DO UPDATE SET
                    imdb_id = excluded.imdb_id,
                    title = excluded.title,
                    original_title = excluded.original_title,
                    year = excluded.year,
                    media_type = excluded.media_type,
                    runtime_minutes = excluded.runtime_minutes,
                    imdb_rating = excluded.imdb_rating,
                    poster_url = excluded.poster_url,
                    poster_local_path = excluded.poster_local_path,
                    synopsis = excluded.synopsis,
                    genres = excluded.genres,
                    directors = excluded.directors,
                    raw_scraped_json = excluded.raw_scraped_json,
                    ai_summary = excluded.ai_summary,
                    ai_model_used = excluded.ai_model_used,
                    user_status = excluded.user_status,
                    user_rating = excluded.user_rating,
                    review_notes = excluded.review_notes,
                    is_favorite = excluded.is_favorite,
                    watched_date = excluded.watched_date,
                    updated_at = excluded.updated_at
                "#
            )?;

            for record in records {
                let genres_json =
                    serde_json::to_string(&record.genres).unwrap_or_else(|_| "[]".to_string());
                let directors_json =
                    serde_json::to_string(&record.directors).unwrap_or_else(|_| "[]".to_string());

                let result = stmt.execute(params![
                    record.id,
                    record.imdb_id,
                    record.title,
                    record.original_title,
                    record.year,
                    record.media_type,
                    record.runtime_minutes,
                    record.imdb_rating,
                    record.poster_url,
                    record.poster_local_path,
                    record.synopsis,
                    genres_json,
                    directors_json,
                    record.raw_scraped_json,
                    record.ai_summary,
                    record.ai_model_used,
                    record.user_status,
                    record.user_rating,
                    record.review_notes,
                    record.is_favorite as i64,
                    record.watched_date,
                    record.created_at,
                    record.updated_at
                ]);

                match result {
                    Ok(_) => imported += 1,
                    Err(e) => {
                        failed += 1;
                        if first_error.is_none() {
                            first_error = Some(format!("row '{}': {}", record.title, e));
                        }
                    }
                }
            }
        }

        if failed > 0 {
            // Any failure aborts the entire restore (transactional guarantee).
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "IMPORT_FAILED: {} row(s) could not be restored. First error: {}. No changes were applied.",
                failed,
                first_error.unwrap_or_default()
            )));
        }

        tx.commit()?;
        Ok(ImportReport {
            imported_media: imported,
            failed_rows: 0,
            first_error: None,
        })
    }
}

/// Current UTC time as ISO-8601 with millisecond precision.
/// Uses Howard Hinnant's civil-from-days algorithm; no chrono dependency.
fn iso_utc_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let millis = now.subsec_millis();

    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hour, minute, second) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

// ── TESTS ───────────────────────────────────────────────────────────────────
// CI-enforced guarantees: migration ordering/idempotency, upsert semantics,
// IMDb dedupe rejection, import counting, delete, export checksum contract,
// catalog ordering, and timestamp formatting. Each test uses its own temp
// SQLite file so tests never share state.

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Unique temp-database counter so parallel test threads never collide.
    static NEXT_DB_ID: AtomicU32 = AtomicU32::new(0);

    /// Open a fresh migrated repository backed by a unique temp file.
    /// Returns the repo plus the path (for cleanup).
    fn temp_repo() -> (Repository, std::path::PathBuf) {
        let n = NEXT_DB_ID.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "cinevault_ci_{}_{n}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let repo = Repository::new(&path).expect("open temp database");
        repo.run_migrations().expect("run migrations");
        (repo, path)
    }

    /// Fully-populated record with per-test overrides.
    fn sample_record(id: &str, imdb_id: Option<&str>, title: &str, created_at: &str) -> MediaRecord {
        MediaRecord {
            id: id.to_string(),
            imdb_id: imdb_id.map(|s| s.to_string()),
            title: title.to_string(),
            original_title: None,
            year: Some(2020),
            media_type: "movie".to_string(),
            runtime_minutes: Some(120),
            imdb_rating: Some(7.5),
            poster_url: None,
            poster_local_path: None,
            synopsis: Some("A test synopsis.".to_string()),
            genres: vec!["Drama".to_string()],
            directors: vec!["Tester".to_string()],
            raw_scraped_json: None,
            ai_summary: None,
            ai_model_used: None,
            user_status: "plan_to_watch".to_string(),
            user_rating: None,
            review_notes: None,
            is_favorite: false,
            watched_date: None,
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
        }
    }

    #[test]
    fn migrations_reach_v2_in_a_single_pass_and_are_idempotent() {
        let (repo, path) = temp_repo(); // runs migrations EXACTLY ONCE

        // A fresh database must land on v2 with ALL v2 columns present after
        // this first boot - no restart required. (A previous implementation
        // stopped at v1 here because each match arm ran at most once.)
        {
            let conn = repo.conn.lock().unwrap_or_else(|p| p.into_inner());
            let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
            assert_eq!(version, 2, "first boot must reach schema v2");
            let new_cols: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('media')
                     WHERE name IN ('review_notes','is_favorite','watched_date')",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(new_cols, 3, "migration v2 columns missing after first pass");
        }

        // Running migrations AGAIN on the same database must be a no-op.
        repo.run_migrations().expect("second migration pass");

        let conn = repo.conn.lock().unwrap_or_else(|p| p.into_inner());
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 2, "schema should stay stamped at v2");

        drop(conn);
        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn insert_media_upsert_updates_in_place() {
        let (repo, path) = temp_repo();

        repo.insert_media(&sample_record("m1", None, "First Title", "2026-01-01T00:00:00.000Z"))
            .unwrap();
        // Same primary key, changed title -> UPDATE not duplicate row.
        repo.insert_media(&sample_record("m1", None, "Second Title", "2026-01-01T00:00:00.000Z"))
            .unwrap();

        let all = repo.get_all_media().unwrap();
        assert_eq!(all.len(), 1, "upsert must not create a second row");
        assert_eq!(all[0].title, "Second Title");

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn duplicate_imdb_id_is_rejected_for_new_ids() {
        let (repo, path) = temp_repo();

        repo.insert_media(&sample_record("a", Some("tt1111111"), "Alpha", "2026-01-01T00:00:00.000Z"))
            .unwrap();

        // Different primary key claiming the same imdbId -> hard reject.
        let err = repo
            .insert_media(&sample_record("b", Some("tt1111111"), "Beta", "2026-01-02T00:00:00.000Z"))
            .unwrap_err();
        assert!(
            err.to_string().contains("DUPLICATE_IMDB_ID"),
            "expected dedupe error, got: {err}"
        );

        // Re-saving THE SAME id with its own imdbId stays legal (plain update).
        repo.insert_media(&sample_record("a", Some("tt1111111"), "Alpha v2", "2026-01-01T00:00:00.000Z"))
            .unwrap();
        assert_eq!(repo.get_all_media().unwrap()[0].title, "Alpha v2");

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn get_all_media_orders_newest_first() {
        let (repo, path) = temp_repo();

        repo.insert_media(&sample_record("old", None, "Older", "2026-01-01T00:00:00.000Z")).unwrap();
        repo.insert_media(&sample_record("new", None, "Newer", "2026-03-01T00:00:00.000Z")).unwrap();
        repo.insert_media(&sample_record("mid", None, "Middle", "2026-02-01T00:00:00.000Z")).unwrap();

        let titles: Vec<String> = repo.get_all_media().unwrap().into_iter().map(|m| m.title).collect();
        assert_eq!(titles, vec!["Newer", "Middle", "Older"]);

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_media_reports_row_count() {
        let (repo, path) = temp_repo();

        repo.insert_media(&sample_record("d1", None, "Doomed", "2026-01-01T00:00:00.000Z")).unwrap();

        assert_eq!(repo.delete_media("d1").unwrap(), 1);
        assert_eq!(repo.delete_media("d1").unwrap(), 0, "second delete finds nothing");
        assert!(repo.get_all_media().unwrap().is_empty());

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn import_counts_rows_and_upserts_existing_ids() {
        let (repo, path) = temp_repo();

        let batch = vec![
            sample_record("i1", None, "Import One", "2026-01-01T00:00:00.000Z"),
            sample_record("i2", None, "Import Two", "2026-01-02T00:00:00.000Z"),
        ];
        let report = repo.import_media_transactional(&batch).unwrap();
        assert_eq!(report.imported_media, 2);

        // Re-import with a mutated title for one id -> update, still two rows.
        let again = vec![sample_record("i2", None, "Import Two (fixed)", "2026-01-02T00:00:00.000Z")];
        let report2 = repo.import_media_transactional(&again).unwrap();
        assert_eq!(report2.imported_media, 1);

        let all = repo.get_all_media().unwrap();
        assert_eq!(all.len(), 2);
        let i2 = all.iter().find(|m| m.id == "i2").unwrap();
        assert_eq!(i2.title, "Import Two (fixed)");

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn export_checksum_matches_verifier_contract() {
        let (repo, path) = temp_repo();

        repo.insert_media(&sample_record("c1", Some("tt2222222"), "Checksum", "2026-01-01T00:00:00.000Z"))
            .unwrap();

        let export = repo.export_full_database().unwrap();
        assert!(!export.sha256_checksum.is_empty(), "checksum must be embedded");

        // Documented verifier contract: SHA-256 over the serialized document
        // while `sha256Checksum` is the empty string.
        let mut replica = export.clone();
        replica.sha256_checksum = String::new();
        let canonical = serde_json::to_string(&replica).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(canonical.as_bytes());
        let recomputed = format!("{:x}", hasher.finalize());

        assert_eq!(
            recomputed, export.sha256_checksum,
            "external verifiers must be able to reproduce the checksum"
        );

        drop(repo);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn iso_utc_now_has_canonical_shape() {
        let stamp = iso_utc_now();
        let bytes = stamp.as_bytes();

        assert_eq!(stamp.len(), 24, "YYYY-MM-DDTHH:MM:SS.mmmZ is 24 chars: {stamp}");
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        assert_eq!(bytes[10], b'T');
        assert_eq!(bytes[13], b':');
        assert_eq!(bytes[16], b':');
        assert_eq!(bytes[19], b'.');
        assert_eq!(bytes[23], b'Z');
    }
}
