# CineVault Core Project Rules & Lifecycle Standards

> **CRITICAL**: These rules apply to EVERY conversation in the CineVault project and MUST always be remembered and executed.

---

## 1. Remote GitHub Synchronization & Release Protocol
- **Remote Public Repository**: The project is synced to the public GitHub repository (`https://github.com/GhostBat101/CineVault`).
- **End-of-Conversation Git Push & Release Creation**: At the end of **every conversation turn** where ANY file in the project is edited or created:
  1. Increment the version in `version.json` by `0.0.1` (e.g. `0.1.7` -> `0.1.8`).
  2. Stage all changed files matching the `.gitignore` policy (`git add .`).
  3. Commit with a descriptive conventional commit message (`git commit -m "..."`).
  4. Push changes to GitHub (`git push origin main`).
  5. **Create GitHub Release**: Automatically create a new GitHub Release with `gh release create v<version> --title "..." --notes "..."`.
  6. **Attach Release Assets**: If the desktop application installer (`.exe` setup wizard via NSIS/WiX) is available or built, attach it directly to the release.
  7. **Publish Packages**: Ensure the GitHub Actions CI/CD pipeline triggers and publishes updated developer packages (`@ghostbat101/cinevault-sdk`) to GitHub Packages.
- **Strict `.gitignore` Policy**: Never push build artifacts (`target/`, `dist/`, `node_modules/`), heavy GGUF AI models (`*.gguf`), local SQLite databases (`*.db`), local poster caches, `.agents/`, `docs/`, or environment secrets.

---

## 2. Architectural & Engineering Invariants
- **100% Offline & Zero-Cloud**: All media data, relational lore, scraping caches, and AI models execute strictly locally.
- **Strict < 2.0 GB VRAM Limit**: Dynamic layer offloading to CPU/RAM to guarantee zero out-of-memory driver crashes.
- **Dual Experience Mode**: Seamless toggle between *Cinephile Deck Mode* (casual media tracker) and *Director's Suite Mode* (beat sheets, tension matrices, cinematography cues, lore continuity audits).
- **Windows 11 Snap & Collapsible Sidebar**: Hard minimum window boundary (`480x580px`), responsive collapsible sidebar (240px $\leftrightarrow$ 64px icon rail), and zero-breakage layout reflow across all snap layouts.
- **Pure CSS Token Design System**: 4 luxury dark themes (*Obsidian Dark*, *Crimson Noir*, *Midnight Slate*, *Cyber Emerald*) with zero runtime CSS overhead.
- **Permissive Open Source License**: MIT License (`LICENSE`) granting full creative freedom to fork and build upon the repository.
