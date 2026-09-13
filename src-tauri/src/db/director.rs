//! Director Suite relational database operations.
//! Purpose: Provides CRUD queries and batch persistence for characters, relationships, beat sheets, cinematography cues, and lore notes.
//! Communication Matrix: Implements methods on db::repository::Repository; called by commands::director and db::repository.

use rusqlite::{params, Result};
use crate::db::models::{
    BeatSheetRecord, CharacterRecord, CinematographyRecord, LoreNoteRecord,
    RelationshipRecord, StoryArcRecord, TimelineRecord,
};
use crate::db::repository::Repository;

impl Repository {
    pub fn get_characters_by_media_id(&self, media_id: &str) -> Result<Vec<CharacterRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, name, actor_name, role_type, motivation, secret_backstory, avatar_url, notes, created_at, updated_at
             FROM characters WHERE media_id = ?1 ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            Ok(CharacterRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                name: row.get(2)?,
                actor_name: row.get(3)?,
                role_type: row.get(4)?,
                motivation: row.get(5)?,
                secret_backstory: row.get(6)?,
                avatar_url: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_characters(&self) -> Result<Vec<CharacterRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, name, actor_name, role_type, motivation, secret_backstory, avatar_url, notes, created_at, updated_at
             FROM characters ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(CharacterRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                name: row.get(2)?,
                actor_name: row.get(3)?,
                role_type: row.get(4)?,
                motivation: row.get(5)?,
                secret_backstory: row.get(6)?,
                avatar_url: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn save_characters_for_media(&self, media_id: &str, characters: &[CharacterRecord]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM characters WHERE media_id = ?1", params![media_id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO characters (
                    id, media_id, name, actor_name, role_type, motivation,
                    secret_backstory, avatar_url, notes, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
            )?;

            for (idx, c) in characters.iter().enumerate() {
                let id = if c.id.trim().is_empty() {
                    format!("char_{}_{}", media_id, idx + 1)
                } else {
                    c.id.clone()
                };
                let now = crate::db::repository::iso_utc_now();
                let created_at = if c.created_at.trim().is_empty() { &now } else { &c.created_at };
                let updated_at = if c.updated_at.trim().is_empty() { &now } else { &c.updated_at };
                stmt.execute(params![
                    id,
                    media_id,
                    c.name,
                    c.actor_name,
                    c.role_type,
                    c.motivation,
                    c.secret_backstory,
                    c.avatar_url,
                    c.notes,
                    created_at,
                    updated_at
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_relationships_by_media_id(&self, media_id: &str) -> Result<Vec<RelationshipRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, source_character_id, target_character_id, relationship_type, tension_score, notes, created_at
             FROM character_relationships WHERE media_id = ?1 ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            Ok(RelationshipRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                source_character_id: row.get(2)?,
                target_character_id: row.get(3)?,
                relationship_type: row.get(4)?,
                tension_score: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_relationships(&self) -> Result<Vec<RelationshipRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, source_character_id, target_character_id, relationship_type, tension_score, notes, created_at
             FROM character_relationships ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(RelationshipRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                source_character_id: row.get(2)?,
                target_character_id: row.get(3)?,
                relationship_type: row.get(4)?,
                tension_score: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn save_relationships_for_media(&self, media_id: &str, relationships: &[RelationshipRecord]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM character_relationships WHERE media_id = ?1", params![media_id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO character_relationships (
                    id, media_id, source_character_id, target_character_id,
                    relationship_type, tension_score, notes, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
            )?;

            for r in relationships {
                let id = if r.id.trim().is_empty() {
                    format!("rel_{}_{}", r.source_character_id, r.target_character_id)
                } else {
                    r.id.clone()
                };
                let now = crate::db::repository::iso_utc_now();
                let created_at = if r.created_at.trim().is_empty() { &now } else { &r.created_at };
                stmt.execute(params![
                    id,
                    media_id,
                    r.source_character_id,
                    r.target_character_id,
                    r.relationship_type,
                    r.tension_score,
                    r.notes,
                    created_at
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_beat_sheet_by_media_id(&self, media_id: &str) -> Result<Option<BeatSheetRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, framework, title, logline, beats_json, created_at, updated_at
             FROM beat_sheets WHERE media_id = ?1 LIMIT 1"
        )?;

        let mut rows = stmt.query(params![media_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(BeatSheetRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                framework: row.get(2)?,
                title: row.get(3)?,
                logline: row.get(4)?,
                beats_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            }));
        }
        Ok(None)
    }

    pub fn get_all_beat_sheets(&self) -> Result<Vec<BeatSheetRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, framework, title, logline, beats_json, created_at, updated_at
             FROM beat_sheets ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(BeatSheetRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                framework: row.get(2)?,
                title: row.get(3)?,
                logline: row.get(4)?,
                beats_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn save_beat_sheet_record(&self, record: &BeatSheetRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let now = crate::db::repository::iso_utc_now();
        let id = if record.id.trim().is_empty() {
            format!("sheet_{}", record.media_id)
        } else {
            record.id.clone()
        };
        let created_at = if record.created_at.trim().is_empty() { &now } else { &record.created_at };
        let updated_at = if record.updated_at.trim().is_empty() { &now } else { &record.updated_at };
        conn.execute(
            "INSERT INTO beat_sheets (
                id, media_id, framework, title, logline, beats_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                media_id = excluded.media_id,
                framework = excluded.framework,
                title = excluded.title,
                logline = excluded.logline,
                beats_json = excluded.beats_json,
                updated_at = excluded.updated_at",
            params![
                id,
                record.media_id,
                record.framework,
                record.title,
                record.logline,
                record.beats_json,
                created_at,
                updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_cinematography_cues_by_media_id(&self, media_id: &str) -> Result<Vec<CinematographyRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, scene_title, dominant_color, accent_color, shadow_color,
                    lighting_style, lens_choice, aspect_ratio, audio_notes, created_at
             FROM cinematography_cues WHERE media_id = ?1 ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            Ok(CinematographyRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                scene_title: row.get(2)?,
                dominant_color: row.get(3)?,
                accent_color: row.get(4)?,
                shadow_color: row.get(5)?,
                lighting_style: row.get(6)?,
                lens_choice: row.get(7)?,
                aspect_ratio: row.get(8)?,
                audio_notes: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_cinematography_cues(&self) -> Result<Vec<CinematographyRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, scene_title, dominant_color, accent_color, shadow_color,
                    lighting_style, lens_choice, aspect_ratio, audio_notes, created_at
             FROM cinematography_cues ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(CinematographyRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                scene_title: row.get(2)?,
                dominant_color: row.get(3)?,
                accent_color: row.get(4)?,
                shadow_color: row.get(5)?,
                lighting_style: row.get(6)?,
                lens_choice: row.get(7)?,
                aspect_ratio: row.get(8)?,
                audio_notes: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn save_cinematography_cues_for_media(&self, media_id: &str, cues: &[CinematographyRecord]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM cinematography_cues WHERE media_id = ?1", params![media_id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO cinematography_cues (
                    id, media_id, scene_title, dominant_color, accent_color, shadow_color,
                    lighting_style, lens_choice, aspect_ratio, audio_notes, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
            )?;

            for (idx, c) in cues.iter().enumerate() {
                let id = if c.id.trim().is_empty() {
                    format!("cue_{}_{}", media_id, idx + 1)
                } else {
                    c.id.clone()
                };
                let now = crate::db::repository::iso_utc_now();
                let created_at = if c.created_at.trim().is_empty() { &now } else { &c.created_at };
                stmt.execute(params![
                    id,
                    media_id,
                    c.scene_title,
                    c.dominant_color,
                    c.accent_color,
                    c.shadow_color,
                    c.lighting_style,
                    c.lens_choice,
                    c.aspect_ratio,
                    c.audio_notes,
                    created_at
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_lore_notes_by_media_id(&self, media_id: &str) -> Result<Vec<LoreNoteRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, character_id, arc_id, category, title, content_markdown, tags, created_at, updated_at
             FROM lore_notes WHERE media_id = ?1 ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            let tags_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            Ok(LoreNoteRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                character_id: row.get(2)?,
                arc_id: row.get(3)?,
                category: row.get(4)?,
                title: row.get(5)?,
                content_markdown: row.get(6)?,
                tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_lore_notes(&self) -> Result<Vec<LoreNoteRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, character_id, arc_id, category, title, content_markdown, tags, created_at, updated_at
             FROM lore_notes ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            Ok(LoreNoteRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                character_id: row.get(2)?,
                arc_id: row.get(3)?,
                category: row.get(4)?,
                title: row.get(5)?,
                content_markdown: row.get(6)?,
                tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn save_lore_notes_for_media(&self, media_id: &str, notes: &[LoreNoteRecord]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM lore_notes WHERE media_id = ?1", params![media_id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO lore_notes (
                    id, media_id, character_id, arc_id, category, title,
                    content_markdown, tags, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
            )?;

            for (idx, n) in notes.iter().enumerate() {
                let id = if n.id.trim().is_empty() {
                    format!("lore_{}_{}", media_id, idx + 1)
                } else {
                    n.id.clone()
                };
                let now = crate::db::repository::iso_utc_now();
                let created_at = if n.created_at.trim().is_empty() { &now } else { &n.created_at };
                let updated_at = if n.updated_at.trim().is_empty() { &now } else { &n.updated_at };
                let tags_json = serde_json::to_string(&n.tags).unwrap_or_else(|_| "[]".to_string());
                stmt.execute(params![
                    id,
                    media_id,
                    n.character_id,
                    n.arc_id,
                    n.category,
                    n.title,
                    n.content_markdown,
                    tags_json,
                    created_at,
                    updated_at
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_story_arcs_by_media_id(&self, media_id: &str) -> Result<Vec<StoryArcRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, parent_arc_id, title, arc_type, description, order_index, is_resolved, resolution_notes, created_at, updated_at
             FROM story_arcs WHERE media_id = ?1 ORDER BY order_index ASC, created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            Ok(StoryArcRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                parent_arc_id: row.get(2)?,
                title: row.get(3)?,
                arc_type: row.get(4)?,
                description: row.get(5)?,
                order_index: row.get(6)?,
                is_resolved: row.get::<_, i64>(7)? != 0,
                resolution_notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_story_arcs(&self) -> Result<Vec<StoryArcRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, parent_arc_id, title, arc_type, description, order_index, is_resolved, resolution_notes, created_at, updated_at
             FROM story_arcs ORDER BY order_index ASC, created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(StoryArcRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                parent_arc_id: row.get(2)?,
                title: row.get(3)?,
                arc_type: row.get(4)?,
                description: row.get(5)?,
                order_index: row.get(6)?,
                is_resolved: row.get::<_, i64>(7)? != 0,
                resolution_notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_timeline_events_by_media_id(&self, media_id: &str) -> Result<Vec<TimelineRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, title, chronological_order, in_universe_timestamp, description, impact_level, involved_character_ids, created_at
             FROM timeline_events WHERE media_id = ?1 ORDER BY chronological_order ASC, created_at ASC"
        )?;

        let rows = stmt.query_map(params![media_id], |row| {
            let chars_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            Ok(TimelineRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                title: row.get(2)?,
                chronological_order: row.get(3)?,
                in_universe_timestamp: row.get(4)?,
                description: row.get(5)?,
                impact_level: row.get(6)?,
                involved_character_ids: serde_json::from_str(&chars_str).unwrap_or_default(),
                created_at: row.get(8)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn get_all_timeline_events(&self) -> Result<Vec<TimelineRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, media_id, title, chronological_order, in_universe_timestamp, description, impact_level, involved_character_ids, created_at
             FROM timeline_events ORDER BY chronological_order ASC, created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let chars_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            Ok(TimelineRecord {
                id: row.get(0)?,
                media_id: row.get(1)?,
                title: row.get(2)?,
                chronological_order: row.get(3)?,
                in_universe_timestamp: row.get(4)?,
                description: row.get(5)?,
                impact_level: row.get(6)?,
                involved_character_ids: serde_json::from_str(&chars_str).unwrap_or_default(),
                created_at: row.get(8)?,
            })
        })?;

        let mut results = Vec::new();
        for item in rows {
            results.push(item?);
        }
        Ok(results)
    }
}
