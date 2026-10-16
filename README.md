# Idea L Pack · Carton Tracking

Carton QR labels and records for Production → Print WH → Pack WH → customer.

- **Production handoff:** replaces the paper "Phiếu Giao Nhận Thành Phẩm". Each carton gets a QR label, and the slip prints in the same bilingual layout as the paper form.
- **Warehouse transfer:** scan the cartons that are moving. The app writes the matching "transfer to / from" rows for both stock sheets.
- **Shipment:** enter quantity and pcs per carton. Cartons, partial carton, N.W / G.W, CBM, shipping labels (1/N … N/N) and the packing list are worked out for you.
- **Scan:** any phone camera or USB scanner gun shows what's in a carton, which slip it came from and where it is now.
- **Exports:** rows paste straight into `STOCK REPORT Print` (sheet PRINT) and `STOCK REPORT Trading` (sheet In-out detail).
- **Vietnamese / English**, works on phones and PCs, and keeps working offline.

Setup: see [docs/SETUP.md](docs/SETUP.md). Developer notes: [CLAUDE.md](CLAUDE.md). Tests: `tests/run.html`.

© Idea L Pack — internal use.
