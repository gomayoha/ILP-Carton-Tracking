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
4. Supplier → any group warehouse (**Supplier receipt**, type `inbound`, Nov 2026): Ms Ly sent a real supplier packing list (Turkey → France WH, billed to Pack BV, 781 cartons on 19 pallets). Same columns as our own packing list (Customer PO, Customer Style, Internal Code, Order Qty, Number of UOM, Qty/UOM, weights and L/W/H per carton, boxes/Pallet, Pallet No). The warehouse uploads it as Excel (`packingListLines` in `model.js`); one IDEA-L-INBOUND sticker per carton (PO + pallet on it), cartons numbered 1…N across the list, then scan to confirm receipt. PDFs can't be read. **Suppliers stay on PDF** (Ms Ly, 25 Nov 2026: the boss asked Purchasing — "Pur" — to send the warehouse PDFs only), so the warehouse retypes each packing list into Ms Ly's Excel stock-in template ("QR project detail data.xlsx", sheet "QR in": Entities, Customer Item No, Idea Item No, Product Name, Unit Code, Location, Pcs/carton, Lenght/Width/Height (cm), net/gross weight, CBM, stock in date, PO number/ WO number, Suplier code, Suplier name, Quantity receive, sticker — her spelling) and uploads it. The reader accepts that template, the supplier packing-list layout and customer delivery packing lists (Your Ref. / Our Ref. / Total quantity / Quantity/UOM / Number of UOM). Location (e.g. A01) and Entities (group company owning the stock) are kept per line. Her second sheet "Stock data" adds Barcode number, shipped date, invoice No, Customer — the stock-out side.

## Confirmed by the warehouse manager (Ms Ly, 18 Oct 2026)
- Labels: the floor already uses two hand-filled forms — **IDEA-L-PRINT** (production carton: FSC boxes, Reference/Mã, Date, W/O, Quantity `4×25=100`, Gross.W, Net.W, Dimension in mm, Total `20T=2000`, Odd quantity `1T=72`) and **IDEA-L-PACK** (shipping carton: Reference No., Quantity(pc), Gross Weight(kg), Dimension cm, Shipping date, PO No., FSC boxes, blue QC stamp). Our labels copy both and add the QR (`print.js` `labelHTML`). Exception (Ms Ly, Nov 2026): TOTAL / ODD QUANTITY are left off the sticker — each sticker shows only its own carton (qty, n/of); the carton breakdown `24T(500) + 1T(180)` is on the slip. Sticker (Ms Ly, Nov 2026): Production and warehouse both use barcode-printer rolls 55 × 100 mm (100 m roll) → default preset `thermal-100x55`.
- When Pack ships, it **usually ships the same production cartons** (no repack). So a shipment *scans* cartons (they keep their label; no new labels) and only repacked goods are entered as lines with new labels. Scans carry weights/dims/PO for the packing list.
- Handoff slip is written by **both production and the warehouse** (production also keeps its own notebook). Warehouse confirms receipt on the saved slip by scanning/counting cartons (`receipt` on the record; missing cartons are reported).

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
- `src/views/*` — screens (`stock.js` = stock by location + shelf labels). `src/i18n.js` — every UI string is `tr('English', 'Tiếng Việt')`; printouts use both languages.
- `sw.js` — offline cache. **Bump `VERSION` on every release** and add new files to `CORE`.
- `firestore.rules`, `docs/SETUP.md` (go-live steps for Yohan).

## Working on it
- Local server (macOS blocks Python's cwd on Desktop from the preview tool, so run it from Bash): `python3 -m http.server 8765 --bind 127.0.0.1` in the project folder, or a no-cache variant. Service worker only registers on https, so localhost always loads fresh files (clear the browser cache if a module looks stale).
- Tests: open `http://127.0.0.1:8765/tests/run.html` — all must be green. Add a test for any rule change in `model.js`.
- Demo data: Home → "Load sample" (slip 0001955 + packing list IDE0004000 — the acceptance test; customer name anonymised because the repo is public).
- Theme follows https://gomayoha.github.io/ILP-Production-monthly-report/ (sage/stone/sand/black, Montserrat; Source Serif 4 for titles because Libre Baskerville has no Vietnamese glyphs). Lead dashboards with a positive number.

## Open questions for Yohan (ask one at a time, when relevant)
1. "Pur" = Purchasing (Ms Ly, 25 Nov 2026), so "PUR WH" likely means the warehouse receiving purchased goods — confirm. Ms Ly asked for a live demo meeting (stock in → stickers → stock out).
2. Label printer and stock actually available (thermal model/size or A4 sticker sheets).
3. Phones vs scanner guns per warehouse; Wi-Fi quality on the floor.
4. Open access vs login (recommended: login, one account per warehouse).
5. Company IT rules on external cloud services (Firebase = Google Cloud).
6. Was the v1 Google Sheet backend ever used? (Only matters if old data needs importing.)

## Ms Ly's process sheet (26 Nov 2026, "QR project detail data (1).xlsx")
- **Inbound:** every location has its own QR. Goods arrive with a packing list / delivery note. **Overseas suppliers: PDF before the goods arrive. Local suppliers: paper delivery note with the goods (no PDF) → both PDF and photo are needed.** The system defines item code, description, packing spec, receiving date, supplier name, PO / invoice no., number of stickers. Paste a sticker on each carton; put away = scan the location QR, then the carton QRs. Export the list just received in the "QR in" layout (Record → "Received list (QR in) .xlsx").
- Her questions, all yes: count cartons per location (Stock page); scanning twice records once; a damaged sticker is reprinted with the same QR.
- **Outbound:** the shipping request comes from Merchandising ("Mer", the merchandiser team) as Excel: PO REF. (IDE… order/invoice no.), COMPONENT CODE (customer code), INTERNAL REF. (ILP code), Balance (qty), ETD, Place ship (customer). Upload it as the shipment's pick list → shows qty to pick, **stock on hand** and **locations, oldest stock first (FIFO)** (`pickSuggest`). After picking, scan all cartons → packing list.
- **Warehouses:** Idea L Pack B.V (France: phones, stickers 105 × 74 mm; goods come from a supplier, Pack CN and Print), Idea L Pack CN / EX / HK (one responsible person), IDEA L PACK MENA FZ LLC (UAE, run by an outside logistics company). Contact names are kept in Claude's private memory, not in this public repo. **Working language everywhere: English** (no Chinese / French screens needed).

## Boss's scope (MD email, 23 Nov 2026)
All warehouses of the group: China, Vietnam, France, UAE. Every operator scans the carton QR for each transaction: inbound, storage, pick up, outbound. Ms Ly (warehouse manager) defines the process; Yohan builds the tool. Review on Tue 1 Dec 2026. Built: inbound (production handoff + supplier receipt), transfer, outbound (shipment). Not built yet: storage locations, pick up. Ms Ly (25 Nov 2026): go live in **France, Vietnam and China**; UAE uses the same system later — today an outside logistics company runs the UAE warehouse. Risks: Google/Firebase blocked in mainland China, Spark quota, Chinese/French UI.

## Tracker (keep this up to date every session — Yohan relies on it)
Done
- [x] Supplier receipt: upload Excel (supplier packing list, Ms Ly's stock-in template, delivery packing list) → 1 sticker per carton → scan to confirm (25 Nov 2026)
- [x] 100 × 55 mm sticker default; TOTAL / ODD on the slip only
- [x] Storage: "Put away" record (type `putaway`: warehouse + location + scanned cartons; "Save & next shelf"); shelf QR labels `ILP-LOC:A.1.2` printed from the Stock page (ranges like A.1.1-A.9.6); Stock page = current stock by location (`currentStock`, `stockByLocation`), Excel export in the France report layout (one sheet per rack, French headers + internal code / description / total). Locations are stored without spaces (A.1.2) and shown "A. 1. 2" in the Excel (25 Nov 2026)
- [x] One standard for all warehouses (Ms Ly, 25 Nov 2026: "make 1 for all, not each warehouse 1 system; input the same file, export the same file, same format"): input = her "QR in" stock-in sheet (blank template downloadable from the Supplier receipt form and the Stock page); export = her "Stock data" sheet, one row per carton, Barcode number = carton ID (`cartonLedger`, `stockDataRows`, `STOCK_DATA_HEADER`, her spelling kept). Sticker content is the same everywhere; only the size differs per device: VN 100 × 55 mm barcode roll, France A4 sheet 8 per page 105 × 74 mm (preset `a4-8`, France's current stickers are IDEA L PACK layout: Reference No., Quantity (Pcs), Gross Weight, Dimension, Shipping Date, PO No.)
- [x] Read the supplier's PDF directly (Ms Ly, 26 Nov 2026: no retyping into Excel). `src/pdf.js` + vendored pdf.js 4.10.38 (`vendor/pdf.min.mjs`, `pdf.worker.min.mjs`, Apache-2.0) → `textToLines` / `linesToTable` (columns from the widest item row, header = best 1–6 lines above it) → `packingListLines`. Understands Vietnamese delivery notes (Phiếu xuất kho: code in the name column, "Thực xuất", "1.000" = 1000, Quy cách 600*400*360 mm → cm, ĐVT Hộp/Cái/Lọ/Cuộn; Biên bản giao hàng: Mã vật tư / Số lượng) and the supplier packing-list layout; PO from the document text (`docPO`). Pcs per carton / weights / size filled from the item list when the document lacks them, with a "please check" note. Tested: the real France PDF (12 lines, 781 cartons, all totals match) and a sample Phiếu xuất kho. Scanned PDFs and phone photos are not read yet (message says so).
- [x] Ms Ly's process sheet, 26 Nov 2026: supplier name + document no. read from the PDF (`docSupplier`, `docNumber`); merchandiser's shipping Excel accepted as pick list (PO REF / COMPONENT CODE / INTERNAL REF / Balance / Place ship → customer filled in); pick list shows stock on hand + FIFO locations; "Received list (QR in) .xlsx" export per receipt (`qrInRows`)
- [x] Ms Ly's answers (26 Nov 2026) built: **photos and scanned PDFs read inside the browser** (Tesseract.js 5.1.1 in `vendor/ocr/`, eng + vie, Apache-2.0; `src/ocr.js`; page mode 11 "sparse text" — the default mode skips bordered tables; then every item row is cropped into its own image and re-read as one line (mode 7) — this catches lone digits like "2" that mode 11 drops; the row reading only fills gaps (missing qty / unit / code) because on real photos it can grab the row number instead; the library's `rectangle` option reads table borders as text, so crop instead; straighten by median line slope; if the columns can't be lined up, `looseLines` reads code by code with the quantity after the unit word; unknown codes snap to the closest item code (`closestCode`, ≤2 characters); **no online AI** — Ms Ly said no). Tested on her two real photos: every code, quantity, unit, PO and supplier right, ~2 s each. **Opening a carton**: on a shipment, "Show cartons" → enter pieces taken; the carton keeps its QR and stays in stock with the rest (`currentStock`, `cartonLedger`, `cartonLocation` treat a scan with qty < full as partial); carton page shows "Opened · was N" and reprints with the quantity left. **1 sticker for the whole line** (raw materials, `line.oneLabel`, ppc = qty, not learned into the item list) + one-click button after reading a document. Location naming the same everywhere (Rack.Level.Position). FIFO by receiving date; production date for chemicals later (**don't raise it in the boss meeting** — Ms Ly). One item code per carton.
- [x] Practice mode + practice files (27 Nov 2026): `?practice=1` runs the app on a copy saved only in that browser (black PRACTICE MODE bar, Settings → Clear practice data, practice drafts kept apart); `reference/practice/` (git-ignored) holds 6 fake documents (sample item codes only) + "0 Practice script" with the exact numbers to expect. Found while testing: photos with uneven light / numbers against cell borders → second "cleaned" reading fills only missing or guessed quantities; "Customer PO" header no longer read as the PO; item pcs/carton and weights no longer learned from an odd-box row; opened-carton weights pro rata on the packing list
- [x] Pick up: on a shipment, upload the delivery packing list as a pick list (`rec.pick`, `pickProgress`); scanning warns on items not on the list / too many; the shipment page shows short / complete (25 Nov 2026)

Waiting on Yohan
- [ ] Push the local commits in GitHub Desktop (needed before any demo) — pushed up to v1.6.0 on 26 Nov 2026; v1.6.1 (photo row re-read) still to push
- [ ] Push v1.7.0 (practice mode) in GitHub Desktop, then do the practice script (`reference/practice/0 Practice script`) until smooth
- [ ] Phone + barcode-printer test with Yohan before the Teams demo (Fri 27 Nov 2026, 11:00, proposed to Ms Ly) — Round 6 of the practice script
- [ ] Teams demo with Ms Ly before the end of the week of 23 Nov 2026 (promised): Excel upload → stickers → scan receipt → shipment scan → packing list
- [ ] Send the email asking Ms Ly to collect info from China / France / UAE (reply-all on the MD's thread, due Fri 27 Nov)
- [ ] Switch on login mode before real POs go in

Waiting on Ms Ly
- [ ] Raw materials (VN): stock-in works (1 line = 1 QR, units Cái / Lọ / Cuộn read from the delivery note). Still open: issuing raw materials to Production — how it is done today (asked 25 Nov 2026)
- [ ] Info per warehouse (China, France, UAE): contact, inbound docs, locations, pick up, outbound, volume, equipment, stock report, language

To build (in order)
- [ ] FIFO by production date for chemicals (after the review; Ms Ly asked not to mention it to the boss)
- [ ] Warn before saving a record with ~3,000+ scanned cartons (Firestore 1 MB per document ≈ 4,000 scans); suggest splitting
- [ ] China access: Google/Firebase is blocked in mainland China — find a solution (e.g. a China-reachable host/proxy or a separate backend) before China goes live; put it on the 1 Dec review as a risk with a date
- [ ] Set a Firebase budget alert (~$5) if the project ever moves to the pay-as-you-go plan. Storage answer for the review (25 Nov 2026): free Spark plan is enough (1 save per record, not per carton; ~100–300 MB/year)
- [ ] Review pack for Tue 1 Dec 2026: what is built, gaps, risks (China network, quota, IT approval, languages), go-live date per country
- [ ] Later: pallet QR (scan one pallet = all its cartons). (Chinese / French screens not needed — Ms Ly: English everywhere.)

## Later (designed for, not built)
In/Out/Rejected stock balances, warehouse locations (vị trí), QC hold/release (GR numbers), confirmation stages, per-person accounts, archiving records older than N months from the in-memory list.
