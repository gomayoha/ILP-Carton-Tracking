// Printable outputs: carton labels, the handoff slip (matches "Phiếu Giao Nhận Thành Phẩm")
// and the packing list (matches the Idea L Pack packing list).

import { tr, bi } from './i18n.js';
import { qrSvg, cartonPayload, recordPayload } from './qr.js';
import { recordCartons, packingRows, totals, notation, fmtWO, unitLabel, warehouse, scanGroups, typeName } from './model.js';
import { fmtDate, fmtNum, fmtDec, num, round } from './util.js';
import { state } from './store.js';

export const LABEL_PRESETS = {
  'thermal-100x70': { w: 100, h: 70, en: 'Thermal roll · 100 × 70 mm', vi: 'Cuộn nhiệt · 100 × 70 mm' },
  'thermal-100x50': { w: 100, h: 50, en: 'Thermal roll · 100 × 50 mm', vi: 'Cuộn nhiệt · 100 × 50 mm' },
  'thermal-100x150': { w: 100, h: 150, en: 'Thermal roll · 100 × 150 mm (4×6")', vi: 'Cuộn nhiệt · 100 × 150 mm (4×6")' },
  'thermal-75x50': { w: 75, h: 50, en: 'Thermal roll · 75 × 50 mm', vi: 'Cuộn nhiệt · 75 × 50 mm' },
  'a4-8': { w: 105, h: 74.25, cols: 2, rows: 4, en: 'A4 sticker sheet · 8 per page (105 × 74 mm)', vi: 'Giấy decal A4 · 8 nhãn/trang (105 × 74 mm)' },
  'a4-10': { w: 105, h: 57, cols: 2, rows: 5, top: 6, en: 'A4 sticker sheet · 10 per page (105 × 57 mm)', vi: 'Giấy decal A4 · 10 nhãn/trang (105 × 57 mm)' },
  'a4-4': { w: 105, h: 148.5, cols: 2, rows: 2, en: 'A4 sticker sheet · 4 per page (105 × 148 mm)', vi: 'Giấy decal A4 · 4 nhãn/trang (105 × 148 mm)' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = 'assets/img/logo.png';

function whName(code) {
  const w = warehouse(state.settings, code);
  return w.code;
}

// ── Carton label ────────────────────────────────────────────────────────────

export function labelHTML(carton, rec, preset, opts = {}) {
  const p = LABEL_PRESETS[preset] || LABEL_PRESETS['thermal-100x70'];
  const tall = p.h > p.w * 1.2;
  const s = tall ? Math.min(p.w / 80, p.h / 125) : Math.min(p.w / 100, p.h / 70);
  const qr = qrSvg(cartonPayload(carton, opts.qrMode || 'link'), { ecc: 'M' });
  const logo = opts.showLogo !== false ? `<img class="lb-logo" src="${LOGO}" alt="">` : '<span class="lb-brand">IDEA L PACK</span>';
  const n = String(carton.n).padStart(String(carton.of).length, '0');
  const ship = rec.type === 'shipment';
  const row = (k, v, cls = '') => v || v === 0 ? `<div class="lb-row ${cls}"><span class="lb-k">${k}</span><span class="lb-v">${esc(v)}</span></div>` : '';
  const qtyText = `${fmtNum(carton.qty, carton.qty % 1 ? 2 : 0)} ${unitLabelPrint(carton.unit)}`;
  const fields = ship ? [
    row('PO', carton.po),
    row('Cust. code', carton.ref, 'strong'),
    row('Item', carton.code),
    row('Desc.', carton.desc, 'desc'),
    `<div class="lb-qty"><span class="lb-k">Qty / ctn</span><b>${esc(qtyText)}</b></div>`,
    row('N.W / G.W', carton.nw || carton.gw ? `${fmtNum(carton.nw, 2)} / ${fmtNum(carton.gw, 2)} kg` : ''),
    row('Invoice', rec.docNo),
    row('Ship to', rec.shipTo || rec.customer, 'desc'),
  ] : [
    row('Mã hàng · Item', carton.code, 'strong'),
    row('Mã KH · Cust. ref', carton.ref, 'strong'),
    row('Tên · Desc.', carton.desc, 'desc'),
    `<div class="lb-qty"><span class="lb-k">SL · Qty</span><b>${esc(qtyText)}</b>${carton.isPartial ? '<em>THÙNG LẺ · PARTIAL</em>' : ''}</div>`,
    row('Lệnh SX · WO', fmtWO(carton.wo)),
    row(rec.type === 'handoff' ? 'Số phiếu · Slip' : 'Số · Doc', rec.docNo),
    row('Ngày · Date', `${fmtDate(rec.date)}  ${whName(rec.fromWh)} → ${whName(rec.toWh)}`),
  ];
  return `<div class="label ${tall ? 'tall' : 'wide'}" style="--lw:${p.w}mm;--lh:${p.h}mm;--s:${s}">
    <div class="lb-head">${logo}<div class="lb-ctn"><span>${ship ? 'CARTON' : 'THÙNG · CARTON'}</span><b>${n}<i>/${carton.of}</i></b></div></div>
    <div class="lb-body"><div class="lb-qr">${qr}</div><div class="lb-fields">${fields.join('')}</div></div>
    <div class="lb-foot"><span>${esc(carton.id)}</span><span>${ship ? 'MADE IN ' + esc(rec.origin || 'VIETNAM') : esc(typeShortPrint(rec.type))}</span></div>
  </div>`;
}

const unitLabelPrint = (u) => ({ piece: 'PCS', box: 'BOX', set: 'SET', roll: 'ROLL', sheet: 'SHEET', ream: 'REAM', pair: 'PAIR', kg: 'KG' }[u] || String(u || '').toUpperCase());
const typeShortPrint = (t) => ({ handoff: 'PRO → WH', transfer: 'TRANSFER', shipment: 'SHIPMENT' }[t] || '');

export function labelsPage(cartons, rec, preset, opts) {
  const p = LABEL_PRESETS[preset] || LABEL_PRESETS['thermal-100x70'];
  const labels = cartons.map((c) => labelHTML(c, rec, preset, opts));
  if (p.cols) {
    const per = p.cols * p.rows;
    const pages = [];
    for (let i = 0; i < labels.length; i += per) {
      pages.push(`<div class="sheet" style="--cols:${p.cols};--rows:${p.rows};--lw:${p.w}mm;--lh:${p.h}mm;padding-top:${p.top || 0}mm">${labels.slice(i, i + per).join('')}</div>`);
    }
    return { html: pages.join(''), pageCss: '@page { size: A4 portrait; margin: 0; }' };
  }
  return { html: labels.map((l) => `<div class="label-page">${l}</div>`).join(''), pageCss: `@page { size: ${p.w}mm ${p.h}mm; margin: 0; }` };
}

// ── Handoff slip / transfer note ────────────────────────────────────────────

export function slipHTML(rec) {
  const isHandoff = rec.type === 'handoff';
  const from = warehouse(state.settings, rec.fromWh);
  const to = warehouse(state.settings, rec.toWh);
  const t = totals(rec);
  const title = isHandoff
    ? ['PHIẾU GIAO NHẬN THÀNH PHẨM', 'TRANSFER, RECEIVE FINISH GOODS']
    : ['PHIẾU CHUYỂN KHO', 'WAREHOUSE TRANSFER NOTE'];
  const lines = (rec.lines || []).map((l, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="mono">${esc(l.code)}<small>${esc(l.ref)}</small></td>
      <td>${esc(l.desc)}</td>
      ${isHandoff ? `<td class="r">${l.reqQty ? fmtNum(num(l.reqQty)) : ''}</td>` : ''}
      <td class="r b">${fmtNum(num(l.qty), num(l.qty) % 1 ? 2 : 0)}</td>
      <td class="c">${esc(unitLabel(l.unit))}</td>
      <td class="c">${esc(notation(l.qty, l.ppc))}</td>
      ${isHandoff ? `<td class="c">${esc(fmtWO(l.wo))}</td>` : ''}
    </tr>`);
  const scanned = scanGroups(rec).map((g, i) => `<tr>
      <td class="c">${lines.length + i + 1}</td>
      <td class="mono">${esc(g.code)}<small>${esc(g.ref)}</small></td>
      <td>${esc(g.desc)}</td>
      <td class="r b">${fmtNum(g.qty)}</td>
      <td class="c">${esc(unitLabel(g.unit))}</td>
      <td class="c">${g.cartons}T(${fmtNum(g.qtyPer)}) <small>đã quét · scanned</small></td>
    </tr>`);
  const minRows = Math.max(0, 8 - lines.length - scanned.length);
  const blank = Array.from({ length: minRows }, () => `<tr class="blank"><td></td><td></td><td></td>${isHandoff ? '<td></td>' : ''}<td></td><td></td><td></td>${isHandoff ? '<td></td>' : ''}</tr>`);
  const extra = isHandoff ? '' : `<div><span>PO / POVN</span><b>${esc(rec.extRef || '—')}</b></div><div><span>Số PNK / Receipt note</span><b>${esc(rec.noteNo || '—')}</b></div>`;
  return `<div class="doc slip">
    <header class="doc-head">
      <img src="${LOGO}" alt="Idea L Pack" class="doc-logo">
      <div class="doc-title"><h1>${title[0]}</h1><h2>${title[1]}</h2>
        <div class="doc-route"><span>${bi('From', 'Từ')}: <b>${esc(from.code)}</b> · ${esc(from.vi)}</span><span>→</span><span>${bi('To', 'Đến')}: <b>${esc(to.code)}</b> · ${esc(to.vi)}</span></div>
      </div>
      <div class="doc-no"><span>Số / No.</span><b>${esc(rec.docNo)}</b><span>${bi('Date', 'Ngày')}: ${fmtDate(rec.date)}</span><div class="doc-qr">${qrSvg(recordPayload(rec))}</div></div>
    </header>
    ${rec.status === 'void' ? `<div class="void-stamp">ĐÃ HỦY · VOID — ${esc(rec.voidReason || '')}</div>` : ''}
    ${extra ? `<div class="doc-meta">${extra}</div>` : ''}
    <table class="doc-table">
      <thead><tr>
        <th class="c">STT<small>No.</small></th><th>Mã hàng<small>Item code</small></th><th>Tên hàng<small>Item name</small></th>
        ${isHandoff ? '<th class="r">SL Y/C<small>Requested</small></th>' : ''}
        <th class="r">Số lượng<small>Quantity</small></th><th class="c">ĐVT<small>Unit</small></th><th class="c">Số thùng<small>Cartons</small></th>
        ${isHandoff ? '<th class="c">Lệnh SX<small>Work order</small></th>' : ''}
      </tr></thead>
      <tbody>${lines.join('')}${scanned.join('')}${blank.join('')}</tbody>
      <tfoot><tr><td colspan="${isHandoff ? 4 : 3}" class="r">Tổng cộng / Total</td><td class="r b">${fmtNum(t.qty, t.qty % 1 ? 2 : 0)}</td><td class="c">${t.unit ? esc(unitLabel(t.unit)) : ''}</td><td class="c">${t.cartons} thùng · ctns</td>${isHandoff ? '<td></td>' : ''}</tr></tfoot>
    </table>
    ${rec.note ? `<p class="doc-note"><b>${bi('Note', 'Ghi chú')}:</b> ${esc(rec.note)}</p>` : ''}
    <div class="signs">
      <div><span>Người xuất / Delivered by</span><b>${esc(rec.deliveredBy || '')}</b></div>
      <div><span>Người nhận / Received by</span><b>${esc(rec.receivedBy || '')}</b></div>
      <div><span>Thủ kho / Storekeeper</span><b></b></div>
    </div>
    <footer class="doc-foot"><span>IDEA L PACK · ${esc(typeName(rec.type))}</span><span>${tr('Printed', 'In lúc')} ${new Date().toLocaleString('en-GB')}</span></footer>
  </div>`;
}

// ── Packing list ────────────────────────────────────────────────────────────

export function packingListHTML(rec) {
  const rows = packingRows(rec);
  const t = totals(rec);
  const cell = (v, dp, cls = 'r', fixed = false) => `<td class="${cls}">${v === '' || v === undefined ? '' : (dp === undefined ? esc(v) : fixed ? fmtNum(v, dp) : fmtDec(v, dp))}</td>`;
  const body = rows.map((r) => `<tr>
    <td>${esc(r.po)}</td><td>${esc(r.ref)}</td><td class="mono">${esc(r.code)}</td><td>${esc(r.desc)}</td>
    <td class="c">${esc(r.cartonNo)}</td>${cell(r.qty === '' ? '' : fmtNum(r.qty))}${cell(r.uoms)}${cell(r.perUom === '' ? '' : fmtNum(r.perUom))}
    ${cell(r.nw, 2, 'r', true)}${cell(r.gw, 2, 'r', true)}${cell(r.l, 1, 'c')}${cell(r.w, 1, 'c')}${cell(r.h, 1, 'c')}${cell(r.tnw, 2, 'r', true)}${cell(r.tgw, 2, 'r', true)}${cell(r.cbm, 3, 'r', true)}
    <td class="c">${fmtDate(r.printDate)}</td><td class="c">${fmtDate(r.packDate)}</td>
  </tr>`).join('');
  const meta = (k, v) => `<div><span>${k}</span><b>${esc(v || '—')}</b></div>`;
  return `<div class="doc packing">
    <header class="doc-head">
      <img src="${LOGO}" alt="Idea L Pack" class="doc-logo">
      <div class="doc-title"><h1>PACKING LIST</h1><h2>PHIẾU ĐÓNG GÓI</h2></div>
      <div class="doc-no"><span>Invoice no</span><b>${esc(rec.docNo)}</b><span>Document date: ${fmtDate(rec.date)}</span><div class="doc-qr">${qrSvg(recordPayload(rec))}</div></div>
    </header>
    ${rec.status === 'void' ? `<div class="void-stamp">VOID — ${esc(rec.voidReason || '')}</div>` : ''}
    <div class="doc-meta">
      ${meta('Ship to', [rec.customer, rec.shipTo].filter(Boolean).join(' — '))}
      ${meta('Contact', rec.contact)}
      ${meta('Salesperson', rec.salesperson)}
      ${meta('Shipping mark', rec.shippingMark)}
      ${meta('Country of origin', rec.origin)}
      ${rec.noteNo ? meta('Delivery note (PXK)', rec.noteNo) : ''}
    </div>
    <table class="doc-table pl">
      <thead><tr>
        <th>Customer PO</th><th>Customer code</th><th>Internal code</th><th>Description</th><th class="c">Carton no</th>
        <th class="r">Order QTY</th><th class="r">Number of UOM</th><th class="r">Qty/UOM</th>
        <th class="r">Net weight<small>1 carton</small></th><th class="r">Gross weight<small>1 carton</small></th>
        <th class="c">L</th><th class="c">W</th><th class="c">H</th>
        <th class="r">Total N.W</th><th class="r">Total G.W</th><th class="r">CBM</th><th class="c">Print date</th><th class="c">Pack date</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <td colspan="5" class="r">TOTAL</td><td class="r">${fmtNum(t.qty)}</td><td class="r">${t.cartons}</td><td></td><td></td><td></td><td></td><td></td><td></td>
        <td class="r">${fmtNum(t.nw, 2)}</td><td class="r">${fmtNum(t.gw, 2)}</td><td class="r">${fmtNum(t.cbm, 3)}</td><td></td><td></td>
      </tr></tfoot>
    </table>
    <div class="pl-sum">
      <div><span>Total quantity</span><b>${fmtNum(t.qty)} pcs</b></div>
      <div><span>Total cartons</span><b>${t.cartons}</b></div>
      <div><span>Total N.W</span><b>${fmtNum(t.nw, 2)} kg</b></div>
      <div><span>Total G.W</span><b>${fmtNum(t.gw, 2)} kg</b></div>
      <div><span>Total CBM</span><b>${fmtNum(t.cbm, 3)}</b></div>
    </div>
    ${rec.note ? `<p class="doc-note"><b>Note:</b> ${esc(rec.note)}</p>` : ''}
    <footer class="doc-foot"><span>IDEA L PACK · Packing list ${esc(rec.docNo)}</span><span>Printed ${new Date().toLocaleString('en-GB')}</span></footer>
  </div>`;
}

// ── Print trigger ───────────────────────────────────────────────────────────

export async function printDoc(html, pageCss) {
  const root = document.getElementById('print-root');
  const style = document.getElementById('page-style');
  root.innerHTML = html;
  style.textContent = pageCss;
  await Promise.all([...root.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cleanup = () => { root.innerHTML = ''; style.textContent = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function printLabels(rec, cartons, device) {
  const { html, pageCss } = labelsPage(cartons, rec, device.labelPreset, { qrMode: device.qrMode, showLogo: device.showLogo });
  return printDoc(html, pageCss);
}

export const printSlip = (rec) => printDoc(slipHTML(rec), '@page { size: A4 portrait; margin: 10mm; }');
export const printPackingList = (rec) => printDoc(packingListHTML(rec), '@page { size: A4 landscape; margin: 8mm; }');
export { recordCartons };
