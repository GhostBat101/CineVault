//! SQLite database repository implementation.
//! Purpose: Manages the SQLite connection, transactions, schema migration delegation, media CRUD, and full vault export/import.
//! Communication Matrix: Used by src-tauri/src/lib.rs, commands::*, db::director, and db::migrations.

use rusqlite::{params, Connection, Result};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;

pub use crate::db::migrations::*;
pub use crate::db::models::*;

const EXPORT_FORMAT_VERSION: &str = "2.0.0";
const MEDIA_CHILD_TABLES: [&str; 7] = [
    "characters",
    "character_relationships",
    "beat_sheets",
    "cinematography_cues",
    "lore_notes",
    "story_arcs",
    "timeline_events",
];

pub struct Repository {
    pub conn: Mutex<Connection>,
}

impl Repository {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;"
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        crate::db::migrations::apply_migrations(&conn)
    }

    fn find_media_id_by_imdb(&self, conn: &Connection, imdb_id: &str) -> Result<Option<String>> {
        let mut stmt = conn.prepare("SELECT id FROM media WHERE imdb_id = ?1 COLLATE NOCASE LIMIT 1")?;
        let mut rows = stmt.query(params![imdb_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(row.get(0)?));
        }
        Ok(None)
    }

    pub fn insert_media(&self, record: &MediaRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let clean_imdb: Option<String> = record
            .imdb_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_ascii_lowercase());

        if let Some(imdb_trimmed) = clean_imdb.as_deref() {
            if let Some(existing_id) = self.find_media_id_by_imdb(&conn, imdb_trimmed)? {
                if existing_id != record.id {
                    return Err(rusqlite::Error::InvalidParameterName(format!(
                        "DUPLICATE_IMDB_ID: '{}' already exists in your vault as {}",
                        imdb_trimmed, existing_id
                    )));
                }
            }
        }

        let genres_json = serde_json::to_string(&record.genres).unwrap_or_else(|_| "[]".to_string());
        let directors_json = serde_json::to_string(&record.directors).unwrap_or_else(|_| "[]".to_string());

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
                clean_imdb,
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

    pub fn delete_media(&self, id: &str) -> Result<usize> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        for table in MEDIA_CHILD_TABLES {
            let sql = format!("DELETE FROM {table} WHERE media_id = ?1");
            tx.execute(&sql, params![id])?;
        }
        let removed = tx.execute("DELETE FROM media WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok(removed)
    }

    pub fn get_app_settings_json(&self) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare("SELECT data FROM app_settings WHERE id = 1")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(row.get(0)?));
        }
        Ok(None)
    }

    pub fn save_app_settings_json(&self, json_data: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let incoming: serde_json::Value = serde_json::from_str(json_data).map_err(|_| {
            rusqlite::Error::InvalidParameterName("Settings payload must be a JSON object".into())
        })?;
        if !matches!(incoming, serde_json::Value::Object(_)) {
            return Err(rusqlite::Error::InvalidParameterName(
                "Settings payload must be a JSON object".into(),
            ));
        }

        let existing: Option<String> = {
            let mut stmt = conn.prepare("SELECT data FROM app_settings WHERE id = 1")?;
            let mut rows = stmt.query([])?;
            match rows.next()? {
                Some(row) => Some(row.get(0)?),
                None => None,
            }
        };

        let parsed_existing = existing
            .as_deref()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok());
        let merged = match (parsed_existing, incoming) {
            (Some(serde_json::Value::Object(mut old)), serde_json::Value::Object(new)) => {
                for (key, value) in new {
                    old.insert(key, value);
                }
                serde_json::Value::Object(old)
            }
            (_, incoming_obj) => incoming_obj,
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

    pub fn export_full_database(&self) -> Result<FullDatabaseExport> {
        let media = self.get_all_media()?;
        let characters = self.get_all_characters()?;
        let story_arcs = self.get_all_story_arcs()?;
        let beat_sheets = self.get_all_beat_sheets()?;
        let relationships = self.get_all_relationships()?;
        let cinematography_cues = self.get_all_cinematography_cues()?;
        let timeline_events = self.get_all_timeline_events()?;
        let lore_notes = self.get_all_lore_notes()?;

        let mut export_data = FullDatabaseExport {
            version: EXPORT_FORMAT_VERSION.to_string(),
            exported_at: iso_utc_now(),
            sha256_checksum: String::new(),
            media,
            characters,
            story_arcs,
            beat_sheets,
            relationships,
            cinematography_cues,
            timeline_events,
            lore_notes,
        };

        let serialized = serde_json::to_string_pretty(&export_data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        export_data.sha256_checksum = format!("{:x}", hasher.finalize());

        Ok(export_data)
    }

    fn upsert_media_in_tx(tx: &rusqlite::Transaction<'_>, records: &[MediaRecord]) -> Result<ImportReport> {
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
                let clean_imdb: Option<String> = record
                    .imdb_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_ascii_lowercase());

                let result = stmt.execute(params![
                    record.id,
                    clean_imdb,
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
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "IMPORT_FAILED: {} row(s) could not be restored. First error: {}. No changes were applied.",
                failed,
                first_error.unwrap_or_default()
            )));
        }

        Ok(ImportReport {
            imported_media: imported,
            failed_rows: 0,
            first_error: None,
        })
    }

    pub fn import_media_transactional(&self, records: &[MediaRecord]) -> Result<ImportReport> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        let report = Self::upsert_media_in_tx(&tx, records)?;
        tx.commit()?;
        Ok(report)
    }

    pub fn import_full_database_transactional(&self, doc: &FullDatabaseExport) -> Result<ImportReport> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        let media_report = Self::upsert_media_in_tx(&tx, &doc.media)?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO characters (id, media_id, name, actor_name, role_type, motivation, secret_backstory, avatar_url, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, name = excluded.name, actor_name = excluded.actor_name,
                     role_type = excluded.role_type, motivation = excluded.motivation, secret_backstory = excluded.secret_backstory,
                     avatar_url = excluded.avatar_url, notes = excluded.notes, updated_at = excluded.updated_at"
            )?;
            for c in &doc.characters {
                stmt.execute(params![
                    c.id, c.media_id, c.name, c.actor_name, c.role_type, c.motivation,
                    c.secret_backstory, c.avatar_url, c.notes, c.created_at, c.updated_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO story_arcs (id, media_id, parent_arc_id, title, arc_type, description, order_index, is_resolved, resolution_notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, parent_arc_id = excluded.parent_arc_id, title = excluded.title,
                     arc_type = excluded.arc_type, description = excluded.description, order_index = excluded.order_index,
                     is_resolved = excluded.is_resolved, resolution_notes = excluded.resolution_notes, updated_at = excluded.updated_at"
            )?;
            for arc in &doc.story_arcs {
                stmt.execute(params![
                    arc.id, arc.media_id, arc.parent_arc_id, arc.title, arc.arc_type, arc.description,
                    arc.order_index, arc.is_resolved as i64, arc.resolution_notes, arc.created_at, arc.updated_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO beat_sheets (id, media_id, framework, title, logline, beats_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, framework = excluded.framework, title = excluded.title,
                     logline = excluded.logline, beats_json = excluded.beats_json, updated_at = excluded.updated_at"
            )?;
            let now = iso_utc_now();
            for b in &doc.beat_sheets {
                let id = if b.id.trim().is_empty() {
                    format!("sheet_{}", b.media_id)
                } else {
                    b.id.clone()
                };
                let created_at = if b.created_at.trim().is_empty() { &now } else { &b.created_at };
                let updated_at = if b.updated_at.trim().is_empty() { &now } else { &b.updated_at };
                stmt.execute(params![
                    id, b.media_id, b.framework, b.title, b.logline, b.beats_json, created_at, updated_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO character_relationships (id, media_id, source_character_id, target_character_id, relationship_type, tension_score, notes, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, source_character_id = excluded.source_character_id,
                     target_character_id = excluded.target_character_id, relationship_type = excluded.relationship_type,
                     tension_score = excluded.tension_score, notes = excluded.notes"
            )?;
            for r in &doc.relationships {
                stmt.execute(params![
                    r.id, r.media_id, r.source_character_id, r.target_character_id,
                    r.relationship_type, r.tension_score, r.notes, r.created_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO cinematography_cues (id, media_id, scene_title, dominant_color, accent_color, shadow_color, lighting_style, lens_choice, aspect_ratio, audio_notes, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, scene_title = excluded.scene_title, dominant_color = excluded.dominant_color,
                     accent_color = excluded.accent_color, shadow_color = excluded.shadow_color, lighting_style = excluded.lighting_style,
                     lens_choice = excluded.lens_choice, aspect_ratio = excluded.aspect_ratio, audio_notes = excluded.audio_notes"
            )?;
            for cue in &doc.cinematography_cues {
                stmt.execute(params![
                    cue.id, cue.media_id, cue.scene_title, cue.dominant_color, cue.accent_color,
                    cue.shadow_color, cue.lighting_style, cue.lens_choice, cue.aspect_ratio, cue.audio_notes, cue.created_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO timeline_events (id, media_id, title, chronological_order, in_universe_timestamp, description, impact_level, involved_character_ids, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, title = excluded.title, chronological_order = excluded.chronological_order,
                     in_universe_timestamp = excluded.in_universe_timestamp, description = excluded.description,
                     impact_level = excluded.impact_level, involved_character_ids = excluded.involved_character_ids"
            )?;
            for ev in &doc.timeline_events {
                let involved_json =
                    serde_json::to_string(&ev.involved_character_ids).unwrap_or_else(|_| "[]".to_string());
                stmt.execute(params![
                    ev.id, ev.media_id, ev.title, ev.chronological_order, ev.in_universe_timestamp,
                    ev.description, ev.impact_level, involved_json, ev.created_at
                ])?;
            }
        }

        {
            let mut stmt = tx.prepare(
                "INSERT INTO lore_notes (id, media_id, character_id, arc_id, category, title, content_markdown, tags, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, character_id = excluded.character_id, arc_id = excluded.arc_id,
                     category = excluded.category, title = excluded.title, content_markdown = excluded.content_markdown,
                     tags = excluded.tags, updated_at = excluded.updated_at"
            )?;
            for n in &doc.lore_notes {
                let tags_json = serde_json::to_string(&n.tags).unwrap_or_else(|_| "[]".to_string());
                stmt.execute(params![
                    n.id, n.media_id, n.character_id, n.arc_id, n.category, n.title,
                    n.content_markdown, tags_json, n.created_at, n.updated_at
                ])?;
            }
        }

        tx.commit()?;
        Ok(media_report)
    }
}

pub fn verify_export_checksum(document: &FullDatabaseExport) -> bool {
    let mut replica = document.clone();
    replica.sha256_checksum = String::new();
    let Ok(canonical) = serde_json::to_string_pretty(&replica) else {
        return false;
    };
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(&document.sha256_checksum)
}

pub fn iso_utc_now() -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_repo() -> Repository {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch("PRAGMA foreign_keys = ON;").expect("fk pragma");
        let repo = Repository {
            conn: Mutex::new(conn),
        };
        repo.run_migrations().expect("migrations");
        repo
    }

    fn sample_media(id: &str) -> MediaRecord {
        MediaRecord {
            id: id.to_string(),
            imdb_id: Some(format!("tt{}", id.len())),
            title: "Test Film".to_string(),
            original_title: None,
            year: Some(2024),
            media_type: "movie".to_string(),
            runtime_minutes: Some(120),
            imdb_rating: Some(8.4),
            poster_url: None,
            poster_local_path: None,
            synopsis: Some("Synopsis".to_string()),
            genres: vec!["Sci-Fi".to_string()],
            directors: vec!["Director".to_string()],
            raw_scraped_json: None,
            ai_summary: None,
            ai_model_used: None,
            user_status: "completed".to_string(),
            user_rating: Some(9.0),
            review_notes: None,
            is_favorite: true,
            watched_date: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    fn seed_all_tables(repo: &Repository, media_id: &str) {
        repo.insert_media(&sample_media(media_id)).expect("insert media");
        repo.save_characters_for_media(
            media_id,
            &[CharacterRecord {
                id: format!("c1_{media_id}"),
                media_id: media_id.to_string(),
                name: "Lead".to_string(),
                actor_name: None,
                role_type: "protagonist".to_string(),
                motivation: None,
                secret_backstory: None,
                avatar_url: None,
                notes: None,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            }],
        )
        .expect("save characters");
        repo.save_relationships_for_media(
            media_id,
            &[RelationshipRecord {
                id: format!("r1_{media_id}"),
                media_id: media_id.to_string(),
                source_character_id: format!("c1_{media_id}"),
                target_character_id: format!("c2_{media_id}"),
                relationship_type: "Rival".to_string(),
                tension_score: 8,
                notes: None,
                created_at: "2026-01-01T00:00:00Z".to_string(),
            }],
        )
        .expect("save relationships");
        repo.save_beat_sheet_record(&BeatSheetRecord {
            id: format!("sheet_{media_id}"),
            media_id: media_id.to_string(),
            framework: "save-the-cat".to_string(),
            title: "Sheet".to_string(),
            logline: None,
            beats_json: "[]".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        })
        .expect("save beat sheet");
        repo.save_cinematography_cues_for_media(
            media_id,
            &[CinematographyRecord {
                id: format!("cue_{media_id}"),
                media_id: media_id.to_string(),
                scene_title: "Opening".to_string(),
                dominant_color: Some("#000000".to_string()),
                accent_color: Some("#ffffff".to_string()),
                shadow_color: Some("#111111".to_string()),
                lighting_style: None,
                lens_choice: None,
                aspect_ratio: None,
                audio_notes: None,
                created_at: "2026-01-01T00:00:00Z".to_string(),
            }],
        )
        .expect("save cues");
        repo.save_lore_notes_for_media(
            media_id,
            &[LoreNoteRecord {
                id: format!("lore_{media_id}"),
                media_id: media_id.to_string(),
                character_id: None,
                arc_id: None,
                category: "World Rules".to_string(),
                title: "Rule".to_string(),
                content_markdown: "Text".to_string(),
                tags: vec!["core".to_string()],
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            }],
        )
        .expect("save lore");

        let conn = repo.conn.lock().unwrap_or_else(|p| p.into_inner());
        conn.execute(
            "INSERT INTO story_arcs (id, media_id, parent_arc_id, title, arc_type, description, order_index, is_resolved, resolution_notes, created_at, updated_at)
             VALUES (?1, ?2, NULL, 'Arc A', 'main', NULL, 0, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![format!("arc_{media_id}"), media_id],
        )
        .expect("insert story arc");
        conn.execute(
            "INSERT INTO timeline_events (id, media_id, title, chronological_order, in_universe_timestamp, description, impact_level, involved_character_ids, created_at)
             VALUES (?1, ?2, 'Event 1', 1, NULL, NULL, 'major', '[\"c1\"]', '2026-01-01T00:00:00Z')",
            params![format!("ev_{media_id}"), media_id],
        )
        .expect("insert timeline event");
    }

    #[test]
    fn export_and_import_round_trips_all_eight_tables() {
        let src = memory_repo();
        seed_all_tables(&src, "m1");
        let exported = src.export_full_database().expect("export");
        assert!(verify_export_checksum(&exported));

        let dst = memory_repo();
        let report = dst.import_full_database_transactional(&exported).expect("import");
        assert_eq!(report.imported_media, 1);

        let re_exported = dst.export_full_database().expect("re-export");
        assert_eq!(re_exported.media.len(), 1);
        assert_eq!(re_exported.characters.len(), 1);
        assert_eq!(re_exported.relationships.len(), 1);
        assert_eq!(re_exported.beat_sheets.len(), 1);
        assert_eq!(re_exported.cinematography_cues.len(), 1);
        assert_eq!(re_exported.lore_notes.len(), 1);
        assert_eq!(re_exported.story_arcs.len(), 1);
        assert_eq!(re_exported.timeline_events.len(), 1);
    }

    #[test]
    fn delete_media_cascades_all_child_tables() {
        let repo = memory_repo();
        seed_all_tables(&repo, "m_del");

        let removed = repo.delete_media("m_del").expect("delete");
        assert_eq!(removed, 1);

        let exported = repo.export_full_database().expect("export");
        assert!(exported.media.is_empty());
        assert!(exported.characters.is_empty());
        assert!(exported.relationships.is_empty());
        assert!(exported.beat_sheets.is_empty());
        assert!(exported.cinematography_cues.is_empty());
        assert!(exported.lore_notes.is_empty());
        assert!(exported.story_arcs.is_empty());
        assert!(exported.timeline_events.is_empty());
    }

    #[test]
    fn save_app_settings_merges_existing_keys() {
        let repo = memory_repo();
        repo.save_app_settings_json(r#"{"temperature":0.7,"omdbApiKey":"abc"}"#)
            .expect("first save");
        repo.save_app_settings_json(r#"{"inferenceMode":"cpu_only"}"#)
            .expect("merge save");

        let raw = repo.get_app_settings_json().expect("read").expect("present");
        let val: serde_json::Value = serde_json::from_str(&raw).expect("json");
        assert_eq!(val["omdbApiKey"], "abc");
        assert_eq!(val["inferenceMode"], "cpu_only");
    }
}
