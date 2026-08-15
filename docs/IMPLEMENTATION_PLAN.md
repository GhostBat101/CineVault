# Implementation Plan: CineVault (AI-Powered Narrative & Media Tracker)

**CineVault** bridges intuitive media cataloging for cinephiles with professional-grade narrative architecture (Beat Sheets, Character Dynamic Tension Matrices, Cinematography Moodboards, and AI Continuity Audits) for Hollywood directors and screenwriters—powered by embedded local AI (< 2 GB VRAM).

---

## User Review Required

> [!IMPORTANT]
> **Windows 11 Snap Layouts & Collapsible Sidebar Architecture:**
> - **Native Snap Resilience**: Full compatibility with Windows 11 2-split, 3-column, and 4-corner snap zones via custom Tauri titlebar hit-testing.
> - **Window Dimension Boundaries**: Hard minimum window constraint set to **`min_width: 480px`**, **`min_height: 580px`** (default `1280x820px`). The window cannot shrink below this limit, preventing layout clipping.
> - **Smart Collapsible Sidebar Navigation**:
>   - *Expanded Mode (240px)*: Icons + full labels + shortcut hints (`Ctrl + 1`, etc.).
>   - *Icon-Rail Mode (64px)*: Compact icon view with hover tooltips / flyouts.
>   - *Auto-Collapse Trigger*: Automatically transitions to icon rail below `860px` (e.g. 50% split on 1080p) and mobile drawer overlay below `560px` (e.g. 25% corner snap).
>   - *Manual Toggle & Shortcut*: Footer button (`⮜` / `⮞`) and keyboard shortcut (`Ctrl + B`).

---

## 15-Phase Production Engineering Roadmap

### Phase 0: System Architecture, RFC & Security Modeling
- Architectural Decision Records (ADRs) for Tauri v2, SQLite WAL mode, and `llama.cpp` Rust bindings.
- Threat modeling, file isolation for local poster cache, and type-safe IPC contracts.

### Phase 1: Toolchain, Monorepo & Build Foundations
- Scaffold monorepo: `/src-tauri` (Rust core with `tauri.conf.json` window constraints `min_width: 480`, `min_height: 580`), `/src` (React 18 + TypeScript + Vite).
- Strict linters, formatters, and path alias bindings.

### Phase 2: SQLite Relational Storage & Data Portability
- Initialize SQLite with WAL mode, foreign keys, and versioned migrations.
- Tables: `media`, `characters`, `story_arcs`, `beat_sheets`, `character_relationships`, `cinematography_cues`, `timeline_events`, `lore_notes`, `app_settings`.
- Full relational JSON export with SHA-256 validation and transactional import.

### Phase 3: Resilient Ingestion & Media Caching Pipeline
- `reqwest` client with desktop browser emulation.
- Dual-tier IMDb extractor: Primary embedded JSON-LD (`schema.org/Movie` & `TVSeries`) + fallback DOM parser.
- High-res poster download, downsampling, and local disk cache management.

### Phase 4: Hardware Telemetry HUD & Dynamic Resource Allocator
- Native poller via `sysinfo` + Windows DXGI for GPU VRAM, RAM, and CPU core utilization.
- Real-time VRAM budget calculator dynamically adjusting `n_gpu_layers` to guarantee `< 2.0 GB` VRAM usage.
- Background Tokio thread emitting `telemetry:update` every 1000ms.

### Phase 5: Embedded Local AI Engine (< 2GB VRAM) & Model Vault
- Model Vault folder manager with secondary drive support (`D:\`, `E:\`).
- Resumable Hugging Face GGUF downloader (`Llama-3.2-1B-Instruct` & `Qwen2.5-1.5B-Instruct` in Q4_K_M).
- `llama.cpp` token streaming generator over Tauri IPC event channel (`ai:token`, `ai:done`).

### Phase 6: Pure CSS Design System, Collapsible Sidebar & Shell
- 4 Bespoke Dark Themes:
  1. *Obsidian Dark* (#050507, pure black luxury)
  2. *Crimson Noir* (#0a0507, ruby/crimson accents)
  3. *Midnight Slate* (#090e17, deep slate & ice cyan)
  4. *Cyber Emerald* (#050d09, graphite & emerald neon)
- Frameless custom desktop window chrome with Windows 11 Snap Layouts maximize button hit-testing.
- **Collapsible Sidebar Component**: 240px expanded $\leftrightarrow$ 64px icon-rail with smooth CSS cubic-bezier transition, `Ctrl+B` toggle, and responsive snap auto-collapsing.

### Phase 7: Dashboard Media Library & Exploration Grid
- Fluid `repeat(auto-fill, minmax(240px, 1fr))` responsive deck grid adapting from 6 columns on 4K down to 1 column on 4-corner snap.
- Multi-criteria filtering (Media type, Status, Genre, Rating) and empty-state hero card.

### Phase 8: Ingestion Wizard & Pre-Commit Review Modal
- IMDb URL parser with animated live extraction feedback.
- Split-pane review modal enabling edits to Title, Year, Synopsis, Poster, and Cast before saving.

### Phase 9: Cinematic View Mode & AI Summary Experience
- High-res backdrop blur, typographic hierarchy, and token-by-token streaming AI summary block.
- Re-generate prompt modal allowing targeted thematic analysis.

### Phase 10: Pro-Director Narrative & Script Architecture Suite
- **Beat Sheet Canvas**: Interactive templates for Save the Cat! 15 Beats, Three-Act Classic, and Dan Harmon Story Circle.
- **Character Tension Matrix**: Interactive $N \times N$ relationship grid with dynamic tension sliders (1-10) and conflict types.
- **Cinematography & Moodboard Hub**: Color palette hex codes, lighting styles, lens specs, and audio cue links.
- **Chronological Timeline & Lore Notes**: Multi-track timeline sequencer and rich Markdown lore editor.

### Phase 11: Settings & Preferences Suite (7-Tab Enterprise Architecture)
- 2-Column Linear/Discord layout with instant search (`Ctrl+,`).
- Full implementation of the 7 settings domains (General, Appearance, AI & Model Vault, Ingestion, Director Defaults, Database & Cache, Telemetry & Diagnostics).

### Phase 12: Advanced Agentic Layer & Sequential Thinking MCP
- In-app bridge connecting local SLM to `@modelcontextprotocol/server-sequential-thinking`.
- Automated Lore Contradiction & Plot Hole Audit engine across characters and beats.

### Phase 13: Hardening, Performance Profiling & QA
- VRAM boundary stress testing (< 2GB strict enforcement), 10,000+ item database scaling tests, and automated test suite.

### Phase 14: Packaging, Custom Installer & Release Engineering
- Custom Windows Installer wizard with custom app and model vault path routing.
- Cold start pre-warming and distribution bundling.

---

## Verification Plan

### Automated Tests
- `npm run build` & TypeScript strict type-check (`tsc --noEmit`).
- Rust unit tests for database migrations, JSON-LD IMDb parsing, and JSON serialization.

### Manual Verification
- Verify theme switching across all 4 palettes.
- Test IMDb extraction and review modal workflow.
- Test token streaming AI summary generation.
- Test Pro-Director Beat Sheet editor and Character Relationship Matrix.
- Test 7-tab Settings Suite, live search filtering, and instant state persistence.
- Test window resizing down to minimum $480 \times 580$px boundary and test Windows 11 2-split, 3-split, and 4-corner snap layouts to confirm zero UI breakage and automatic sidebar collapse.
- Test Telemetry HUD dynamic updates and VRAM warning indicator.
- Verify full JSON backup export and lossless restoration.
