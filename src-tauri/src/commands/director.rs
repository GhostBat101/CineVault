//! Director Suite database IPC commands.
//! Purpose: Exposes Tauri commands to query, persist, and auto-migrate relational Director Suite entities in SQLite.
//! Communication Matrix: Invoked by frontend Director Suite components and api.ts; interfaces with db::repository::Repository.

use tauri::State;
use std::collections::HashMap;
use crate::db::repository::{
    BeatSheetRecord, CharacterRecord, CinematographyRecord, LoreNoteRecord,
    RelationshipRecord, Repository,
};

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteLocalStorageBundle {
    pub characters: Option<HashMap<String, Vec<CharacterRecord>>>,
    pub relationships: Option<HashMap<String, Vec<RelationshipRecord>>>,
    pub beat_sheets: Option<HashMap<String, BeatSheetRecord>>,
    pub cinematography_cues: Option<HashMap<String, Vec<CinematographyRecord>>>,
    pub lore_notes: Option<HashMap<String, Vec<LoreNoteRecord>>>,
}

#[tauri::command]
pub async fn get_characters(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Vec<CharacterRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_characters_by_media_id(&media_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_characters(
    media_id: String,
    characters: Vec<CharacterRecord>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_characters_for_media(&media_id, &characters)
            .map(|_| true)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn get_relationships(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Vec<RelationshipRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_relationships_by_media_id(&media_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_relationships(
    media_id: String,
    relationships: Vec<RelationshipRecord>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_relationships_for_media(&media_id, &relationships)
            .map(|_| true)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn get_beat_sheet(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Option<BeatSheetRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_beat_sheet_by_media_id(&media_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_beat_sheet(
    beat_sheet: BeatSheetRecord,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_beat_sheet_record(&beat_sheet)
            .map(|_| true)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn get_cinematography_cues(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Vec<CinematographyRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_cinematography_cues_by_media_id(&media_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_cinematography_cues(
    media_id: String,
    cues: Vec<CinematographyRecord>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_cinematography_cues_for_media(&media_id, &cues)
            .map(|_| true)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn get_lore_notes(
    media_id: String,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<Vec<LoreNoteRecord>, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.get_lore_notes_by_media_id(&media_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn save_lore_notes(
    media_id: String,
    notes: Vec<LoreNoteRecord>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        repo.save_lore_notes_for_media(&media_id, &notes)
            .map(|_| true)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}

#[tauri::command]
pub async fn migrate_suite_from_local_storage(
    bundle: SuiteLocalStorageBundle,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<usize, String> {
    let repo = std::sync::Arc::clone(repo.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let mut count = 0;

        if let Some(chars_map) = bundle.characters {
            for (media_id, items) in chars_map {
                let _ = repo.save_characters_for_media(&media_id, &items);
                count += items.len();
            }
        }

        if let Some(rels_map) = bundle.relationships {
            for (media_id, items) in rels_map {
                let _ = repo.save_relationships_for_media(&media_id, &items);
                count += items.len();
            }
        }

        if let Some(sheets_map) = bundle.beat_sheets {
            for (_media_id, sheet) in sheets_map {
                let _ = repo.save_beat_sheet_record(&sheet);
                count += 1;
            }
        }

        if let Some(cues_map) = bundle.cinematography_cues {
            for (media_id, items) in cues_map {
                let _ = repo.save_cinematography_cues_for_media(&media_id, &items);
                count += items.len();
            }
        }

        if let Some(notes_map) = bundle.lore_notes {
            for (media_id, items) in notes_map {
                let _ = repo.save_lore_notes_for_media(&media_id, &items);
                count += items.len();
            }
        }

        Ok(count)
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))?
}
