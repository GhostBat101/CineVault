//! SQLite database repository implementation.
//! Purpose: Manages the SQLite connection, transactions, schema migration delegation, media CRUD, and full vault export/import.
//! Communication Matrix: Used by src-tauri/src/lib.rs, commands::*, db::director, and db::migrations.

use rusqlite::{params, Connection, Result};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;

pub use crate::db::director::*;
pub use crate::db::migrations::*;
pub use crate::db::models::*;

const EXPORT_FORMAT_VERSION: &str = "2.0.0";

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
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM media WHERE id = ?1", params![id])
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

        let merged = match existing
            .as_deref()
            .map(|raw| serde_json::from_str::<serde_json::Value>(raw))
        {
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
                    unreachable!()
                }
            }
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

        tx.commit()?;
        Ok(ImportReport {
            imported_media: imported,
            failed_rows: 0,
            first_error: None,
        })
    }

    pub fn import_full_database_transactional(&self, doc: &FullDatabaseExport) -> Result<ImportReport> {
        let media_report = self.import_media_transactional(&doc.media)?;

        for c in &doc.characters {
            let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let _ = conn.execute(
                "INSERT INTO characters (id, media_id, name, actor_name, role_type, motivation, secret_backstory, avatar_url, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, name = excluded.name, actor_name = excluded.actor_name,
                     role_type = excluded.role_type, motivation = excluded.motivation, secret_backstory = excluded.secret_backstory,
                     avatar_url = excluded.avatar_url, notes = excluded.notes, updated_at = excluded.updated_at",
                params![c.id, c.media_id, c.name, c.actor_name, c.role_type, c.motivation, c.secret_backstory, c.avatar_url, c.notes, c.created_at, c.updated_at]
            );
        }

        for r in &doc.relationships {
            let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let _ = conn.execute(
                "INSERT INTO character_relationships (id, media_id, source_character_id, target_character_id, relationship_type, tension_score, notes, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, source_character_id = excluded.source_character_id,
                     target_character_id = excluded.target_character_id, relationship_type = excluded.relationship_type,
                     tension_score = excluded.tension_score, notes = excluded.notes",
                params![r.id, r.media_id, r.source_character_id, r.target_character_id, r.relationship_type, r.tension_score, r.notes, r.created_at]
            );
        }

        for b in &doc.beat_sheets {
            let _ = self.save_beat_sheet_record(b);
        }

        for cue in &doc.cinematography_cues {
            let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let _ = conn.execute(
                "INSERT INTO cinematography_cues (id, media_id, scene_title, dominant_color, accent_color, shadow_color, lighting_style, lens_choice, aspect_ratio, audio_notes, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, scene_title = excluded.scene_title, dominant_color = excluded.dominant_color,
                     accent_color = excluded.accent_color, shadow_color = excluded.shadow_color, lighting_style = excluded.lighting_style,
                     lens_choice = excluded.lens_choice, aspect_ratio = excluded.aspect_ratio, audio_notes = excluded.audio_notes",
                params![cue.id, cue.media_id, cue.scene_title, cue.dominant_color, cue.accent_color, cue.shadow_color, cue.lighting_style, cue.lens_choice, cue.aspect_ratio, cue.audio_notes, cue.created_at]
            );
        }

        for n in &doc.lore_notes {
            let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let tags_json = serde_json::to_string(&n.tags).unwrap_or_else(|_| "[]".to_string());
            let _ = conn.execute(
                "INSERT INTO lore_notes (id, media_id, character_id, arc_id, category, title, content_markdown, tags, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                     media_id = excluded.media_id, character_id = excluded.character_id, arc_id = excluded.arc_id,
                     category = excluded.category, title = excluded.title, content_markdown = excluded.content_markdown,
                     tags = excluded.tags, updated_at = excluded.updated_at",
                params![n.id, n.media_id, n.character_id, n.arc_id, n.category, n.title, n.content_markdown, tags_json, n.created_at, n.updated_at]
            );
        }

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
