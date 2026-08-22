# 🎬 CineVault

> ⚠️ **Status: Active Development / Work In Progress**
> CineVault is currently undergoing active foundational development and phase execution. Pre-release binaries and developer SDK packages are versioned and published incrementally.

> **AI-Powered Narrative & Media Tracker** — Merging relational story architecture with embedded local AI (< 2 GB VRAM) for cinephiles, screenwriters, and Hollywood directors, alongside a reusable TypeScript SDK (`@ghostbat101/cinevault-sdk`) on GitHub Packages.

---

## 🌟 Highlights

- **🔒 100% Offline & Private**: Zero cloud API dependencies. All database queries and AI inferences run strictly locally on your machine.
- **🧠 Embedded Local AI (< 2 GB VRAM)**: Powered by optimized GGUF Small Language Models (`Llama-3.2-1B-Instruct` & `Qwen2.5-1.5B-Instruct`) with **live token streaming**. Compile with `cargo build --features real-inference` for genuine on-device generation via llama.cpp; the default build ships a deterministic template engine with identical UX.
- **🎬 Dual Experience Modes**:
  - **Cinephile Deck Mode**: Fast, aesthetic media tracking with blurred backdrops, 1-click IMDb import, offline AI summaries, personal ratings, favorites, review notes, and CSV export.
  - **Director's Suite Mode**: Complete pre-production suite featuring **Save the Cat! & Three-Act Beat Sheets**, **Character Relationship Tension Matrices**, **Lore Continuity Notes + AI Audits**, Markdown/JSON sheet exports.
- **📦 Developer SDK (`@ghostbat101/cinevault-sdk`)**: Published to GitHub Packages; includes TypeScript beat sheet algorithms, character tension graphs, and Model Context Protocol (MCP) tools for external apps.
- **🌐 Resilient IMDb Ingestion**: Dual-tier scraper prioritizing embedded JSON-LD (`schema.org/Movie` & `TVSeries`) for zero-breakage metadata and high-res poster extraction - posters are cached locally for true offline use.
- **🎨 4 Luxury Dark Themes**: *Obsidian Dark*, *Crimson Noir*, *Midnight Slate*, and *Cyber Emerald*.
- **📐 Windows 11 Snap Resilience**: Collapsible sidebar (240px $\leftrightarrow$ 64px icon rail) with hard minimum window boundaries (`480x580px`) and responsive layout adaptation.
- **⚙️ Settings Suite**: Theme picker, persisted AI inference preferences (temperature / GPU offload), data export-import with integrity checksums, and an on-demand update checker.

---

## 📄 License

This project is open source and released under the [MIT License](./LICENSE), providing full creative freedom to use, modify, distribute, and fork.
