pub const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    imdb_id TEXT UNIQUE,
    title TEXT NOT NULL,
    original_title TEXT,
    year INTEGER,
    media_type TEXT DEFAULT 'movie',
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
    user_status TEXT DEFAULT 'plan_to_watch',
    user_rating REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    actor_name TEXT,
    role_type TEXT DEFAULT 'supporting',
    motivation TEXT,
    secret_backstory TEXT,
    avatar_url TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_arcs (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    parent_arc_id TEXT REFERENCES story_arcs(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    arc_type TEXT DEFAULT 'sub_plot',
    description TEXT,
    order_index INTEGER DEFAULT 0,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beat_sheets (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    framework TEXT NOT NULL,
    title TEXT NOT NULL,
    logline TEXT,
    beats_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS character_relationships (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    source_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    tension_score INTEGER DEFAULT 5,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cinematography_cues (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    scene_title TEXT NOT NULL,
    dominant_color TEXT,
    accent_color TEXT,
    shadow_color TEXT,
    lighting_style TEXT,
    lens_choice TEXT,
    aspect_ratio TEXT,
    audio_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    chronological_order INTEGER NOT NULL,
    in_universe_timestamp TEXT,
    description TEXT,
    impact_level TEXT DEFAULT 'medium',
    involved_character_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lore_notes (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
    arc_id TEXT REFERENCES story_arcs(id) ON DELETE SET NULL,
    category TEXT DEFAULT 'general',
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;
