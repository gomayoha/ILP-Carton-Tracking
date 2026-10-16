// Business rules: carton split, numbering, totals, packing-list rows and Excel export rows.
// Kept free of UI code so it can be tested on its own (see tests/model.test.html).

import { num, round, fmtNum, clean } from './util.js';
import { tr } from './i18n.js';

export const TYPES = ['handoff', 'transfer', 'shipment'];

export const typeName = (t) => ({
  handoff: tr('Production handoff', 'Giao nhận thành phẩm'),
  transfer: tr('Warehouse transfer', 'Chuyển kho'),
  shipment: tr('Shipment', 'Xuất hàng'),
}[t] || t);

export const typeShort = (t) => ({
  handoff: tr('Handoff', 'Giao nhận'),
  transfer: tr('Transfer', 'Chuyển kho'),
  shipment: tr('Shipment', 'Xuất hàng'),
}[t] || t);

export const UNITS = [
  { code: 'piece', en: 'pcs', vi: 'cái' },
  { code: 'box', en: 'box', vi: 'hộp' },
  { code: 'set', en: 'set', vi: 'bộ' },
  { code: 'roll', en: 'roll', vi: 'cuộn' },
  { code: 'sheet', en: 'sheet', vi: 'tờ' },
  { code: 'ream', en: 'ream', vi: 'ram' },
  { code: 'pair', en: 'pair', vi: 'đôi' },
  { code: 'kg', en: 'kg', vi: 'kg' },
];

export function unitLabel(code) {
  const u = UNITS.find((x) => x.code === code);
  return u ? tr(u.en, u.vi) : (code || '');
}

// Work orders are typed many ways ("10131", "wo10131", "WO 10131") — show them one way.
export function fmtWO(wo) {
  const s = clean(wo);
  if (!s) return '';
  const m = s.match(/^w\.?o\.?\s*(.*)$/i);
  return 'WO' + (m ? m[1] : s).replace(/\s+/g, '');
}

// ── Cartons ─────────────────────────────────────────────────────────────────

// Quantity + pieces per carton → full cartons + one partial carton.
// 3440 @ 100 → 34 full + 40 partial  (paper notation "34T(100) + 1T(40)")
export function split(qty, ppc) {
  qty = num(qty); ppc = num(ppc);
  if (!(qty > 0) || !(ppc > 0)) return { full: 0, partial: 0, count: 0 };
  const full = Math.floor(round(qty / ppc, 6));
  const partial = round(qty - full * ppc, 3);
  return { full, partial, count: full + (partial > 0 ? 1 : 0) };
}

export function notation(qty, ppc) {
  const { full, partial } = split(qty, ppc);
  if (!full && !partial) return '';
  const parts = [];
  if (full) parts.push(`${full}T(${fmtNum(num(ppc), num(ppc) % 1 ? 2 : 0)})`);
  if (partial) parts.push(`1T(${fmtNum(partial, partial % 1 ? 2 : 0)})`);
  return parts.join(' + ');
}

export const cartonId = (recId, ln, seq) => `${recId}-${ln}-${seq}`;

// Cartons created by this record's own lines (production labels for handoff/transfer,
// shipping labels for shipments). Scanned cartons are not included — they already have labels.
export function recordCartons(rec) {
  const out = [];
  for (const line of rec.lines || []) {
    const { full, partial, count } = split(line.qty, line.ppc);
    for (let i = 1; i <= count; i++) {
      const isPartial = i > full;
      out.push({
        id: cartonId(rec.id, line.ln, i),
        recId: rec.id, ln: line.ln, seq: i,
        qty: isPartial ? partial : num(line.ppc),
        isPartial, lineN: i, lineOf: count,
        code: line.code, ref: line.ref, desc: line.desc, unit: line.unit || 'piece',
        wo: line.wo, po: line.po,
        nw: isPartial ? num(line.pnw) : num(line.nw),
        gw: isPartial ? num(line.pgw) : num(line.gw),
        l: num(line.l), w: num(line.w), h: num(line.h),
      });
    }
  }
  // Shipments number cartons across the whole packing list (1…N); others per line.
  out.forEach((c, i) => {
    if (rec.type === 'shipment') { c.n = i + 1; c.of = out.length; }
    else { c.n = c.lineN; c.of = c.lineOf; }
    c.docNo = rec.docNo; c.date = rec.date; c.type = rec.type;
    c.extraRef = rec.type === 'shipment' ? c.po : fmtWO(c.wo);
  });
  return out;
}

export function findCartonInRecord(rec, cid) {
  return recordCartons(rec).find((c) => c.id === cid) || null;
}

// ── Lines incl. scanned cartons (transfers / shipments built by scanning) ───

// Scanned cartons grouped into lines: one group per item + carton size.
export function scanGroups(rec) {
  const groups = new Map();
  for (const s of rec.scans || []) {
    const k = `${s.code}|${s.qty}`;
    if (!groups.has(k)) groups.set(k, { code: s.code, ref: s.ref, desc: s.desc, unit: s.unit, qtyPer: num(s.qty), cartons: 0, qty: 0, ids: [] });
    const g = groups.get(k);
    g.cartons += 1; g.qty += num(s.qty); g.ids.push(s.cid);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code) || b.qtyPer - a.qtyPer);
}

// ── Totals ──────────────────────────────────────────────────────────────────

export function lineWeights(line) {
  const { full, partial, count } = split(line.qty, line.ppc);
  const cbmOne = (num(line.l) * num(line.w) * num(line.h)) / 1e6;
  return {
    full, partial, count,
    nw: full * num(line.nw) + (partial > 0 ? num(line.pnw) : 0),
    gw: full * num(line.gw) + (partial > 0 ? num(line.pgw) : 0),
    cbm: cbmOne * count,
  };
}

export function totals(rec) {
  let qty = 0, cartons = 0, nw = 0, gw = 0, cbm = 0;
  const units = new Set();
  for (const line of rec.lines || []) {
    const w = lineWeights(line);
    qty += num(line.qty); cartons += w.count; nw += w.nw; gw += w.gw; cbm += w.cbm;
    units.add(line.unit || 'piece');
  }
  for (const s of rec.scans || []) {
    if (rec.type === 'transfer') { qty += num(s.qty); cartons += 1; units.add(s.unit || 'piece'); }
  }
  return {
    qty: round(qty, 3), cartons, nw: round(nw, 2), gw: round(gw, 2), cbm: round(cbm, 3),
    unit: units.size === 1 ? [...units][0] : '', lines: (rec.lines || []).length, scanned: (rec.scans || []).length,
  };
}

// ── Packing list rows (match the existing Idea L Pack packing list) ─────────

export function packingRows(rec) {
  const rows = [];
  let n = 0;
  for (const line of rec.lines || []) {
    const { full, partial } = split(line.qty, line.ppc);
    const cbmOne = (num(line.l) * num(line.w) * num(line.h)) / 1e6;
    const base = {
      po: line.po, ref: line.ref, code: line.code, desc: line.desc,
      l: num(line.l), w: num(line.w), h: num(line.h),
      printDate: line.printDate, packDate: line.packDate, unit: line.unit,
    };
    if (full > 0) {
      const from = n + 1; n += full;
      rows.push({ ...base, cartonNo: full > 1 ? `${from}-${n}` : `${from}`, qty: full * num(line.ppc), uoms: full, perUom: num(line.ppc),
        nw: num(line.nw), gw: num(line.gw), tnw: round(full * num(line.nw), 2), tgw: round(full * num(line.gw), 2), cbm: round(cbmOne * full, 3) });
    }
    if (partial > 0) {
      n += 1;
      rows.push({ ...base, cartonNo: `${n}`, qty: partial, uoms: 1, perUom: partial,
        nw: num(line.pnw), gw: num(line.pgw), tnw: round(num(line.pnw), 2), tgw: round(num(line.pgw), 2), cbm: round(cbmOne, 3) });
    }
    if (!(num(line.ppc) > 0) && num(line.qty) > 0) {
      rows.push({ ...base, cartonNo: '', qty: num(line.qty), uoms: '', perUom: '', nw: '', gw: '', tnw: '', tgw: '', cbm: '' });
    }
  }
  return rows;
}

// ── Excel export rows ───────────────────────────────────────────────────────
// Two layouts exist in the stock workbooks today:
//   'print'   → STOCK REPORT Print, sheet "PRINT"
//   'trading' → STOCK REPORT Trading, sheet "In-out detail"
// Header text is copied exactly (including "INTERAL CODE") so columns line up when pasted.

export const LAYOUTS = {
  print: ['SKU', 'Customer ref', 'Description', 'Quantity', 'UOM', 'Status', 'Date', 'Shipping Docs', 'Remark'],
  trading: ['PACKING NO/ INVOICE No', 'REFERENCE', 'INTERAL CODE', 'SHIPPED QTY', 'CARTONS', 'STATUS', 'Date ', 'CUSTOMER', 'DELIVERY NOTED NUMBER'],
};

function groupsForLine(line) {
  const { full, partial } = split(line.qty, line.ppc);
  const g = [];
  if (full > 0) g.push({ qty: full * num(line.ppc), cartons: full });
  if (partial > 0) g.push({ qty: partial, cartons: 1 });
  if (!g.length && num(line.qty) > 0) g.push({ qty: num(line.qty), cartons: '' });
  return g;
}

// Everything that moved, as { code, ref, desc, unit, qty, cartons, wo } groups.
function movedGroups(rec, { perLine = false } = {}) {
  const out = [];
  for (const line of rec.lines || []) {
    if (perLine) {
      const { count } = split(line.qty, line.ppc);
      if (num(line.qty) > 0) out.push({ ...line, qty: num(line.qty), cartons: count || '' });
    } else {
      for (const g of groupsForLine(line)) out.push({ ...line, qty: g.qty, cartons: g.cartons });
    }
  }
  for (const g of scanGroups(rec)) out.push({ code: g.code, ref: g.ref, desc: g.desc, unit: g.unit, qty: g.qty, cartons: g.cartons });
  return out;
}

export function warehouse(settings, code) {
  return (settings.warehouses || []).find((w) => w.code === code) || { code, name: code, vi: code, short: String(code || '').toLowerCase(), layout: 'print' };
}

// Returns [{ wh, direction, layout, header, rows }] — one block per warehouse sheet to update.
export function movementBlocks(rec, settings) {
  const from = warehouse(settings, rec.fromWh);
  const to = warehouse(settings, rec.toWh);
  const blocks = [];
  const row = (layout, dir, g, docs, remark, invoice, noteNo) => {
    const signed = dir === 'out' ? -g.qty : g.qty;
    if (layout === 'trading') return [invoice || '', g.ref || '', g.code, signed, g.cartons, dir, rec.date, docs, noteNo || ''];
    return [g.code, g.ref || '', g.desc || '', signed, g.unit || 'piece', dir === 'in' ? 'In' : 'out', rec.date, docs, remark || ''];
  };
  if (rec.type === 'handoff') {
    const rows = movedGroups(rec, { perLine: true }).map((g) => row(to.layout, 'in', g, 'Nhận thành phẩm', fmtWO(g.wo), '', rec.docNo));
    blocks.push({ wh: to, direction: 'in', layout: to.layout, header: LAYOUTS[to.layout], rows });
  } else if (rec.type === 'transfer') {
    const groups = movedGroups(rec);
    blocks.push({ wh: from, direction: 'out', layout: from.layout, header: LAYOUTS[from.layout],
      rows: groups.map((g) => row(from.layout, 'out', g, `transfer to ${to.short}`, '', rec.extRef, rec.noteNo)) });
    blocks.push({ wh: to, direction: 'in', layout: to.layout, header: LAYOUTS[to.layout],
      rows: groups.map((g) => row(to.layout, 'in', g, `transfer from ${from.short}`, '', rec.extRef, rec.noteNo)) });
  } else if (rec.type === 'shipment') {
    const groups = movedGroups(rec);
    blocks.push({ wh: from, direction: 'out', layout: from.layout, header: LAYOUTS[from.layout],
      rows: groups.map((g) => row(from.layout, 'out', g, rec.customer || '', rec.docNo, rec.docNo, rec.noteNo)) });
  }
  return blocks;
}

// ── Validation ──────────────────────────────────────────────────────────────

export function validate(rec, { docNoTaken } = {}) {
  const errors = [];
  const req = (cond, en, vi) => { if (!cond) errors.push(tr(en, vi)); };
  req(clean(rec.docNo), 'Document number is required.', 'Cần nhập số phiếu.');
  if (clean(rec.docNo) && docNoTaken) req(!docNoTaken, `Number ${rec.docNo} is already used by another ${typeShort(rec.type).toLowerCase()}.`, `Số ${rec.docNo} đã được dùng cho phiếu khác.`);
  req(rec.date, 'Date is required.', 'Cần nhập ngày.');
  if (rec.type === 'handoff') req(clean(rec.receivedBy), 'Received by is required.', 'Cần nhập người nhận.');
  if (rec.type === 'shipment') req(clean(rec.customer), 'Customer is required.', 'Cần nhập khách hàng.');
  if (rec.type !== 'shipment') req(rec.fromWh !== rec.toWh, 'From and To must be different.', 'Nơi giao và nơi nhận phải khác nhau.');
  const lines = rec.lines || [];
  req(lines.length || (rec.scans || []).length, 'Add at least one item.', 'Cần thêm ít nhất một mã hàng.');
  lines.forEach((l, i) => {
    const n = i + 1;
    req(clean(l.code), `Line ${n}: item code is required.`, `Dòng ${n}: cần nhập mã hàng.`);
    req(num(l.qty) > 0, `Line ${n}: quantity must be more than 0.`, `Dòng ${n}: số lượng phải lớn hơn 0.`);
    if (num(l.ppc) < 0) errors.push(tr(`Line ${n}: pcs per carton cannot be negative.`, `Dòng ${n}: số lượng/thùng không được âm.`));
  });
  return errors;
}
