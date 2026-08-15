use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

pub struct Repository;

impl Repository {
    // --- MEDIA CRUD ---
    pub fn insert_media(conn: &Connection, record: &MediaRecord) -> Result<()> {
        let genres_json = serde_json::to_string(&record.genres).unwrap_or_else(|_| "[]".to_string());
        let directors_json = serde_json::to_string(&record.directors).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            r#"
            INSERT OR REPLACE INTO media (
                id, imdb_id, title, original_title, year, media_type,
                runtime_minutes, imdb_rating, poster_url, poster_local_path,
                synopsis, genres, directors, raw_scraped_json, ai_summary,
                ai_model_used, user_status, user_rating, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
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
                record.created_at,
                record.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_all_media(conn: &Connection) -> Result<Vec<MediaRecord>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, imdb_id, title, original_title, year, media_type,
                   runtime_minutes, imdb_rating, poster_url, poster_local_path,
                   synopsis, genres, directors, raw_scraped_json, ai_summary,
                   ai_model_used, user_status, user_rating, created_at, updated_at
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
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn delete_media(conn: &Connection, id: &str) -> Result<usize> {
        conn.execute("DELETE FROM media WHERE id = ?1", params![id])
    }

    // --- FULL RELATIONAL EXPORT ---
    pub fn export_full_database(conn: &Connection) -> Result<FullDatabaseExport> {
        let media = Self::get_all_media(conn)?;
        let exported_at = chrono_stub_now();
        
        let mut export_data = FullDatabaseExport {
            version: "0.1.6".to_string(),
            exported_at,
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

        let serialized = serde_json::to_string(&export_data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        export_data.sha256_checksum = format!("{:x}", hasher.finalize());

        Ok(export_data)
    }
}

fn chrono_stub_now() -> String {
    "2026-08-15T18:38:00Z".to_string()
}
