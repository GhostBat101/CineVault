# TESTING.md — Manual QA Checklist

> Run this against an installer built by the **Build Test** workflow
> (Actions → Build Test → download `CineVault-test-build` artifact).
> Work top-to-bottom; every step lists where to look when it fails.

## Where diagnostics live
| Signal | Location |
|---|---|
| Backend log | `<install dir>\logs\cinevault.log` (rotates at 5 MB) |
| Frontend console | In-app DevTools (debug builds) or F12 in packaged WebView2 |
| Database | `<install dir>\cinevault.db` (+ `-wal`) |
| Poster cache | `%LOCALAPPDATA%\com.ghostbat101.cinevault\cache\posters\` |
| Model vault | `<install dir>\models\` |

---

## 1. Install & First Boot
- [ ] NSIS installer completes; app launches to Dashboard.
- [ ] No theme flash on startup (Obsidian loads instantly).
- [ ] `logs\cinevault.log` exists and shows "run migrations" success.
- **Fail?** Check log for migration/panic lines; note the boot directory.

## 2. Ingest Loop
- [ ] Sidebar "New Entry" / Ctrl+N opens Ingest modal.
- [ ] Paste a real IMDb URL (`https://www.imdb.com/title/tt1375666/`) → Extract → preview shows REAL title/year/rating (no fabricated 8.0s).
- [ ] Missing fields render as "unknown", never invented values.
- [ ] Save to Vault → grid card appears once (check DB has ONE row: duplicate ingest of same URL is rejected with a visible error).
- [ ] Poster renders on card; after closing network (or if CDN blocks), card falls back to 🎬 tile — no broken-image glyph.
- [ ] Original Screenplay tab: create entry with Format dropdown (Feature/Series/Screenplay/Book) → appears in grid.

## 3. Tracking Write-Side
- [ ] Click status pill on a card → cycles Plan→Watching→Watched→Dropped; color updates; **survives app restart**.
- [ ] Mark Watched via pill → detail modal shows watched date set (CSV/export check below).
- [ ] Detail modal: set ★ rating 1–10, toggle ♥, type review notes → close & reopen modal AND restart app → all three persist.
- [ ] Rapid edits: change rating then immediately blur review → both persist (no revert).
- [ ] Delete button → confirm dialog → row vanishes from grid; restart confirms gone.

## 4. Browse / Filters
- [ ] Tabs: All / ♥ Favorites / Plan / Watching / Watched / Dropped filter correctly.
- [ ] Sorts: Your Rating orders rated-first desc; Recently Watched uses watched dates.
- [ ] Search matches title/director/genre; empty states distinguish search vs filter vs empty vault ("Clear Filters" appears for filter-empty).

## 5. Data Portability
- [ ] Settings → Data: Export Backup (JSON) → file contains `"sha256Checksum"`.
- [ ] Export Catalog (CSV) → opens in Excel; Title/Year/Directors/YourRating/WatchedDate/Review columns populated; commas in titles don't break columns.
- [ ] Import the JSON backup on a second profile/fresh DB → rows restored; corrupt JSON file → red toast, no partial import.

## 6. Director's Suite
- [ ] Open suite from card button or detail modal.
- [ ] Beat sheet: edit 2 beats → switch to another title → switch back → edits intact (no cross-title bleed).
- [ ] Framework dropdown → Classic Three-Act (8 beats); guard warns before replacing written content; choice persists per title.
- [ ] Completion square toggles manually; progress bar + counts update.
- [ ] AI Structure Assistant → output STREAMS into panel (template engine emits once but visibly types); Insert into beat works.
- [ ] Export JSON + Export Markdown → files open cleanly; Markdown shows acts/checks/minutes.
- [ ] Tension Matrix: add characters, click cell, set tension → **restart app** → matrix identical (this exact persistence was historically broken).
- [ ] Delete a character → their links disappear too.
- [ ] Lore Notes: create/edit/delete; markdown (`#`, `**`, `-`) renders styled, not raw glyphs; AI Continuity Audit streams findings.

## 7. Model Vault & Local AI
- [ ] Vault shows two catalog models; hero reads "No Active Model" until one activates.
- [ ] Download Llama 3.2 1B → live progress %, speed, retry counter; card flips INSTALLED after verify.
- [ ] Generate analysis from detail modal → tokens stream; latency shown is real, model name displayed.
- [ ] Settings → drag temperature → restart → slider retains value (settings merge fix).
- [ ] Set CPU-only offload → restart → still CPU-only; generate works.
- **Fail?** `logs\` will contain template-fallback lines if the feature build isn't active (expected for default CI builds).

## 8. Chrome, Themes, Layout
- [ ] All 4 themes switch with a soft crossfade; accent washes recolor behind glass panels.
- [ ] Keyboard: Tab through cards/modals shows visible focus rings everywhere (no invisible focus).
- [ ] Modals: Escape closes topmost only; focus returns to opener; backdrop click closes (except while typing in ingest? backdrop closes intentionally).
- [ ] Toasts appear ABOVE open modals (bottom-right).
- [ ] Resize to minimum 480×580: titlebar single row, navbar search shrinks not crushes, settings nav becomes icon rail, HUD degrades (CPU+VRAM only), no clipped/unreachable content anywhere.
- [ ] Ctrl+K focuses search (ignored while typing in textareas); Ctrl+N ignored while a modal is open; Ctrl+B/1/2/3/, switch views.

## 9. Updates
- [ ] Settings → Updates → Check for Updates: succeeds (needs internet). If it fails with CSP error in packaged build → report (connect-src allowlist regression).

---

**Found a bug?** Capture: step #, expected vs actual, `logs\cinevault.log` tail, console errors → feed back for fixes.
