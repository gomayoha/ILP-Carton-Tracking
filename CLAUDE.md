# Idea L Pack · Carton QR Tracking — notes for Claude Code

Read this before changing anything.

## Who / rules
- Owner: **Yohan** (Assistant Production Manager, IDEA L PACK VN). Always "Yohan" — never write "Goma" anywhere (code, UI, docs, commits). GitHub handle `gomayoha` is only an account name.
- He is not a developer: do setup for him, explain in plain language, one question at a time, ask before destructive actions. Spelling in UI/docs must be perfect.
- Boss's mandate (Oct 2026): QR automation for **all cartons across the warehouses of all group entities**; weekly meetings with warehouse teams; practical, standardized, efficient.
- **Backend is Firebase/Firestore, not Supabase.** Yohan's Supabase account hosts his important "Idea L Pack Portal" — never create Supabase projects/tables for this.
- **Confidential data:** stock reports contain customer refs/POs of luxury brands. `reference/` and all `.xlsx/.csv` are git-ignored. Never commit them, never put item data in source files. The repo is public (GitHub Pages).

## Real-world flow (verified in the stock workbooks, Sep 2026)
1. Production → **Print WH**: paper slip "Phiếu Giao Nhận Thành Phẩm" (Số 0001955 on 7 Sep 2026). Logged in `STOCK REPORT Print` → sheet `PRINT` as `In · "Nhận thành phẩm" · remark WO…`. Notation `34T(100) + 1T(40)` = 34 cartons × 100 + 1 × 40.
2. Print WH → **Pack/Trading WH**: `PRINT` out "transfer to pack" ↔ `STOCK REPORT Trading` → `In-out detail` in "transfer from print" (POVN-…, pnk…). Logged as full-carton qty row + partial row.
3. Trading WH → customer: packing list / invoice (e.g. IDE0004000), pxk… delivery note. Pack re-packs into shipping cartons.
"PUR WH" in the boss's first message is most likely a typo for "our WH" (not yet confirmed by Yohan).

## Architecture
- Static PWA, **no build step**. Preact + htm (`vendor/preact-htm.js`), all libraries vendored in `vendor/` (works offline, no CDN risk). Hosted on GitHub Pages.
- Data: `src/db/firebase.js` (cloud) or `src/db/local.js` (DEMO, IndexedDB) — chosen by `FIREBASE_CONFIG` in `src/config.js`. Same interface.
- Firestore quota design (Spark: 50k reads/20k writes per day): persistent offline cache; on start read cache free, then listen only to docs with `updatedAt >` newest cached. Item master stored as JSON chunk docs (`itemChunks`) + per-item overrides (`items`). Records are never deleted (void + restore).
- Offline writes are queued by Firestore. UI must not `await` writes (they only resolve when the server acks).
- QR payload modes (per device): `link` (default, `APP_URL#/c/<id>`), `id` (`ILP:<id>`), `data` (TAB-separated for scanner gun → Excel). `parseScan` accepts all three.
- Carton ID = `<recordId 8 chars Crockford>-<line ln>-<seq>`. Line numbers (`ln`) are never reused so edits don't shift other labels.

## Files
- `src/config.js` — Firebase config, REQUIRE_LOGIN, APP_URL. The only file Yohan normally edits.
- `src/model.js` — business rules (split, notation, packing rows, totals, Excel movement rows, validation). Pure; covered by `tests/run.html`.
- `src/store.js` — state, actions, item search, doc numbering, carton location/history, learning carton size/weights from saved records.
- `src/print.js` — label presets + label HTML, slip (bilingual like the paper form), packing list (same columns as the paper one).
- `src/excel.js` — item import from stock report workbooks (header-synonym matching, picks the column that really holds ILP codes), xlsx/csv exports, stock rows in the exact `PRINT` / `In-out detail` column order.
- `src/views/*` — screens. `src/i18n.js` — every UI string is `tr('English', 'Tiếng Việt')`; printouts use both languages.
- `sw.js` — offline cache. **Bump `VERSION` on every release** and add new files to `CORE`.
- `firestore.rules`, `docs/SETUP.md` (go-live steps for Yohan).

## Working on it
- Local server (macOS blocks Python's cwd on Desktop from the preview tool, so run it from Bash): `python3 -m http.server 8765 --bind 127.0.0.1` in the project folder, or a no-cache variant. Service worker only registers on https, so localhost always loads fresh files (clear the browser cache if a module looks stale).
- Tests: open `http://127.0.0.1:8765/tests/run.html` — all must be green. Add a test for any rule change in `model.js`.
- Demo data: Home → "Load sample" (slip 0001955 + packing list IDE0004000 — the acceptance test; customer name anonymised because the repo is public).
- Theme follows https://gomayoha.github.io/ILP-Production-monthly-report/ (sage/stone/sand/black, Montserrat; Source Serif 4 for titles because Libre Baskerville has no Vietnamese glyphs). Lead dashboards with a positive number.

## Open questions for Yohan (ask one at a time, when relevant)
1. Confirm "PUR WH" = "our WH" and which warehouse pilots first.
2. Label printer and stock actually available (thermal model/size or A4 sticker sheets).
3. Phones vs scanner guns per warehouse; Wi-Fi quality on the floor.
4. Open access vs login (recommended: login, one account per warehouse).
5. Company IT rules on external cloud services (Firebase = Google Cloud).
6. Was the v1 Google Sheet backend ever used? (Only matters if old data needs importing.)

## Later (designed for, not built)
In/Out/Rejected stock balances, warehouse locations (vị trí), QC hold/release (GR numbers), confirmation stages, per-person accounts, archiving records older than N months from the in-memory list.
