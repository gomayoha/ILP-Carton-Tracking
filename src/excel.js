// Excel in and out. SheetJS (≈1 MB) is only loaded when one of these functions is used.

import { loadScript, norm, clean, num, today, fmtDate, toCSV, downloadFile } from './util.js';
import { packingRows, totals, movementBlocks, LAYOUTS, recordCartons, split, fmtWO, warehouse, scanGroups } from './model.js';
import { itemToRow, rowToItem } from './store.js';

async function XLSX() {
  if (!window.XLSX) await loadScript('vendor/xlsx.full.min.js');
  return window.XLSX;
}

// ── Item master import ──────────────────────────────────────────────────────
// Reads any sheet whose header row names an internal-code column, e.g. the stock report
// sheets "STOCK PRINT REPORT", "PRINT", "item", "vị trí", "In-out detail", "SPEC".
// Header names are matched exactly (after removing accents), in priority order.

const SYN = {
  code: ['internal code', 'interal code', 'sku', 'no.', 'item no.', 'ilp code', 'ma hang'],
  ref: ['customer ref', 'customer code', 'reference', 'refer', 'ma khach hang', 'ma kh'],
  desc: ['description', 'ten hang', 'item name', 'ten hang (mo ta chi tiet)'],
  uom: ['base unit of measure', 'uom', 'don vi tinh', 'dvt', 'unit'],
  ppc: ['pcs/box', 'qty/uom', 'pcs/carton', 'pcs/ctn', 'qty'],
  l: ['l(cm)', 'l', 'leght', 'length'],
  w: ['w(cm)', 'w', 'width'],
  h: ['h(cm)', 'h', 'hight', 'height'],
  nw: ['net (kg)', 'net weight', 'n.w', 'nw'],
  gw: ['gross(kg)', 'gross (kg)', 'gross weight', 'g.w', 'gw'],
  cust: ['customer'],
  status: ['status'],
};

const CODE_RE = /^ILP[A-Z0-9]{6,}$/;
const BAD = new Set(['', '0', '#N/A', '#REF!', '#VALUE!', 'N/A', '-']);
const UOM_MAP = { piece: 'piece', pcs: 'piece', pce: 'piece', box: 'box', roll: 'roll', kg: 'kg', kilogram: 'kg', pair: 'pair', set: 'set', ream: 'ream', sheet: 'sheet' };

function findCols(headerRow, dataRows) {
  const h = headerRow.map((c) => norm(c));
  const col = {};
  for (const [k, list] of Object.entries(SYN)) {
    col[k] = -1;
    for (const s of list) { const i = h.indexOf(s); if (i >= 0) { col[k] = i; if (k === 'ref') col.refWeak = s === 'refer'; break; } }
  }
  // Several sheets have more than one code-like header ("No." and "ILP code" in SPEC).
  // Use the first candidate column whose values really are ILP codes.
  const hits = (i) => dataRows.reduce((n, r) => n + (CODE_RE.test(clean(r[i]).toUpperCase()) ? 1 : 0), 0);
  col.code = -1;
  let best = 0;
  for (const s of SYN.code) {
    const i = h.indexOf(s);
    if (i < 0) continue;
    const n = hits(i);
    if (n > best) { best = n; col.code = i; } // most real codes wins; ties keep the higher-priority name
  }
  return col;
}

export async function parseItemFiles(files, existingRows = []) {
  const X = await XLSX();
  const items = new Map();
  for (const r of existingRows) { const it = rowToItem(r); if (it.code) items.set(it.code, it); }
  const report = [];
  for (const file of files) {
    const wb = X.read(await file.arrayBuffer(), { type: 'array', dense: true });
    for (const name of wb.SheetNames) {
      const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
      for (let hi = 0; hi < Math.min(6, rows.length); hi++) {
        const col = findCols(rows[hi], rows.slice(hi + 1));
        if (col.code < 0 || (col.ref < 0 && col.desc < 0 && col.l < 0 && col.ppc < 0)) continue;
        const isErp = norm(rows[hi][col.uom] || '') === 'base unit of measure';
        let used = 0;
        for (let r = hi + 1; r < rows.length; r++) {
          const row = rows[r];
          const code = clean(row[col.code]).toUpperCase();
          if (!CODE_RE.test(code)) continue;
          used++;
          const it = items.get(code) || { code, ref: '', desc: '', uom: '', ppc: '', l: '', w: '', h: '', nw: '', gw: '', cust: '' };
          const txt = (k) => (col[k] >= 0 ? clean(row[col[k]]) : '');
          const n = (k) => (col[k] >= 0 ? num(row[col[k]]) : 0);
          const ref = txt('ref');
          // Latest row wins (logs are in date order). SPEC's "Refer" column only fills a gap.
          if (ref && !BAD.has(ref.toUpperCase()) && (!col.refWeak || !it.ref)) it.ref = ref;
          const desc = txt('desc');
          if (desc && !BAD.has(desc) && (isErp || !it.desc)) it.desc = desc;
          const uom = UOM_MAP[norm(txt('uom'))];
          if (uom && (isErp || !it.uom)) it.uom = uom;
          for (const k of ['ppc', 'l', 'w', 'h', 'nw', 'gw']) { const v = n(k); if (v > 0) it[k] = v; }
          const cust = txt('cust');
          const st = norm(txt('status'));
          if (cust && st === 'out' && !/transfer|remain|nhan|tra ve/i.test(norm(cust))) it.cust = cust;
          items.set(code, it);
        }
        if (used) report.push({ file: file.name, sheet: name, rows: used });
        break;
      }
    }
  }
  const list = [...items.values()].sort((a, b) => a.code.localeCompare(b.code));
  return {
    rows: list.map(itemToRow),
    report,
    stats: {
      total: list.length,
      withRef: list.filter((i) => i.ref).length,
      withDesc: list.filter((i) => i.desc).length,
      withCarton: list.filter((i) => num(i.ppc) > 0).length,
    },
    sample: list.filter((i) => i.ref).slice(0, 6),
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

function sheetFrom(X, rows, widths, dateCols = []) {
  const conv = rows.map((r, i) => (i === 0 ? r : r.map((v, j) => (dateCols.includes(j) && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : v))));
  const ws = X.utils.aoa_to_sheet(conv, { cellDates: true, dateNF: 'dd/mm/yyyy' });
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

const safeName = (s) => String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

// Rows ready to paste into the stock report, grouped by warehouse sheet.
export function stockRows(records, settings) {
  const byWh = new Map();
  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
  for (const rec of sorted) {
    if (rec.status === 'void') continue;
    for (const b of movementBlocks(rec, settings)) {
      const key = b.wh.code;
      if (!byWh.has(key)) byWh.set(key, { wh: b.wh, layout: b.layout, header: b.header, rows: [] });
      byWh.get(key).rows.push(...b.rows);
    }
  }
  return [...byWh.values()];
}

export async function downloadStockRows(records, settings, label) {
  const X = await XLSX();
  const wb = X.utils.book_new();
  const blocks = stockRows(records, settings);
  for (const b of blocks) {
    const dateCol = b.layout === 'trading' ? 6 : 6;
    const widths = b.layout === 'trading' ? [20, 22, 18, 12, 9, 8, 12, 22, 20] : [18, 22, 26, 12, 8, 8, 12, 22, 14];
    X.utils.book_append_sheet(wb, sheetFrom(X, [b.header, ...b.rows], widths, [dateCol]), safeName(`${b.wh.code} (${b.layout === 'trading' ? 'In-out detail' : 'PRINT'})`));
  }
  if (!blocks.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['No movements in this selection']]), 'Empty');
  X.writeFile(wb, `ILP stock rows ${label || today()}.xlsx`);
}

export function linesTable(records, settings) {
  const header = ['Type', 'Doc no', 'Date', 'Status', 'From', 'To', 'Customer', 'Customer PO', 'Internal code', 'Customer ref', 'Description', 'Quantity', 'Unit', 'Pcs/carton', 'Cartons', 'Packing', 'Work order', 'N.W total (kg)', 'G.W total (kg)', 'Source'];
  const rows = [header];
  for (const rec of records) {
    for (const l of rec.lines || []) {
      const s = split(l.qty, l.ppc);
      const nw = rec.type === 'shipment' ? s.full * num(l.nw) + (s.partial > 0 ? num(l.pnw) : 0) : '';
      const gw = rec.type === 'shipment' ? s.full * num(l.gw) + (s.partial > 0 ? num(l.pgw) : 0) : '';
      rows.push([rec.type, rec.docNo, rec.date, rec.status, rec.fromWh, rec.toWh || '', rec.customer || '', l.po || '', l.code, l.ref || '', l.desc || '', num(l.qty), l.unit || 'piece', num(l.ppc) || '', s.count || '',
        s.count ? `${s.full}T(${num(l.ppc)})${s.partial ? ` + 1T(${s.partial})` : ''}` : '', fmtWO(l.wo), nw === '' ? '' : Math.round(nw * 100) / 100, gw === '' ? '' : Math.round(gw * 100) / 100, 'entered']);
    }
    for (const g of scanGroups(rec)) {
      rows.push([rec.type, rec.docNo, rec.date, rec.status, rec.fromWh, rec.toWh || '', rec.customer || '', '', g.code, g.ref || '', g.desc || '', g.qty, g.unit || 'piece', g.qtyPer, g.cartons, `${g.cartons}T(${g.qtyPer})`, '', '', '', 'scanned']);
    }
  }
  return rows;
}

export async function downloadLines(records, settings, label, format = 'xlsx') {
  const rows = linesTable(records, settings);
  if (format === 'csv') return downloadFile(`ILP records ${label || today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  const X = await XLSX();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, sheetFrom(X, rows, [10, 12, 11, 8, 8, 8, 18, 14, 17, 20, 28, 10, 7, 9, 8, 16, 10, 10, 10, 9], [2]), 'Records');
  X.writeFile(wb, `ILP records ${label || today()}.xlsx`);
}

export async function downloadPackingList(rec) {
  const X = await XLSX();
  const t = totals(rec);
  const head = [
    ['IDEA L PACK — PACKING LIST'],
    ['Invoice no', rec.docNo, '', 'Document date', fmtDate(rec.date)],
    ['Ship to', [rec.customer, rec.shipTo].filter(Boolean).join(' — '), '', 'Contact', rec.contact || ''],
    ['Salesperson', rec.salesperson || '', '', 'Shipping mark', rec.shippingMark || ''],
    ['Country of origin', rec.origin || '', '', 'Delivery note (PXK)', rec.noteNo || ''],
    [],
    ['Customer PO', 'Customer code', 'Internal code', 'Description', 'Carton no', 'Order QTY', 'Number of UOM', 'Qty/UOM', 'Net weight (1 carton)', 'Gross weight (1 carton)', 'L', 'W', 'H', 'Total N.W', 'Total G.W', 'CBM', 'Print date', 'Pack date'],
  ];
  const body = packingRows(rec).map((r) => [r.po || '', r.ref || '', r.code, r.desc || '', r.cartonNo, r.qty, r.uoms, r.perUom, r.nw, r.gw, r.l || '', r.w || '', r.h || '', r.tnw, r.tgw, r.cbm, r.printDate ? fmtDate(r.printDate) : '', r.packDate ? fmtDate(r.packDate) : '']);
  const foot = [['', '', '', 'TOTAL', '', t.qty, t.cartons, '', '', '', '', '', '', t.nw, t.gw, t.cbm, '', '']];
  const ws = X.utils.aoa_to_sheet([...head, ...body, ...foot]);
  ws['!cols'] = [14, 14, 17, 26, 9, 10, 9, 9, 11, 11, 6, 6, 6, 10, 10, 8, 11, 11].map((w) => ({ wch: w }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Packing list');
  X.writeFile(wb, `Packing list ${rec.docNo || rec.id}.xlsx`);
}

export async function downloadLabelList(rec) {
  const rows = [['Carton ID', 'Carton', 'Internal code', 'Customer ref', 'Description', 'Qty', 'Unit', 'Doc no', 'WO / PO', 'Date']];
  for (const c of recordCartons(rec)) rows.push([c.id, `${c.n}/${c.of}`, c.code, c.ref || '', c.desc || '', c.qty, c.unit, rec.docNo, c.extraRef || '', rec.date]);
  downloadFile(`Cartons ${rec.docNo || rec.id}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}

export { LAYOUTS, warehouse };
