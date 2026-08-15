# CineVault Core Project Rules & Lifecycle Standards

> **CRITICAL**: These rules apply to EVERY conversation in the CineVault project and MUST always be remembered and executed.

---

## 1. Remote GitHub Synchronization & Git Hygiene
- **Remote Public Repository**: The project is synced to the public GitHub repository (`https://github.com/GhostBat101/CineVault`).
- **End-of-Conversation Git Push**: At the end of **every conversation turn** where ANY file in the project is edited or created:
  1. Increment the version in `version.json` by `0.0.1` (e.g. `0.1.0` -> `0.1.1`).
  2. Stage all changed files matching the `.gitignore` policy (`git add .`).
  3. Commit with a descriptive conventional commit message (`git commit -m "..."`).
  4. Push changes to GitHub (`git push origin main`).
- **Strict `.gitignore` Policy**: Never push build artifacts (`target/`, `dist/`, `node_modules/`), heavy GGUF AI models (`*.gguf`), local SQLite databases (`*.db`), local poster caches, or environment secrets.

---

## 2. Version Incrementing & Release Protocol
- **Initial Version**: `v0.1.0`.
- **Incremental Rule**: Increment by `0.0.1` on every edit/build conversation.
- **Installer Release Rule**: When the desktop application build pipeline is executed and generates a release binary/installer (`.exe` setup wizard via NSIS/WiX), create an automated GitHub Release with the installer asset attached and tagged with the active version (e.g. `v0.1.0`).

---

## 3. License & Creative Freedom
- **Permissive Open Source**: The project is licensed under the MIT License (`LICENSE`), granting full creative freedom to fork, modify, redistribute, and build upon the codebase.

---

## 4. Architectural & Engineering Invariants
- **100% Offline & Zero-Cloud**: All media data, relational lore, scraping caches, and AI models execute strictly locally.
- **Strict < 2.0 GB VRAM Limit**: Dynamic layer offloading to CPU/RAM to guarantee zero out-of-memory driver crashes.
- **Dual Experience Mode**: Seamless toggle between *Cinephile Deck Mode* (casual media tracker) and *Director's Suite Mode* (beat sheets, tension matrices, cinematography cues, lore continuity audits).
- **Windows 11 Snap & Collapsible Sidebar**: Hard minimum window boundary (`480x580px`), responsive collapsible sidebar (240px $\leftrightarrow$ 64px icon rail), and zero-breakage layout reflow across all snap layouts.
- **Pure CSS Token Design System**: 4 luxury dark themes (*Obsidian Dark*, *Crimson Noir*, *Midnight Slate*, *Cyber Emerald*) with zero runtime CSS overhead.
