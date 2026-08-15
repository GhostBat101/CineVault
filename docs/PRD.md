# Product Requirements Document (PRD)
## Project Name: **CineVault (AI-Powered Narrative & Media Tracker)**
**Document Version:** 2.2.0-PROD  
**Target Release:** Desktop (Windows 64-bit Native / Cross-Platform Ready)  
**Classification:** Enterprise Desktop Application  

---

## 1. Executive Summary & Vision

**CineVault** is an offline-first, native desktop application that bridges the gap between **intuitive media tracking** (for casual movie buffs, anime enthusiasts, and novel readers) and **deep narrative architectural lore mapping** (for Hollywood directors, screenwriters, showrunners, and game narrative designers).

Powered by an embedded **Local AI Inference Engine (< 2 GB VRAM limit)** with zero cloud reliance, CineVault executes quantized Small Language Models (GGUF via `llama.cpp` Rust bindings) alongside a high-performance SQLite database. Users can effortlessly ingest films via IMDb, track intricate sub-plots, generate contextual AI narrative syntheses, map character relationship tension matrices, analyze story pacing beats, and detect lore contradictions without sending a single byte of private creative data to the internet.

---

## 2. Target User Personas & Tiered Value Proposition

```
+---------------------------------------------------------------------------------------------------------+
|                                    CINEVAULT USER SPECTRUM & VALUE                                      |
+---------------------------------------------------------------------------------------------------------+
|  [CASUAL CINEPHILE / ENTHUSIAST]              [PRO DIRECTOR / SCREENWRITER / SHOWRUNNER]               |
|  - Instant 1-click IMDb Ingestion             - Beat Sheet Frameworks (Save the Cat, 3-Act, Harmon)     |
|  - 4 Luxury Dark Themes & Blurred Posters     - Character Dynamic Relationship Tension Matrix           |
|  - Offline AI Plot & Theme Summaries          - AI Lore Contradiction & Plot Hole Analysis (MCP)        |
|  - Rating, Status & Genre Filtering           - Scene-by-Scene Moodboards, Color Palettes & Audio Cues   |
|  - Portable JSON Library Backup               - Exportable "Director's Pitch Bible" & Screenplay Bibles |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. Window System, Collapsible Sidebar & Windows 11 Snap Layouts Architecture

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    WINDOW SIZING & SNAP ADAPTATION                                      |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
|  [Full Screen / 4K / 1440p / 1080p]  ──► 4-6 Column Media Deck, Expanded Sidebar (240px), Full HUD      |
|  [50% Split Screen (960px)]          ──► 2-3 Column Deck, Collapsed Icon Rail (64px) or Compact Sidebar |
|  [25% Corner Snap (480px - Min Size)]──► 1 Column Deck, Auto-Collapsed Rail / Drawer, Mini HUD Strip    |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 3.1 Window Dimensions & Constraints
- **Default Resolution**: $1280 \times 820$ px (centered on primary display).
- **Minimum Window Constraint (`min_width`, `min_height`)**: Hard-bounded at **$480 \times 580$ px** via Tauri window configuration. The window cannot be resized smaller than this threshold, preventing layout destruction.
- **Maximum Resolution**: Unrestricted; supports ultra-wide $21:9$ / $32:9$ and 4K displays with responsive auto-fill grids.
- **Windows 11 Snap Layouts Native Support**: Full integration with the Windows DWM (Desktop Window Manager) Snap Layouts menu on titlebar maximize/restore button hover.

### 3.2 Collapsible Sidebar Navigation
- **Expanded State (240px width)**: Shows section icons, full descriptive labels, active pill indicator, and shortcut hints (`Ctrl + 1`, `Ctrl + 2`, etc.).
- **Collapsed Icon-Rail State (64px width)**: Compact icon-only view with interactive hover flyouts / tooltips for high-density workspaces.
- **Manual Toggle**: One-click collapse button (`⮜` / `⮞`) on the sidebar footer and keyboard shortcut (`Ctrl + B`).
- **Responsive Auto-Collapse (Breakpoint: $\le 860$px)**: When snapped to 50% split screen or 25% corner snap, the sidebar automatically collapses to icon-rail mode to maximize content area.
- **Mobile/Narrow Drawer Overlay (Breakpoint: $\le 560$px)**: In ultra-compact snap mode, the sidebar collapses into a floating drawer overlay triggered by a top-bar hamburger icon.

---

## 4. Comprehensive Feature Matrix

### Category 1: Media Ingestion & Data Cataloging
- **ING-01**: **Resilient IMDb Scraping** (JSON-LD `schema.org/Movie` & `TVSeries` primary + DOM fallback).
- **ING-02**: **Pre-Commit Review Modal** (Split-pane editor for metadata, synopsis, poster, and cast before SQLite commit).
- **ING-03**: **Manual Multi-Media Entry** (Original scripts, novels, video game lore without IMDb).
- **ING-04**: **High-Res Local Poster Cache** (Background downloading, disk caching, and asset downsampling).
- **ING-05**: **Batch Library Import** (Import from Letterboxd CSV, IMDb, or Trakt).

### Category 2: Embedded Local AI (< 2 GB VRAM Budget)
- **AI-01**: **Dual GGUF Model Runtime** (`Llama-3.2-1B-Instruct` & `Qwen2.5-1.5B-Instruct` in Q4_K_M).
- **AI-02**: **Token Streaming Engine** (Real-time typewriter token streaming over Tauri IPC event channel).
- **AI-03**: **Contextual Plot Synthesis** (Synthesizes scraped synopsis with personal lore notes).
- **AI-04**: **Re-Generate with Custom Focus** (Prompt guidance for specific thematic analysis).
- **AI-05**: **Lore Contradiction Detection** (Sequential Thinking MCP for cross-examining character arcs).
- **AI-06**: **Model Vault Manager** (Configurable directories with secondary drive support e.g. `D:\AI_Models`).
- **AI-07**: **Dynamic Layer Offloading** (Automatic `n_gpu_layers` allocation to enforce < 2 GB VRAM cap).

### Category 3: Pro-Director Narrative & Script Architecture
- **DIR-01**: **Industry Beat Sheet Frameworks** (Save the Cat 15 Beats, Three-Act Classic, Dan Harmon Story Circle, Hero's Journey).
- **DIR-02**: **Character Dynamic Tension Matrix** ($N \times N$ interactive relationship grid with tension strength 1-10).
- **DIR-03**: **Cinematography & Moodboard Hub** (Hex color palettes, lighting styles, lens specs, aspect ratios).
- **DIR-04**: **Pacing & Dramatic Tension Graph** (Visual tension curve mapping emotional beats).
- **DIR-05**: **Audio & Score Cue Board** (Motifs, themes, and sound cues linked to scenes and characters).
- **DIR-06**: **Director's Pitch Bible Export** (1-click export to styled PDF / Markdown pitch deck).

### Category 4: Relational Worldbuilding & Lore Nexus
- **LORE-01**: **Hierarchical Story Arc Tree** (Infinite-depth sub-plots with resolution state flags).
- **LORE-02**: **Character Dossiers & Flaws** (Archetypes, core motivations, fatal flaws, secret backstories).
- **LORE-03**: **Chronological Timeline Sequencer** (Multi-track timeline with in-universe timestamps).
- **LORE-04**: **Rich Markdown Lore Notes** (Split-pane Markdown editor with `[[Wikilinks]]` and category tagging).

---

## 5. Enterprise Settings & Preferences Architecture (7-Tab Suite)

To match industry benchmarks like Linear, Raycast, and Discord, CineVault includes an integrated **2-Column Settings Suite** with live search, instant auto-save, and keyboard shortcuts (`Ctrl + ,` / `Esc`).

- **Tab 1: ⚙️ General & Window**: Default workspace mode, sidebar auto-collapse behavior, UI zoom scaling, system tray behavior, shortcut studio.
- **Tab 2: 🎨 Appearance & Theming**: 4 luxury dark palettes (*Obsidian Dark*, *Crimson Noir*, *Midnight Slate*, *Cyber Emerald*), ambient backdrop blur intensity, card density.
- **Tab 3: 🧠 AI Engine & Model Vault**: Custom storage path with drive space readout, active GGUF model selector, manual `.gguf` importer, dynamic GPU layer slider, temperature presets.
- **Tab 4: 🌐 Ingestion & Scraping**: Request rate buffer, poster download resolution (UHD, 1080p, 720p), auto-enrichment toggles (trivia, soundtrack, parents guide), proxy configuration.
- **Tab 5: 🎬 Director's Suite Defaults**: Default beat sheet structure, pitch bible export branding & watermarks, auto-save frequency, relationship tension scale sensitivity.
- **Tab 6: 💾 SQLite, Storage & Cache**: SQLite DB status card, 1-click Vacuum & Re-index, poster cache size & purge tool, automated backup scheduler, SHA-256 JSON export/import.
- **Tab 7: 📊 Telemetry, Privacy & Logs**: 100% offline air-gap indicator, HUD refresh rate, hardware diagnostic report generator, in-app log viewer.
