// Business rules: carton split, numbering, totals, packing-list rows and Excel export rows.
// Kept free of UI code so it can be tested on its own (see tests/model.test.html).

import { num, round, fmtNum, clean, norm, normLoc } from './util.js';
import { tr } from './i18n.js';

export const TYPES = ['handoff', 'inbound', 'transfer', 'shipment', 'putaway'];

export const typeName = (t) => ({
  handoff: tr('Production handoff', 'Giao nhận thành phẩm'),
  inbound: tr('Supplier receipt', 'Nhập hàng từ nhà cung cấp'),
  transfer: tr('Warehouse transfer', 'Chuyển kho'),
  shipment: tr('Shipment', 'Xuất hàng'),
  putaway: tr('Put away / move to shelf', 'Xếp hàng lên kệ'),
}[t] || t);

export const typeShort = (t) => ({
  handoff: tr('Handoff', 'Giao nhận'),
  inbound: tr('Supplier receipt', 'Nhập NCC'),
  transfer: tr('Transfer', 'Chuyển kho'),
  shipment: tr('Shipment', 'Xuất hàng'),
  putaway: tr('Put away', 'Xếp kệ'),
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
  if (m) return 'WO' + m[1].replace(/\s+/g, '');
  // Work orders from the production plan already carry their own prefix (e.g. IN0010211): keep them as they are.
  if (/^[a-z]/i.test(s)) return s.replace(/\s+/g, '').toUpperCase();
  return 'WO' + s.replace(/\s+/g, '');
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

// The way the floor writes it on the carton: "4×25=100" per carton, "20T=2000" total, "1T=72" odd carton.
const plain = (n) => String(round(num(n), 3));

export function perCartonNotation(ppc, bundle) {
  ppc = num(ppc); bundle = num(bundle);
  if (!(ppc > 0)) return '';
  return bundle > 0 && bundle < ppc && Number.isInteger(round(ppc / bundle, 6)) ? `${round(ppc / bundle, 6)}×${plain(bundle)}=${plain(ppc)}` : plain(ppc);
}

export function handNotation(qty, ppc) {
  const { full, partial } = split(qty, ppc);
  return {
    total: full ? `${full}T=${plain(full * num(ppc))}` : '',
    odd: partial ? `1T=${plain(partial)}` : '',
    grand: full || partial ? plain(num(qty)) : '',
  };
}

export const FSC = [
  { code: '100', label: 'FSC 100%' },
  { code: 'mix', label: 'FSC Mix Credit' },
  { code: 'recycled', label: 'FSC Recycled' },
  { code: 'none', label: 'Non FSC' },
];

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
        fsc: line.fsc || '', perCarton: perCartonNotation(line.ppc, line.bundle),
        lineQty: num(line.qty), lineNotation: handNotation(line.qty, line.ppc),
        shipDate: rec.shipDate || rec.date,
        pallet: cartonPallet(line, i), location: line.location || '', entity: line.entity || '',
        supplierCode: line.supplierCode || '', supplierName: line.supplierName || '', stockInDate: line.stockInDate || '',
      });
    }
  }
  // Shipments and supplier receipts number cartons across the whole packing list (1…N; for shipments
  // repacked cartons first, then the scanned production cartons); production slips per line.
  const across = rec.type === 'shipment' || rec.type === 'inbound';
  const scannedCount = rec.type === 'shipment' ? (rec.scans || []).length : 0;
  out.forEach((c, i) => {
    if (across) { c.n = i + 1; c.of = out.length + scannedCount; }
    else { c.n = c.lineN; c.of = c.lineOf; }
    c.docNo = rec.docNo; c.date = rec.date; c.type = rec.type;
    c.extraRef = across ? c.po : fmtWO(c.wo);
  });
  return out;
}

// Pallet of carton `seq` on a line. Supplier packing lists give "Pallet No" as "13" or a range "1-12"
// plus "boxes/Pallet" (e.g. 50): carton 51 is then on pallet 2.
export function cartonPallet(line, seq) {
  const p = clean(line.pallet);
  if (!p) return '';
  const m = p.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return p;
  const from = +m[1], to = +m[2], per = num(line.perPallet);
  if (!(per > 0)) return p;
  return String(Math.min(to, from + Math.floor((seq - 1) / per)));
}

export function findCartonInRecord(rec, cid) {
  return recordCartons(rec).find((c) => c.id === cid) || null;
}

// ── Lines incl. scanned cartons (transfers / shipments built by scanning) ───

// Scanned cartons grouped into lines: one group per item + carton size.
export function scanGroups(rec) {
  const groups = new Map();
  for (const s of rec.scans || []) {
    const k = [s.code, s.qty, s.nw || '', s.gw || '', s.l || '', s.w || '', s.h || ''].join('|');
    if (!groups.has(k)) {
      groups.set(k, { code: s.code, ref: s.ref, desc: s.desc, unit: s.unit, qtyPer: num(s.qty), cartons: 0, qty: 0, ids: [],
        nw: num(s.nw), gw: num(s.gw), l: num(s.l), w: num(s.w), h: num(s.h), po: (rec.scanPo || {})[s.code] || '' });
    }
    const g = groups.get(k);
    g.cartons += 1; g.qty += num(s.qty); g.ids.push(s.cid);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code) || b.qtyPer - a.qtyPer);
}

// ── Pick list (pick up) ─────────────────────────────────────────────────────
// A shipment can carry the customer's delivery packing list as `rec.pick` (what must go out).
// The warehouse scans cartons against it; this compares what was scanned with what was asked.

export function pickFromLines(lines) {
  const by = new Map();
  for (const l of lines) {
    const k = l.code;
    const p = by.get(k) || { code: l.code, ref: l.ref || '', desc: l.desc || '', po: l.po || '', qty: 0, cartons: 0, ppc: num(l.ppc) || '' };
    p.qty = round(p.qty + num(l.qty), 3);
    p.cartons += split(l.qty, l.ppc).count;
    if (p.ppc !== num(l.ppc)) p.ppc = '';
    by.set(k, p);
  }
  return [...by.values()];
}

// [{ code, ref, desc, po, qty, cartons, gotQty, gotCartons, status: 'todo' | 'part' | 'done' | 'over' }] + extra codes not asked for.
export function pickProgress(rec) {
  const got = new Map();
  for (const s of rec.scans || []) {
    const g = got.get(s.code) || { qty: 0, cartons: 0 };
    g.qty = round(g.qty + num(s.qty), 3); g.cartons += 1;
    got.set(s.code, g);
  }
  const rows = (rec.pick || []).map((p) => {
    const g = got.get(p.code) || { qty: 0, cartons: 0 };
    const status = !g.qty ? 'todo' : g.qty < p.qty ? 'part' : g.qty > p.qty ? 'over' : 'done';
    return { ...p, gotQty: g.qty, gotCartons: g.cartons, status };
  });
  const asked = new Set(rows.map((r) => r.code));
  const extra = [...got.entries()].filter(([c]) => !asked.has(c)).map(([code, g]) => ({ code, gotQty: g.qty, gotCartons: g.cartons }));
  const sum = (f) => rows.reduce((a, r) => a + r[f], 0);
  return { rows, extra, qty: round(sum('qty'), 3), gotQty: round(sum('gotQty'), 3), cartons: sum('cartons'), gotCartons: sum('gotCartons'),
    complete: rows.length > 0 && rows.every((r) => r.status === 'done') && !extra.length };
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
    if (rec.type === 'handoff') continue;
    qty += num(s.qty); cartons += 1; units.add(s.unit || 'piece');
    nw += num(s.nw); gw += num(s.gw); cbm += (num(s.l) * num(s.w) * num(s.h)) / 1e6;
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
  // Production cartons shipped as they are (scanned) keep their own labels.
  for (const g of rec.type === 'shipment' ? scanGroups(rec) : []) {
    const from = n + 1; n += g.cartons;
    const cbmOne = (g.l * g.w * g.h) / 1e6;
    rows.push({ po: g.po, ref: g.ref, code: g.code, desc: g.desc, l: g.l, w: g.w, h: g.h, printDate: '', packDate: '', unit: g.unit, scanned: true,
      cartonNo: g.cartons > 1 ? `${from}-${n}` : `${from}`, qty: g.qty, uoms: g.cartons, perUom: g.qtyPer,
      nw: g.nw || '', gw: g.gw || '', tnw: g.nw ? round(g.cartons * g.nw, 2) : '', tgw: g.gw ? round(g.cartons * g.gw, 2) : '', cbm: cbmOne ? round(cbmOne * g.cartons, 3) : '' });
  }
  return rows;
}

// ── Receipt confirmation (warehouse counts what production handed over) ─────

export const hasReceipt = (rec) => rec.type === 'handoff' || rec.type === 'transfer' || rec.type === 'inbound';

export function expectedCartonIds(rec) {
  return [...recordCartons(rec).map((c) => c.id), ...(rec.scans || []).map((s) => s.cid)];
}

// { status: 'pending' | 'received', expected, counted, missing, by, at }
export function receiptState(rec) {
  const expected = expectedCartonIds(rec);
  const r = rec.receipt;
  if (!r) return { status: 'pending', expected: expected.length, counted: 0, missing: expected.length };
  const got = new Set(r.ids || []);
  const missing = expected.filter((id) => !got.has(id)).length;
  return { status: 'received', expected: expected.length, counted: expected.length - missing, missing, by: r.by || '', at: r.at || 0 };
}

// ── Excel export rows ───────────────────────────────────────────────────────
// Two layouts exist in the stock workbooks today:
//   'print'   → STOCK REPORT Print, sheet "PRINT"
//   'trading' → STOCK REPORT Trading, sheet "In-out detail"
// Header text is copied exactly (including "INTERAL CODE") so columns line up when pasted.

export const LAYOUTS = {
  // The real PRINT sheet keeps Description empty and has an unlabelled 10th column with the PNK / PXK number.
  print: ['SKU', 'Customer ref', 'Description', 'Quantity', 'UOM', 'Status', 'Date', 'Shipping Docs', 'Remark', 'PNK / PXK'],
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
    return [g.code, g.ref || '', '', signed, g.unit || 'piece', dir === 'in' ? 'In' : 'out', rec.date, docs, remark || '', noteNo || ''];
  };
  if (rec.type === 'handoff') {
    const rows = movedGroups(rec, { perLine: true }).map((g) => row(to.layout, 'in', g, 'Nhận thành phẩm', fmtWO(g.wo), '', rec.noteNo));
    blocks.push({ wh: to, direction: 'in', layout: to.layout, header: LAYOUTS[to.layout], rows });
  } else if (rec.type === 'putaway') {
    return blocks; // moving inside a warehouse changes no stock totals
  } else if (rec.type === 'inbound') {
    const rows = movedGroups(rec, { perLine: true }).map((g) => row(to.layout, 'in', g, rec.supplier || 'supplier', g.po || rec.extRef || '', rec.docNo, rec.noteNo));
    blocks.push({ wh: to, direction: 'in', layout: to.layout, header: LAYOUTS[to.layout], rows });
  } else if (rec.type === 'transfer') {
    const groups = movedGroups(rec);
    blocks.push({ wh: from, direction: 'out', layout: from.layout, header: LAYOUTS[from.layout],
      rows: groups.map((g) => row(from.layout, 'out', g, `transfer to ${to.short}`, '', rec.extRef, rec.outNoteNo)) });
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
  if (rec.type === 'shipment') req(clean(rec.customer), 'Customer is required.', 'Cần nhập khách hàng.');
  if (rec.type === 'putaway') {
    req(normLoc(rec.loc), 'Location is required.', 'Cần nhập vị trí.');
    req(rec.toWh, 'Warehouse is required.', 'Cần chọn kho.');
    req((rec.scans || []).length, 'Scan at least one carton.', 'Cần quét ít nhất một thùng.');
    return errors;
  }
  if (rec.type === 'inbound') { req(clean(rec.supplier), 'Supplier is required.', 'Cần nhập nhà cung cấp.'); req(rec.toWh, 'Receiving warehouse is required.', 'Cần chọn kho nhận.'); }
  else if (rec.type !== 'shipment') req(rec.fromWh !== rec.toWh, 'From and To must be different.', 'Nơi giao và nơi nhận phải khác nhau.');
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

// ── Supplier packing list → lines ───────────────────────────────────────────
// Reads the rows of a packing list sheet (array of arrays, as SheetJS gives them). Works with the
// supplier packing lists the group receives (e.g. "IDEA L PACK B.V" layout: Customer PO, Customer Style,
// Internal Code, Description, Order Qty, Number of UOM, Qty/UOM, Net/Gross weight (1 carton),
// L/W/H (1 carton), boxes/Pallet, Pallet No) and with our own packing list export.
// Header cells may span two rows (merged cells); carton columns are told apart from pallet columns.

const key = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const PL_COLS = [
  ['code', (k) => ['internalcode', 'interalcode', 'ilpcode', 'sku', 'itemcode', 'mahang', 'ideaitemno', 'ideaitem', 'ourref'].includes(k) || k.startsWith('internalcode')],
  ['po', (k) => ['customerpo', 'po', 'pono', 'purchaseorder'].includes(k) || k.startsWith('customerpo') || k.startsWith('ponumber')],
  ['ref', (k) => ['customerstyle', 'customercode', 'customerref', 'customeritemno', 'yourref', 'reference', 'referenceno', 'refno', 'makhachhang', 'makh'].some((x) => k.startsWith(x))],
  ['desc', (k) => k.startsWith('description') || k.startsWith('tenhang') || k === 'productname'],
  ['uoms', (k) => k.startsWith('numberofuom') || ['cartons', 'ctns', 'noofcartons', 'numberofcartons', 'sothung', 'cartonqty'].includes(k)],
  ['ppc', (k) => k.startsWith('qtyuom') || k.startsWith('quantityuom') || ['pcscarton', 'pcsctn', 'qtycarton', 'qtyctn', 'pcsbox', 'qtybox'].includes(k)],
  ['qty', (k) => k.startsWith('orderqty') || ['qty', 'quantity', 'quantitypc', 'quantitypcs', 'shippedqty', 'totalqty', 'totalquantity', 'qtypcs', 'soluong',
    'quantityreceive', 'quantityreceived', 'qtyreceive', 'qtyreceived', 'receivedqty'].includes(k)],
  ['nw', (k) => (k.startsWith('netweight') || k.startsWith('nw')) && !k.includes('pallet')],
  ['gw', (k) => (k.startsWith('grossweight') || k.startsWith('gw')) && !k.includes('pallet')],
  ['l', (k) => !k.includes('pallet') && (k === 'l' || k.startsWith('l1carton') || ['lcm', 'length', 'lengthcm', 'lenght', 'lenghtcm'].includes(k))],
  ['w', (k) => !k.includes('pallet') && (k === 'w' || k.startsWith('w1carton') || ['wcm', 'width', 'widthcm'].includes(k))],
  ['h', (k) => !k.includes('pallet') && (k === 'h' || k.startsWith('h1carton') || ['hcm', 'height', 'heightcm'].includes(k))],
  ['location', (k) => ['location', 'vitri', 'loc', 'binlocation'].includes(k)],
  ['entity', (k) => ['entities', 'entity', 'company'].includes(k)],
  ['supplierName', (k) => ['suppliername', 'supliername', 'supplier', 'nhacungcap'].includes(k)],
  ['supplierCode', (k) => ['suppliercode', 'supliercode'].includes(k)],
  ['unit', (k) => ['unitcode', 'uom', 'unit', 'dvt', 'donvitinh'].includes(k)],
  ['date', (k) => ['stockindate', 'receivedate', 'receiveddate', 'dateofreceipt', 'ngaynhap'].includes(k)],
  ['perPallet', (k) => ['boxespallet', 'boxpallet', 'ctnspallet', 'cartonspallet', 'ctnpallet'].includes(k)],
  ['pallet', (k) => ['palletno', 'palletnumber', 'palletnos'].includes(k)],
];

function plColumns(cells) {
  const keys = cells.map(key);
  const col = {};
  const used = new Set();
  for (const [f, test] of PL_COLS) {
    const i = keys.findIndex((k, j) => k && !used.has(j) && test(k));
    if (i >= 0) { col[f] = i; used.add(i); }
  }
  return col;
}

export function packingListLines(rows, { firstLn = 1 } = {}) {
  const txt = (v) => clean(v);
  let col = null, start = 0;
  const ok = (c) => c.code !== undefined && (c.qty !== undefined || (c.uoms !== undefined && c.ppc !== undefined));
  const top = Math.min(rows.length, 25);
  // First a one-row header; only if there is none, a header split over two rows
  // ("Internal" / "code"): each column's text joined with the row below.
  for (let hi = 0; hi < top && !col; hi++) {
    const one = plColumns(rows[hi] || []);
    if (ok(one)) { col = one; start = hi + 1; }
  }
  for (let hi = 0; hi < top && !col; hi++) {
    const next = rows[hi + 1] || [];
    const width = Math.max((rows[hi] || []).length, next.length);
    const two = plColumns(Array.from({ length: width }, (_, j) => `${txt((rows[hi] || [])[j])} ${txt(next[j])}`));
    if (ok(two)) { col = two; start = hi + 2; }
  }
  if (!col) return { lines: [], warnings: [tr('No packing list header found (needs at least Internal code and Quantity columns).', 'Không tìm thấy dòng tiêu đề packing list (cần ít nhất cột Internal code và Số lượng).')] };
  const lines = [];
  const warnings = [];
  const suppliers = new Set(), dates = new Set();
  let noQty = 0;
  let ln = firstLn;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (f) => (col[f] === undefined ? '' : row[col[f]]);
    const code = txt(get('code')).toUpperCase();
    if (!code || /\s/.test(code)) continue; // totals, notes, addresses
    let qty = num(get('qty')), ppc = num(get('ppc'));
    const uoms = num(get('uoms'));
    if (!qty && uoms && ppc) qty = round(uoms * ppc, 3);
    if (!ppc && uoms && qty && Number.isInteger(round(qty / uoms, 6))) ppc = round(qty / uoms, 6);
    // A stock-in sheet with pcs/carton but the received quantity still empty: count it as one full carton.
    if (!qty && !uoms && ppc > 0) { qty = ppc; noQty++; }
    if (!(qty > 0)) continue;
    const sup = txt(get('supplierName')) || txt(get('supplierCode'));
    if (sup) suppliers.add(sup);
    const d = excelDate(get('date'));
    if (d) dates.add(d);
    const sp = split(qty, ppc);
    if (uoms && sp.count && sp.count !== uoms) warnings.push(tr(`Row ${r + 1} (${code}): the list says ${uoms} cartons, but ${fmtNum(qty)} ÷ ${fmtNum(ppc)} gives ${sp.count}.`, `Dòng ${r + 1} (${code}): packing list ghi ${uoms} thùng, nhưng ${fmtNum(qty)} ÷ ${fmtNum(ppc)} = ${sp.count} thùng.`));
    const n = (f) => (num(get(f)) > 0 ? num(get(f)) : '');
    lines.push({
      ln: ln++, code, ref: txt(get('ref')), desc: txt(get('desc')), unit: unitCode(get('unit')), qty, ppc: ppc || '', reqQty: '', wo: '', po: txt(get('po')),
      nw: n('nw'), gw: n('gw'), pnw: '', pgw: '', l: n('l'), w: n('w'), h: n('h'), printDate: '', packDate: '', fsc: '', bundle: '',
      pallet: txt(get('pallet')), perPallet: n('perPallet'), location: txt(get('location')).toUpperCase(), entity: txt(get('entity')),
      supplierCode: txt(get('supplierCode')), supplierName: txt(get('supplierName')), stockInDate: excelDate(get('date')),
    });
  }
  if (noQty) warnings.push(tr(`${noQty} rows have no quantity received — each was counted as 1 full carton. Please check.`, `${noQty} dòng chưa có số lượng nhận — mỗi dòng được tính là 1 thùng đủ. Vui lòng kiểm tra.`));
  if (!lines.length) warnings.push(tr('The header was found but no item rows with a quantity.', 'Đã thấy dòng tiêu đề nhưng không có dòng hàng nào có số lượng.'));
  return { lines, warnings, supplier: suppliers.size === 1 ? [...suppliers][0] : '', date: dates.size === 1 ? [...dates][0] : '' };
}

const UNIT_MAP = { pcs: 'piece', pc: 'piece', pce: 'piece', piece: 'piece', cai: 'piece', box: 'box', hop: 'box', set: 'set', bo: 'set', roll: 'roll', cuon: 'roll', sheet: 'sheet', to: 'sheet', ream: 'ream', pair: 'pair', kg: 'kg' };
const unitCode = (v) => UNIT_MAP[norm(v).replace(/[^a-z]/g, '')] || 'piece';

// Excel dates arrive as serial numbers (raw) or Date objects; text like 01/11/2026 is day-first.
export function excelDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const m = clean(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(clean(v)) ? clean(v).slice(0, 10) : '';
}

// ── Stock by location (storage) ─────────────────────────────────────────────
// Where every carton is now. Cartons are created by production slips, supplier receipts and
// transfer lines (their first location is the line's location, e.g. from the stock-in sheet);
// then, in date order, a transfer moves them to another warehouse (location unknown until put away),
// a put-away places them on a shelf, and a shipment takes them out of stock.

const recOrder = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0);

export function currentStock(records) {
  const live = [...records].filter((r) => r.status !== 'void' && !r.deleted).sort(recOrder);
  const now = new Map();
  for (const r of live) {
    if (r.type === 'shipment' || r.type === 'putaway') continue;
    for (const c of recordCartons(r)) now.set(c.id, { cid: c.id, code: c.code, ref: c.ref || '', desc: c.desc || '', unit: c.unit, qty: c.qty, wh: r.toWh, loc: normLoc(c.location), date: r.date, recId: r.id });
  }
  for (const r of live) {
    for (const s of r.scans || []) {
      const c = now.get(s.cid);
      if (!c) continue;
      if (r.type === 'shipment') now.delete(s.cid);
      else if (r.type === 'putaway') Object.assign(c, { wh: r.toWh, loc: normLoc(r.loc), date: r.date });
      else if (r.type === 'transfer') Object.assign(c, { wh: r.toWh, loc: '', date: r.date });
    }
  }
  return [...now.values()];
}

// Natural order for locations: A.1.2 < A.1.10 < A.2.1 < B.1.1; cartons without a location last.
export function locCompare(a, b) {
  if (!a !== !b) return a ? -1 : 1;
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

// The France stock report layout: one row per location + reference + quantity per carton.
export function stockByLocation(stock, wh) {
  const g = new Map();
  for (const c of stock) {
    if (wh && c.wh !== wh) continue;
    const k = [c.loc, c.code, c.qty].join('|');
    const row = g.get(k) || { loc: c.loc, code: c.code, ref: c.ref, desc: c.desc, unit: c.unit, perCarton: c.qty, cartons: 0, qty: 0, cids: [] };
    row.cartons += 1; row.qty = round(row.qty + num(c.qty), 3); row.cids.push(c.cid);
    g.set(k, row);
  }
  return [...g.values()].sort((a, b) => locCompare(a.loc, b.loc) || a.code.localeCompare(b.code) || b.perCarton - a.perCarton);
}

// "A.1.2" → rack "A"; "A01" → "A"; free text → its first part.
export const rackOf = (loc) => (normLoc(loc).match(/^([A-Z]+)/) || [, normLoc(loc).split(/[.\-/]/)[0] || ''])[1];
// "A.1.2" → "A. 1. 2" as written in the France report.
export const locLabel = (loc) => (/^[A-Z]+(\.\d+)+$/.test(normLoc(loc)) ? normLoc(loc).split('.').join('. ') : normLoc(loc));

// ── Standard stock data (one format for every warehouse) ────────────────────
// Ms Ly's file "QR project detail data.xlsx": the same columns for input (sheet "QR in") and
// export (sheet "Stock data"), one row per carton; "Barcode number" = the carton ID in the QR.
// Her header spelling is kept exactly so files line up.

export const STOCK_IN_HEADER = ['Entities', 'Customer Item No', 'Idea Item No', 'Product Name', 'Unit Code', 'Location', 'Pcs/carton', 'Lenght (cm)', 'Width (cm)', 'Height (cm)', 'net weight', 'gross weight', 'CBM', 'stock in date', 'PO number/ WO number', 'Suplier code', 'Suplier name', 'Quantity receive', 'sticker'];
export const STOCK_DATA_HEADER = ['Entities', 'Customer Item No', 'Idea Item No', 'Product Name', 'Barcode number', 'Unit Code', 'Location', 'Pcs/carton', 'Lenght (cm)', 'Width (cm)', 'Height (cm)', 'net weight', 'gross weight', 'CBM', 'stock in date', 'PO number/ WO number', 'Suplier code', 'Suplier name', 'shipped date', 'invoice No', 'Customer'];

const UNIT_OUT = { piece: 'pcs' };

// Every labelled carton with where it is now, or when / how it was shipped.
export function cartonLedger(records, { whName = (c) => c } = {}) {
  const live = [...records].filter((r) => r.status !== 'void' && !r.deleted).sort(recOrder);
  const all = new Map();
  for (const r of live) {
    if (r.type === 'shipment' || r.type === 'putaway') continue;
    for (const c of recordCartons(r)) {
      all.set(c.id, {
        cid: c.id, code: c.code, ref: c.ref || '', desc: c.desc || '', unit: c.unit, qty: c.qty,
        entity: c.entity || whName(r.toWh), wh: r.toWh, loc: normLoc(c.location),
        l: c.l, w: c.w, h: c.h, nw: c.nw, gw: c.gw,
        inDate: c.stockInDate || r.date, po: c.po || fmtWO(c.wo) || (r.type === 'inbound' ? r.extRef || '' : ''),
        supCode: c.supplierCode || (r.type === 'handoff' ? 'production' : ''), supName: c.supplierName || (r.type === 'inbound' ? r.supplier || '' : r.type === 'handoff' ? 'production' : whName(r.fromWh)),
        shipped: null,
      });
    }
  }
  for (const r of live) {
    for (const s of r.scans || []) {
      const c = all.get(s.cid);
      if (!c || c.shipped) continue;
      if (r.type === 'shipment') c.shipped = { date: r.shipDate || r.date, invoice: r.docNo, customer: r.customer || '', po: (r.scanPo || {})[c.code] || '' };
      else if (r.type === 'putaway') Object.assign(c, { wh: r.toWh, loc: normLoc(r.loc) });
      else if (r.type === 'transfer') Object.assign(c, { wh: r.toWh, loc: '' });
    }
  }
  return [...all.values()];
}

export function stockDataRows(ledger, { wh, inStockOnly = false } = {}) {
  return ledger
    .filter((c) => (!wh || c.wh === wh) && (!inStockOnly || !c.shipped))
    .sort((a, b) => locCompare(a.loc, b.loc) || a.code.localeCompare(b.code) || a.cid.localeCompare(b.cid, 'en', { numeric: true }))
    .map((c) => [c.entity, c.ref, c.code, c.desc, c.cid, UNIT_OUT[c.unit] || c.unit || 'pcs', locLabel(c.loc), c.qty,
      c.l || '', c.w || '', c.h || '', c.nw || '', c.gw || '', c.l && c.w && c.h ? round((num(c.l) * num(c.w) * num(c.h)) / 1e6, 6) : '',
      c.inDate || '', c.po || '', c.supCode, c.supName, c.shipped ? c.shipped.date : '', c.shipped ? c.shipped.invoice : '', c.shipped ? c.shipped.customer : '']);
}
