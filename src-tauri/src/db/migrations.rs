//! Database schema migration runner.
//! Purpose: Applies sequential SQLite schema migrations up to version 3 to support media and relational Director Suite tables.
//! Communication Matrix: Invoked by Repository::run_migrations in db::repository.

use rusqlite::{params, Connection, Result};

pub fn apply_migrations(conn: &Connection) -> Result<()> {
    let mut version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    while version < 3 {
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

                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )?;

            let _ = conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_media_imdb_id_unique
                 ON media(imdb_id COLLATE NOCASE)
                 WHERE imdb_id IS NOT NULL AND imdb_id <> ''",
            );

            conn.pragma_update(None, "user_version", 1)?;
            version = 1;
        }

        if version < 2 {
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

        if version < 3 {
            let _ = conn.execute_batch(
                r#"
                DROP INDEX IF EXISTS idx_media_imdb_id_unique;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_media_imdb_id_unique
                ON media(imdb_id COLLATE NOCASE)
                WHERE imdb_id IS NOT NULL AND imdb_id <> '';
                "#,
            );

            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    actor_name TEXT,
                    role_type TEXT NOT NULL,
                    motivation TEXT,
                    secret_backstory TEXT,
                    avatar_url TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_characters_media_id ON characters(media_id);

                CREATE TABLE IF NOT EXISTS story_arcs (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    parent_arc_id TEXT,
                    title TEXT NOT NULL,
                    arc_type TEXT NOT NULL,
                    description TEXT,
                    order_index INTEGER NOT NULL DEFAULT 0,
                    is_resolved INTEGER NOT NULL DEFAULT 0,
                    resolution_notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_story_arcs_media_id ON story_arcs(media_id);

                CREATE TABLE IF NOT EXISTS beat_sheets (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    framework TEXT NOT NULL,
                    title TEXT NOT NULL,
                    logline TEXT,
                    beats_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_beat_sheets_media_id ON beat_sheets(media_id);

                CREATE TABLE IF NOT EXISTS character_relationships (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    source_character_id TEXT NOT NULL,
                    target_character_id TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    tension_score INTEGER NOT NULL DEFAULT 5,
                    notes TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_character_relationships_media_id ON character_relationships(media_id);

                CREATE TABLE IF NOT EXISTS cinematography_cues (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    scene_title TEXT NOT NULL,
                    dominant_color TEXT,
                    accent_color TEXT,
                    shadow_color TEXT,
                    lighting_style TEXT,
                    lens_choice TEXT,
                    aspect_ratio TEXT,
                    audio_notes TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cinematography_cues_media_id ON cinematography_cues(media_id);

                CREATE TABLE IF NOT EXISTS timeline_events (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    chronological_order INTEGER NOT NULL DEFAULT 0,
                    in_universe_timestamp TEXT,
                    description TEXT,
                    impact_level TEXT NOT NULL,
                    involved_character_ids TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_timeline_events_media_id ON timeline_events(media_id, chronological_order);

                CREATE TABLE IF NOT EXISTS lore_notes (
                    id TEXT PRIMARY KEY,
                    media_id TEXT NOT NULL,
                    character_id TEXT,
                    arc_id TEXT,
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_lore_notes_media_id ON lore_notes(media_id);
                "#,
            )?;

            conn.pragma_update(None, "user_version", 3)?;
            version = 3;
        }
    }

    Ok(())
}
