# Industry Standard Engineering Rules & Best Practices

These standards reflect Tier-1 / Enterprise desktop software engineering practices across Rust, Tauri v2, SQLite, React, Local AI, and UI/UX Accessibility.

---

## 1. Rust & Native Backend Standards
- **Zero-Panic Policy**: Never use `.unwrap()` or `.expect()` in production code paths. All fallible operations must return `Result<T, AppError>` with descriptive error propagation (`?` operator and `thiserror`).
- **Non-Blocking Main Thread**: Never perform file I/O, SQLite queries, scraping, or AI inference on the main UI/Tauri thread. All heavy tasks must execute on Tokio async workers or dedicated background threads.
- **Resource Cleanup (RAII)**: Ensure file handles, SQLite statement locks, and memory-mapped model buffers (`mmap`) cleanly de-allocate on thread drop or app termination.
- **IPC Contract Type-Safety**: Ensure all Tauri command arguments and return payloads are strongly typed using `serde::{Serialize, Deserialize}` and mirrored in TypeScript interfaces.

---

## 2. React 18 & Frontend Architecture Standards
- **Strict TypeScript**: Enforce `strict: true`, `noImplicitAny: true`, and `strictNullChecks: true`. Disallow `any` types; use explicit interfaces, generics, or `unknown` with type narrowing.
- **Error Boundary Isolation**: Wrap major view containers (Dashboard Grid, Ingestion Modal, View Mode, Settings Suite) in React Error Boundaries so an isolated rendering error never crashes the entire desktop application.
- **Inference Cancellation Safety**: When streaming AI tokens, attach an `AbortController` / cancellation signal so if the user navigates away or presses "Cancel", generation immediately halts and frees system resources.
- **Zero-Runtime CSS**: Use CSS Custom Properties (Design Tokens) and modular stylesheets. Avoid CSS-in-JS runtimes that degrade framerate and cause layout shifts.

---

## 3. SQLite Database & Data Durability Standards
- **Transactional Atomicity**: All multi-entity mutations (e.g. saving a scraped Movie with 10 Characters and 3 Story Arcs) must execute inside a `db.transaction()` block. If any step fails, the entire transaction rolls back cleanly.
- **Foreign Key Cascade Integrity**: SQLite must always run with `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`.
- **Idempotent Versioned Migrations**: Migrations must be version-tracked in a `_schema_migrations` table and execute sequentially without data loss.

---

## 4. Local AI & Memory Management Standards (< 2 GB VRAM)
- **Dynamic Layer Allocation (`n_gpu_layers`)**: Always compute available VRAM via OS telemetry prior to model initialization, reserving a 250 MB OS headroom buffer before offloading layers to the GPU.
- **Prompt Sanitization**: Strip dangerous control tokens and normalize user inputs to prevent prompt injection or broken formatting in small language models.
- **Context Window Ceiling Guards**: Calculate prompt token counts before inference to prevent truncation panics or KV-cache overflow.

---

## 5. UI/UX, Accessibility (A11y) & Snap Standards
- **WCAG AA/AAA Contrast Compliance**: Text, icons, and interactive borders must maintain a minimum 4.5:1 contrast ratio across all 4 dark themes.
- **Complete Keyboard Navigability**: Every interactive element must have a visible focus ring, logical `Tab` indexing, and standard keyboard shortcuts (`Esc` closes modals, `Ctrl+B` toggles sidebar, `Ctrl+,` opens settings, `Ctrl+K` searches).
- **Reduced Motion Support**: Respect `@media (prefers-reduced-motion: reduce)` by disabling heavy parallax and transition animations for users with motion sensitivity.
- **Windows 11 Snap Adaptability**: All UI components must use fluid CSS grid and flexbox to seamlessly reflow when snapped to 50% split or 25% 4-corner snap zones without horizontal overflow.

---

## 6. Security & Ingestion Hygiene
- **Sanitized Scraper Payloads**: Sanitize all scraped HTML and text fields to prevent stored XSS or malformed character encoding in SQLite.
- **Local Asset Isolation**: Store cached posters and images in isolated application data folders (`AppData/Local/CineVault/cache/`) with collision-resistant SHA-256 filenames.
- **Air-Gap Verification**: No telemetry, analytics beacons, or remote logging libraries permitted.
