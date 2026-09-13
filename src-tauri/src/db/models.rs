//! Database entity models and export contracts.
//! Purpose: Declares serializable domain records matching the CineVault relational schema for media and Director Suite entities.
//! Communication Matrix: Exported to db::repository, db::director, commands::*, and mirrored in frontend src/types/index.ts.

use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub directors: Vec<String>,
    pub raw_scraped_json: Option<String>,
    pub ai_summary: Option<String>,
    pub ai_model_used: Option<String>,
    pub user_status: String,
    pub user_rating: Option<f32>,
    #[serde(default)]
    pub review_notes: Option<String>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub watched_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsRecord {
    pub id: i64,
    pub data: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRecord {
    pub id: String,
    pub media_id: String,
    pub name: String,
    #[serde(default)]
    pub actor_name: Option<String>,
    pub role_type: String,
    #[serde(default)]
    pub motivation: Option<String>,
    #[serde(default)]
    pub secret_backstory: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryArcRecord {
    pub id: String,
    pub media_id: String,
    #[serde(default)]
    pub parent_arc_id: Option<String>,
    pub title: String,
    pub arc_type: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub order_index: i32,
    #[serde(default)]
    pub is_resolved: bool,
    #[serde(default)]
    pub resolution_notes: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeatSheetRecord {
    pub id: String,
    pub media_id: String,
    pub framework: String,
    pub title: String,
    #[serde(default)]
    pub logline: Option<String>,
    #[serde(default)]
    pub beats_json: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipRecord {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub media_id: String,
    pub source_character_id: String,
    pub target_character_id: String,
    pub relationship_type: String,
    #[serde(default)]
    pub tension_score: i32,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CinematographyRecord {
    pub id: String,
    pub media_id: String,
    pub scene_title: String,
    #[serde(default)]
    pub dominant_color: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub shadow_color: Option<String>,
    #[serde(default)]
    pub lighting_style: Option<String>,
    #[serde(default)]
    pub lens_choice: Option<String>,
    #[serde(default)]
    pub aspect_ratio: Option<String>,
    #[serde(default)]
    pub audio_notes: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRecord {
    pub id: String,
    pub media_id: String,
    pub title: String,
    #[serde(default)]
    pub chronological_order: i32,
    #[serde(default)]
    pub in_universe_timestamp: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub impact_level: String,
    #[serde(default)]
    pub involved_character_ids: Vec<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreNoteRecord {
    pub id: String,
    pub media_id: String,
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub arc_id: Option<String>,
    pub category: String,
    pub title: String,
    pub content_markdown: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDatabaseExport {
    pub version: String,
    pub exported_at: String,
    pub sha256_checksum: String,
    pub media: Vec<MediaRecord>,
    #[serde(default)]
    pub characters: Vec<CharacterRecord>,
    #[serde(default)]
    pub story_arcs: Vec<StoryArcRecord>,
    #[serde(default)]
    pub beat_sheets: Vec<BeatSheetRecord>,
    #[serde(default)]
    pub relationships: Vec<RelationshipRecord>,
    #[serde(default)]
    pub cinematography_cues: Vec<CinematographyRecord>,
    #[serde(default)]
    pub timeline_events: Vec<TimelineRecord>,
    #[serde(default)]
    pub lore_notes: Vec<LoreNoteRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported_media: usize,
    pub failed_rows: usize,
    pub first_error: Option<String>,
}
