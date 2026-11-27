// One form for all documents: production handoff, supplier receipt, warehouse transfer, shipment.

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, getRecord, newRecord, saveRecord, docNoTaken, nextDocNo, findCarton, cartonLocation, toast, state, PRACTICE } from '../store.js';
import { Icon, Btn, Field, Input, NumInput, Select, ItemPicker, WhSelect, PageHead, Modal, Chip } from '../components.js';
import { UNITS, FSC, perCartonNotation, handNotation, split, notation, totals, validate, typeName, scanGroups, unitLabel, recordCartons, pickFromLines, pickProgress, pickSuggest, currentStock, locLabel, closestCode } from '../model.js';
import { num, round, fmtNum, fmtDec, newId, today, clean, go, normLoc } from '../util.js';
import { parseScan } from '../qr.js';
import { Scanner, feedback } from './scanner.js';
import { printLabels } from '../print.js';
import { parsePackingListFile, downloadStockInTemplate } from '../excel.js';

// Practice mode keeps its own drafts, so a practice draft never shows up in the real app.
const draftKey = (type) => `ilp.draft.${PRACTICE ? 'practice.' : ''}new.${type}`;
const unitOpts = () => UNITS.map((u) => ({ value: u.code, label: tr(u.en, u.vi) }));

function blankLine(ln) {
  return { ln, code: '', ref: '', desc: '', unit: 'piece', qty: '', ppc: '', reqQty: '', wo: '', po: '', nw: '', gw: '', pnw: '', pgw: '', l: '', w: '', h: '', printDate: '', packDate: '', fsc: '', bundle: '' };
}

function fromItem(line, it, type) {
  const out = { ...line, code: it.code, ref: it.ref || '', desc: it.desc || '', unit: it.uom || line.unit || 'piece' };
  if (num(it.ppc) > 0) out.ppc = num(it.ppc);
  for (const k of ['nw', 'gw', 'l', 'w', 'h']) if (num(it[k]) > 0) out[k] = num(it[k]);
  return out;
}

// ── One item line ───────────────────────────────────────────────────────────

function LineCard({ line, idx, type, onChange, onRemove, onDuplicate, showMore }) {
  const set = (patch) => onChange({ ...line, ...patch });
  const sp = split(line.qty, line.ppc);
  const tare = num(line.gw) - num(line.nw);
  const estPnw = sp.partial > 0 && num(line.nw) > 0 && num(line.ppc) > 0 ? round(num(line.nw) * sp.partial / num(line.ppc), 2) : '';
  const estPgw = estPnw !== '' ? round(estPnw + (tare > 0 ? tare : 0), 2) : '';
  const [more, setMore] = useState(showMore);
  const isShip = type === 'shipment';
  const isIn = type === 'inbound';

  return html`<div class="line-card">
    <div class="line-head">
      <span class="line-no">${idx + 1}</span>
      <div class="line-item">
        <${ItemPicker} value=${line.code} autofocus=${!line.code}
          onPick=${(it) => onChange(fromItem(line, it, type))}
          onInput=${(v) => set({ code: v.trim().toUpperCase() })} />
      </div>
      <div class="line-tools">
        <button class="icon-btn" title=${tr('Duplicate line', 'Nhân bản dòng')} aria-label=${tr('Duplicate line', 'Nhân bản dòng')} onClick=${onDuplicate}><${Icon} name="copy" /></button>
        <button class="icon-btn" title=${tr('Remove line', 'Xóa dòng')} aria-label=${tr('Remove line', 'Xóa dòng')} onClick=${onRemove}><${Icon} name="trash" /></button>
      </div>
    </div>
    <div class="line-grid">
      <${Field} label=${tr('Customer ref', 'Mã khách hàng')}><${Input} value=${line.ref} onInput=${(v) => set({ ref: v })} /></${Field}>
      <${Field} label=${tr('Description', 'Tên hàng')} cls="span2"><${Input} value=${line.desc} onInput=${(v) => set({ desc: v })} /></${Field}>
      ${(isShip || isIn) && html`<${Field} label="Customer PO"><${Input} value=${line.po} onInput=${(v) => set({ po: v })} /></${Field}>`}
      ${type === 'handoff' && html`<${Field} label=${tr('Requested qty', 'SL yêu cầu')}><${NumInput} value=${line.reqQty} onInput=${(v) => set({ reqQty: v })} /></${Field}>`}
      <${Field} label=${type === 'handoff' ? tr('Actual qty', 'SL thực nhận') : isShip ? tr('Order qty', 'SL đặt hàng') : tr('Quantity', 'Số lượng')} required>
        <${NumInput} value=${line.qty} onInput=${(v) => set({ qty: v, ...(line.oneLabel ? { ppc: v } : {}) })} />
      </${Field}>
      <${Field} label=${tr('Pcs per carton', 'SL / thùng')} hint=${line.oneLabel ? tr('1 sticker for the whole line', '1 nhãn cho cả dòng') : !num(line.ppc) ? tr('Leave empty = no labels', 'Để trống = không in nhãn') : ''}>
        <${NumInput} value=${line.ppc} onInput=${(v) => set({ ppc: v })} readOnly=${!!line.oneLabel} />
        ${!isShip && html`<label class="check small"><input type="checkbox" checked=${!!line.oneLabel} onChange=${(e) => set(e.target.checked ? { oneLabel: true, ppc: line.qty } : { oneLabel: false, ppc: '' })} /> ${tr('1 sticker for the whole line (raw materials)', '1 nhãn cho cả dòng (nguyên vật liệu)')}</label>`}
      </${Field}>
      <${Field} label=${tr('Unit', 'Đơn vị')}><${Select} value=${line.unit || 'piece'} onChange=${(v) => set({ unit: v })} options=${unitOpts()} /></${Field}>
      ${type === 'handoff' && html`<${Field} label=${tr('Work order', 'Lệnh sản xuất')}><${Input} value=${line.wo} onInput=${(v) => set({ wo: v })} placeholder="WO10131" /></${Field}>`}
      <${Field} label=${tr('N.W / carton (kg)', 'TL tịnh / thùng (kg)')}><${NumInput} value=${line.nw} onInput=${(v) => set({ nw: v })} /></${Field}>
      <${Field} label=${tr('G.W / carton (kg)', 'TL cả bì / thùng (kg)')}><${NumInput} value=${line.gw} onInput=${(v) => set({ gw: v })} /></${Field}>
      <${Field} label=${tr('Carton L × W × H (cm)', 'Thùng D × R × C (cm)')} cls="span2">
        <div class="dims"><${NumInput} value=${line.l} onInput=${(v) => set({ l: v })} placeholder="L" /><span>×</span><${NumInput} value=${line.w} onInput=${(v) => set({ w: v })} placeholder="W" /><span>×</span><${NumInput} value=${line.h} onInput=${(v) => set({ h: v })} placeholder="H" /></div>
      </${Field}>
      <${Field} label=${tr('FSC', 'FSC')}><${Select} value=${line.fsc || ''} onChange=${(v) => set({ fsc: v })} options=${[{ value: '', label: tr('— not marked —', '— chưa đánh dấu —') }, ...FSC.map((f) => ({ value: f.code, label: f.label }))]} /></${Field}>
      ${isIn && html`<${Field} label=${tr('Pallet no.', 'Số pallet')} hint=${tr('e.g. 13 or 1-12', 'vd. 13 hoặc 1-12')}><${Input} value=${line.pallet || ''} onInput=${(v) => set({ pallet: v })} /></${Field}>
        <${Field} label=${tr('Cartons per pallet', 'Số thùng / pallet')}><${NumInput} value=${line.perPallet || ''} onInput=${(v) => set({ perPallet: v })} /></${Field}>
        <${Field} label=${tr('Location', 'Vị trí')} hint=${tr('e.g. A01', 'vd. A01')}><${Input} value=${line.location || ''} onInput=${(v) => set({ location: v.toUpperCase() })} /></${Field}>`}
      <${Field} label=${tr('Pcs per bundle', 'SL / bó')} hint=${tr('Optional: prints 4×25=100', 'Tùy chọn: in dạng 4×25=100')}><${NumInput} value=${line.bundle} onInput=${(v) => set({ bundle: v })} /></${Field}>
    </div>
    ${(isShip || isIn) && sp.partial > 0 && html`<div class="partial-box">
      <div><b>${tr('Partial carton', 'Thùng lẻ')}: ${fmtNum(sp.partial)} ${unitLabel(line.unit)}</b>
        <small>${tr('Weigh it — the estimate is only proportional.', 'Hãy cân thùng này — số ước tính chỉ theo tỷ lệ.')}</small></div>
      <${Field} label=${tr('N.W (kg)', 'TL tịnh (kg)')}><${NumInput} value=${line.pnw} onInput=${(v) => set({ pnw: v })} placeholder=${estPnw !== '' ? `≈ ${estPnw}` : ''} /></${Field}>
      <${Field} label=${tr('G.W (kg)', 'TL cả bì (kg)')}><${NumInput} value=${line.pgw} onInput=${(v) => set({ pgw: v })} placeholder=${estPgw !== '' ? `≈ ${estPgw}` : ''} /></${Field}>
      ${estPnw !== '' && !line.pnw && html`<${Btn} small onClick=${() => set({ pnw: estPnw, pgw: estPgw })}>${tr('Use estimate', 'Dùng số ước tính')}</${Btn}>`}
    </div>`}
    ${isShip && html`<button class="link small more-toggle" onClick=${() => setMore(!more)}>${more ? '−' : '+'} ${tr('Print date / pack date', 'Ngày in / ngày đóng gói')}</button>
      ${more && html`<div class="line-grid">
        <${Field} label=${tr('Print date', 'Ngày in')}><${Input} type="date" value=${line.printDate} onInput=${(v) => set({ printDate: v })} /></${Field}>
        <${Field} label=${tr('Pack date', 'Ngày đóng gói')}><${Input} type="date" value=${line.packDate} onInput=${(v) => set({ packDate: v })} /></${Field}>
      </div>`}`}
    ${line.code && !state.items.has(line.code) && html`<p class="line-warn"><${Icon} name="info" />${tr('New code — not in the item list yet. Check it is typed correctly; it will be added when you save.', 'Mã mới — chưa có trong danh mục. Kiểm tra lại mã; mã sẽ được thêm khi lưu.')}</p>`}
    <div class="line-foot">
      ${line.oneLabel && num(line.qty) > 0 ? html`<span class="notation">${tr('1 sticker for the whole line', '1 nhãn cho cả dòng')}</span><span>= ${fmtNum(num(line.qty))} ${unitLabel(line.unit)} · <b>1 ${tr('label', 'nhãn')}</b></span>`
        : sp.count ? html`<span class="notation">${notation(line.qty, line.ppc)}${num(line.ppc) > 0 ? ` · ${tr('per carton', 'mỗi thùng')} ${perCartonNotation(line.ppc, line.bundle)} · ${handNotation(line.qty, line.ppc).total}${handNotation(line.qty, line.ppc).odd ? ' + ' + handNotation(line.qty, line.ppc).odd : ''}` : ''}</span><span>= ${fmtNum(num(line.qty))} ${unitLabel(line.unit)} · <b>${sp.count} ${tr(sp.count === 1 ? 'label' : 'labels', 'nhãn')}</b></span>`
        : num(line.qty) > 0 ? html`<span class="muted">${tr('No carton split — quantity only, no labels.', 'Không chia thùng — chỉ ghi số lượng, không in nhãn.')}</span>` : html`<span class="muted">${tr('Enter quantity and pcs per carton to create carton labels.', 'Nhập số lượng và SL/thùng để tạo nhãn thùng.')}</span>`}
    </div>
  </div>`;
}

// ── Scanning cartons into a transfer / shipment ─────────────────────────────

function ScanModal({ recRef, setRec, onClose }) {
  const [log, setLog] = useState([]);
  const add = (msg, kind) => setLog((l) => [{ msg, kind, at: Date.now() }, ...l].slice(0, 30));
  const rec = recRef.current;

  const onCode = (text) => {
    const cur = recRef.current;
    const p = parseScan(text);
    if (p && p.location && cur.type === 'putaway') {
      const next = { ...cur, loc: normLoc(p.location) }; recRef.current = next; setRec(next);
      feedback(true); add(`${tr('Location', 'Vị trí')} ${normLoc(p.location)}`, 'good'); return;
    }
    if (!p || !p.cartonId) { feedback(false); add(tr('Not a carton label', 'Không phải nhãn thùng'), 'bad'); return; }
    const f = findCarton(p.cartonId);
    if (!f || !f.carton) { feedback(false); add(`${p.cartonId} — ${tr('not found', 'không tìm thấy')}`, 'bad'); return; }
    if (f.rec.status === 'void') { feedback(false); add(`${p.cartonId} — ${tr('its record is voided', 'chứng từ đã hủy')}`, 'bad'); return; }
    if (f.rec.type === 'shipment') { feedback(false); add(`${p.cartonId} — ${tr('this is a shipping label', 'đây là nhãn xuất hàng')}`, 'bad'); return; }
    if (f.rec.id === cur.id) { feedback(false); add(`${p.cartonId} — ${tr('label belongs to this same record', 'nhãn thuộc chính chứng từ này')}`, 'bad'); return; }
    if ((cur.scans || []).some((x) => x.cid === p.cartonId)) { feedback(false); add(`${p.cartonId} — ${tr('already scanned', 'đã quét rồi')}`, 'warn'); return; }

    const c = f.carton;
    // The carton keeps its own production label; remember its size/weights for the packing list.
    const it = state.items.get(c.code) || {};
    const pick = (k) => (num(c[k]) > 0 ? num(c[k]) : num(it[k]) > 0 ? num(it[k]) : '');
    // A carton opened before holds less than its label says: start from what is in it now.
    const now = currentStock([...state.records.values()]).find((x) => x.cid === c.id);
    const inside = now ? num(now.qty) : num(c.qty);
    const next = { ...cur, scans: [...(cur.scans || []), { cid: c.id, code: c.code, ref: c.ref || '', desc: c.desc || '', qty: inside, full: inside, unit: c.unit, from: f.rec.id,
      nw: c.isPartial ? '' : pick('nw'), gw: c.isPartial ? '' : pick('gw'), l: pick('l'), w: pick('w'), h: pick('h'), wo: c.wo || '', fsc: c.fsc || '' }] };
    recRef.current = next; // so a fast second scan sees this one
    setRec(next);

    if ((cur.pick || []).length) {
      const want = cur.pick.find((x) => x.code === c.code);
      if (!want) { feedback(false); add(`${c.code} · ${fmtNum(c.qty)} — ${tr('added, but this item is NOT on the pick list', 'đã thêm, nhưng mã này KHÔNG có trong danh sách lấy hàng')}`, 'warn'); return; }
      const gotQty = next.scans.filter((x) => x.code === c.code).reduce((a, x) => a + num(x.qty), 0);
      if (gotQty > want.qty) { feedback(false); add(`${c.code} · ${fmtNum(c.qty)} — ${tr(`added, but now ${fmtNum(gotQty)} of ${fmtNum(want.qty)} asked (too many)`, `đã thêm, nhưng giờ là ${fmtNum(gotQty)} / ${fmtNum(want.qty)} yêu cầu (thừa)`)}`, 'warn'); return; }
    }
    const loc = cartonLocation(p.cartonId);
    if (loc?.shipped) { feedback(false); add(`${p.cartonId} — ${tr('added, but it was already shipped in', 'đã thêm, nhưng thùng đã xuất trong')} ${loc.rec.docNo}`, 'warn'); return; }
    if (loc && cur.type === 'putaway' && loc.wh && loc.wh !== cur.toWh) { feedback(true); add(`${c.code} · ${fmtNum(c.qty)} — ${tr('added, but the system shows it in', 'đã thêm, nhưng hệ thống ghi nhận đang ở')} ${loc.wh}`, 'warn'); return; }
    if (loc && cur.fromWh && loc.wh && loc.wh !== cur.fromWh) { feedback(true); add(`${c.code} · ${fmtNum(c.qty)} — ${tr('added, but the system shows it in', 'đã thêm, nhưng hệ thống ghi nhận đang ở')} ${loc.wh}`, 'warn'); return; }
    feedback(true);
    add(`${c.code} · ${fmtNum(c.qty)} — ${tr('added', 'đã thêm')}`, 'good');
  };

  const count = (rec.scans || []).length;
  return html`<${Modal} title=${tr('Scan cartons', 'Quét thùng')} onClose=${onClose} wide footer=${html`<span class="muted">${count} ${tr('cartons scanned', 'thùng đã quét')}</span><${Btn} kind="primary" onClick=${onClose}>${tr('Done', 'Xong')}</${Btn}>`}>
    <div class="scan-layout in-modal">
      <${Scanner} onCode=${onCode} compact />
      <ul class="scan-log">${log.length ? log.map((l) => html`<li class=${l.kind}><${Icon} name=${l.kind === 'good' ? 'check' : 'alert'} />${l.msg}</li>`) : html`<li class="muted">${tr('Scan each carton once. Duplicates are ignored.', 'Quét mỗi thùng một lần. Thùng trùng sẽ bị bỏ qua.')}</li>`}</ul>
    </div>
  </${Modal}>`;
}

function ScannedList({ rec, setRec }) {
  const groups = scanGroups(rec);
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  const remove = (cid) => setRec((r) => ({ ...r, scans: r.scans.filter((s) => s.cid !== cid) }));
  const take = (cid, v) => setRec((r) => ({ ...r, scans: r.scans.map((s) => (s.cid === cid ? { ...s, qty: Math.max(0, Math.min(num(v), num(s.full) || num(s.qty))) } : s)) }));
  const isShip = rec.type === 'shipment';
  return html`<div class="card scanned">
    <div class="block-title"><h3>${tr('Scanned cartons', 'Thùng đã quét')}</h3><span>${(rec.scans || []).length} ${tr('cartons', 'thùng')}</span></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${tr('Item', 'Mã hàng')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th class="r">${tr('Cartons', 'Thùng')}</th><th class="r">${tr('Per carton', 'SL/thùng')}</th><th class="r">${tr('Total', 'Tổng')}</th></tr></thead>
      <tbody>${groups.map((g) => html`<tr><td class="mono">${g.code}</td><td>${g.ref}</td><td class="r">${g.cartons}</td><td class="r">${fmtNum(g.qtyPer)}</td><td class="r b">${fmtNum(g.qty)}</td></tr>`)}</tbody>
    </table></div>
    <button class="link small" onClick=${() => setOpen(!open)}>${open ? tr('Hide cartons', 'Ẩn danh sách thùng') : isShip ? tr('Show cartons (remove a wrong scan, or take only part of a carton)', 'Xem thùng (xóa thùng quét nhầm, hoặc chỉ lấy một phần thùng)') : tr('Show carton IDs (remove a wrong scan)', 'Xem mã thùng (xóa thùng quét nhầm)')}</button>
    ${open && !isShip && html`<div class="cid-list">${rec.scans.map((s) => html`<span class="chip info">${s.cid}<button aria-label=${tr('Remove', 'Xóa')} onClick=${() => remove(s.cid)}><${Icon} name="x" /></button></span>`)}</div>`}
    ${open && isShip && html`<div class="table-wrap"><table class="data take">
      <thead><tr><th>${tr('Carton', 'Thùng')}</th><th>${tr('Item', 'Mã hàng')}</th><th class="r">${tr('In the carton', 'Trong thùng')}</th><th class="r">${tr('Taken', 'Lấy ra')}</th><th></th></tr></thead>
      <tbody>${rec.scans.map((s) => html`<tr><td class="mono small">${s.cid}</td><td class="mono">${s.code}</td><td class="r">${fmtNum(num(s.full) || num(s.qty))}</td>
        <td class="r"><input class="input num take-in" type="number" min="0" value=${s.qty} onInput=${(e) => take(s.cid, e.target.value)} aria-label=${tr('Pieces taken', 'Số lượng lấy ra')} />
          ${num(s.full) && num(s.qty) < num(s.full) ? html`<small class="muted"> · ${tr('opened, stays in stock', 'mở thùng, còn lại trong kho')}: ${fmtNum(num(s.full) - num(s.qty))}</small>` : ''}</td>
        <td><button class="icon-btn" aria-label=${tr('Remove', 'Xóa')} onClick=${() => remove(s.cid)}><${Icon} name="x" /></button></td></tr>`)}</tbody></table></div>`}
    ${rec.type === 'shipment' && html`<div class="scan-po">
      <p class="muted small">${tr('These cartons ship as they are and keep their production labels — no new labels are printed. Enter the customer PO for each item:', 'Các thùng này được xuất nguyên và giữ nhãn sản xuất — không in nhãn mới. Nhập PO của khách cho từng mã hàng:')}</p>
      <div class="dims-list">${[...new Set(groups.map((g) => g.code))].map((code) => html`<label class="po-row"><span class="mono">${code}</span><${Input} value=${(rec.scanPo || {})[code] || ''} onInput=${(v) => setRec((r) => ({ ...r, scanPo: { ...(r.scanPo || {}), [code]: v } }))} placeholder="Customer PO" /></label>`)}</div>
    </div>`}
  </div>`;
}

// ── Supplier packing list import (supplier receipt) ─────────────────────────

function ImportPackingList({ rec, setRec }) {
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [result, setResult] = useState(null);
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const keep = rec.lines.filter((l) => clean(l.code) || num(l.qty) > 0);
      setProg(null);
      const res = await parsePackingListFile(file, { firstLn: rec.nextLn, onProgress: (f, p, n) => setProg({ f, p, n }) });
      setProg(null);
      // A photo can misread a character: snap unknown codes to the closest code in the item list.
      const fixed = [];
      if (res.how === 'photo' && state.items.size) {
        const known = [...state.items.keys()];
        res.lines = res.lines.map((l) => {
          if (state.items.has(l.code)) return l;
          const c = closestCode(l.code, known);
          if (c) { fixed.push(`${l.code} → ${c}`); return { ...l, code: c }; }
          return l;
        });
      }
      if (fixed.length) res.warnings.push(tr(`Codes corrected to the closest item: ${fixed.join(', ')} — please check.`, `Mã được sửa theo mã gần nhất: ${fixed.join(', ')} — vui lòng kiểm tra.`));
      if (res.how === 'photo') { const noQty = res.lines.filter((l) => !num(l.qty)).map((l) => l.code); if (noQty.length) res.warnings.push(tr(`No quantity found for ${noQty.join(', ')}: enter it below.`, `Không đọc được số lượng cho ${noQty.join(', ')}: nhập bên dưới.`)); }
      // Delivery notes rarely say pcs per carton, weights or carton size: take them from the item list.
      let fromList = 0;
      res.lines = res.lines.map((l) => {
        const it = state.items.get(l.code);
        if (!it) return l;
        const out = { ...l, ref: l.ref || it.ref || '', desc: l.desc || it.desc || '' };
        if (!num(out.ppc) && num(it.ppc) > 0) { out.ppc = num(it.ppc); fromList++; }
        for (const k of ['nw', 'gw', 'l', 'w', 'h']) if (!num(out[k]) && num(it[k]) > 0) out[k] = num(it[k]);
        return out;
      });
      const noPpc = res.lines.filter((l) => !num(l.ppc)).map((l) => l.code);
      if (fromList) res.warnings.push(tr(`Pcs per carton taken from the item list for ${fromList} line(s) — please check.`, `SL/thùng lấy từ danh mục mã hàng cho ${fromList} dòng — vui lòng kiểm tra.`));
      if (noPpc.length) res.warnings.push(tr(`No pcs per carton for ${noPpc.join(', ')}: enter it below to print carton stickers.`, `Chưa có SL/thùng cho ${noPpc.join(', ')}: nhập bên dưới để in nhãn thùng.`));
      if (res.lines.length) {
        setRec((r) => ({ ...r, lines: [...keep, ...res.lines], nextLn: r.nextLn + res.lines.length,
          supplier: r.supplier || res.supplier || '', date: res.date || r.date, docNo: r.docNo || res.docNo || '',
          extRef: r.extRef || ([...new Set(res.lines.map((l) => l.po).filter(Boolean))].length === 1 ? res.lines[0].po : r.extRef) }));
      }
      const cartons = res.lines.reduce((a, l) => a + split(l.qty, l.ppc).count, 0);
      setResult({ file: file.name, lines: res.lines.length, cartons, qty: res.lines.reduce((a, l) => a + num(l.qty), 0), warnings: res.warnings, bad: !res.lines.length, noPpc });
    } catch (err) {
      setResult({ bad: true, warnings: [tr('Could not read this file: ', 'Không đọc được file: ') + (err.message || err)] });
    }
    setBusy(false);
  };
  return html`<div class="card import-pl">
    <div class="block-title"><h3>${tr('Supplier document', 'Chứng từ nhà cung cấp')}</h3></div>
    <p class="muted small">${tr('PDF, Excel, a scanned PDF or a photo of the paper. The system reads the item codes, quantities, PO and supplier; pcs per carton come from the item list. A photo takes 10–30 seconds and must be checked line by line. Nothing leaves this device.', 'PDF, Excel, PDF scan hoặc ảnh chụp chứng từ. Hệ thống đọc mã hàng, số lượng, PO và nhà cung cấp; SL/thùng lấy từ danh mục mã hàng. Ảnh chụp mất 10–30 giây và cần kiểm tra từng dòng. Dữ liệu không rời khỏi thiết bị này.')}</p>
    <label class=${'btn primary' + (busy ? ' disabled' : '')}><${Icon} name="upload" /><span>${busy ? (prog ? tr(`Reading the picture… ${Math.round(prog.f * 100)}%`, `Đang đọc ảnh… ${Math.round(prog.f * 100)}%`) : tr('Reading…', 'Đang đọc…')) : tr('Upload or photograph the packing list / delivery note', 'Tải lên hoặc chụp packing list / phiếu giao hàng')}</span>
      <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv,application/pdf" hidden onChange=${onFile} disabled=${busy} /></label>
    <button class="link small tpl-link" onClick=${downloadStockInTemplate}>${tr('Download the blank stock-in template (same file for every warehouse)', 'Tải mẫu nhập kho trống (cùng một file cho mọi kho)')}</button>
    ${result && html`<div class=${'banner ' + (result.bad ? 'bad' : result.warnings.length ? 'warn' : 'info')}><${Icon} name=${result.bad ? 'alert' : 'check'} /><div>
      ${!result.bad && html`<b>${result.file}</b>: ${tr(`${result.lines} ${result.lines === 1 ? 'line' : 'lines'} read · total quantity ${fmtNum(result.qty)} · ${result.cartons} carton stickers.`, `đã đọc ${result.lines} dòng · tổng số lượng ${fmtNum(result.qty)} · ${result.cartons} nhãn thùng.`)}`}
      ${result.warnings.length > 0 && html`<ul>${result.warnings.map((w) => html`<li>${w}</li>`)}</ul>`}
      ${(result.noPpc || []).length > 0 && html`<div class="banner-actions"><${Btn} small onClick=${() => { const set = new Set(result.noPpc); setRec((r) => ({ ...r, lines: r.lines.map((l) => (set.has(l.code) && !num(l.ppc) ? { ...l, oneLabel: true, ppc: l.qty } : l)) })); setResult({ ...result, noPpc: [] }); }}>${tr('Raw materials: 1 sticker per line for these', 'Nguyên vật liệu: 1 nhãn cho mỗi dòng này')}</${Btn}></div>`}</div></div>`}
  </div>`;
}

// ── Pick list for a shipment (pick up) ──────────────────────────────────────

function PickList({ rec, setRec }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await parsePackingListFile(file);
      if (!res.lines.length) setMsg({ bad: true, text: res.warnings.join(' ') });
      else {
        const pick = pickFromLines(res.lines);
        const scanPo = {};
        for (const p of pick) if (p.po) scanPo[p.code] = p.po;
        const customers = [...new Set(res.lines.map((l) => l.customer).filter(Boolean))];
        setRec((r) => ({ ...r, pick, pickFile: file.name, scanPo: { ...scanPo, ...(r.scanPo || {}) }, customer: r.customer || (customers.length === 1 ? customers[0] : '') }));
        const ctn = pick.reduce((a, p) => a + p.cartons, 0), q = pick.reduce((a, p) => a + p.qty, 0);
        setMsg({ text: tr(`${file.name}: ${pick.length} ${pick.length === 1 ? 'item' : 'items'} · ${ctn ? `${ctn} cartons` : `quantity ${fmtNum(q)}`} to pick.`, `${file.name}: ${pick.length} mã hàng · cần lấy ${ctn ? `${ctn} thùng` : `số lượng ${fmtNum(q)}`}.`), warn: res.warnings.join(' ') });
      }
    } catch (err) { setMsg({ bad: true, text: tr('Could not read this file: ', 'Không đọc được file: ') + (err.message || err) }); }
    setBusy(false);
  };
  const pp = pickProgress(rec);
  const stock = (rec.pick || []).length ? currentStock([...state.records.values()]) : [];
  const stLabel = { todo: tr('To pick', 'Chưa lấy'), part: tr('Short', 'Thiếu'), done: tr('Done', 'Đủ'), over: tr('Too many', 'Thừa') };
  const stKind = { todo: 'idle', part: 'warn', done: 'good', over: 'bad' };
  return html`<div class="card pick">
    <div class="block-title"><h3>${tr('Pick list', 'Danh sách lấy hàng')}</h3>
      ${(rec.pick || []).length > 0 && html`<span>${pp.cartons ? `${pp.gotCartons} / ${pp.cartons} ${tr('cartons', 'thùng')} · ` : ''}${fmtNum(pp.gotQty)} / ${fmtNum(pp.qty)}</span>`}</div>
    ${!(rec.pick || []).length && html`<p class="muted small">${tr('Optional: upload the delivery packing list (Excel). Then scan the cartons: the screen checks each item and count against it.', 'Tùy chọn: tải packing list giao hàng (Excel). Sau đó quét thùng: màn hình kiểm tra từng mã và số lượng theo danh sách.')}</p>`}
    ${(rec.pick || []).length > 0 && html`<div class="table-wrap"><table class="data">
      <thead><tr><th>${tr('Item', 'Mã hàng')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th class="r">${tr('Asked', 'Yêu cầu')}</th><th class="r">${tr('In stock', 'Tồn kho')}</th><th>${tr('Pick from (oldest first)', 'Lấy tại (hàng cũ trước)')}</th><th class="r">${tr('Scanned', 'Đã quét')}</th><th class="r">${tr('Cartons', 'Thùng')}</th><th>${tr('Status', 'Trạng thái')}</th></tr></thead>
      <tbody>${pp.rows.map((r) => { const sg = pickSuggest(stock, rec.fromWh, r.code, r.qty); return html`<tr><td class="mono">${r.code}</td><td>${r.ref}</td><td class="r">${fmtNum(r.qty)}</td>
        <td class=${'r ' + (sg.enough ? '' : 'bad-text b')}>${fmtNum(sg.onHand)}</td>
        <td class="small">${sg.from.length ? sg.from.map((g) => `${g.loc ? locLabel(g.loc) : tr('no location', 'chưa có vị trí')} · ${g.cartons} ${tr('ctn', 'thùng')}`).join(' → ') : html`<span class="muted">${tr('none in stock', 'không có tồn')}</span>`}</td>
        <td class="r b">${fmtNum(r.gotQty)}</td><td class="r">${r.gotCartons}${r.cartons ? ` / ${r.cartons}` : ''}</td><td><${Chip} kind=${stKind[r.status]}>${stLabel[r.status]}</${Chip}></td></tr>`; })}
        ${pp.extra.map((r) => html`<tr><td class="mono">${r.code}</td><td></td><td class="r">0</td><td></td><td></td><td class="r b">${fmtNum(r.gotQty)}</td><td class="r">${r.gotCartons}</td><td><${Chip} kind="bad">${tr('Not on list', 'Không có trong DS')}</${Chip}></td></tr>`)}</tbody>
    </table></div>
    ${pp.complete && html`<p class="pick-ok"><${Icon} name="check" /> ${tr('Everything on the pick list is scanned.', 'Đã quét đủ toàn bộ danh sách lấy hàng.')}</p>`}`}
    <div class="pick-actions">
      <label class=${'btn secondary small' + (busy ? ' disabled' : '')}><${Icon} name="upload" /><span>${busy ? tr('Reading…', 'Đang đọc…') : (rec.pick || []).length ? tr('Replace pick list', 'Thay danh sách') : tr('Upload delivery packing list (PDF or Excel)', 'Tải packing list giao hàng (PDF hoặc Excel)')}</span>
        <input type="file" accept=".xlsx,.xls,.csv,.pdf" hidden onChange=${onFile} disabled=${busy} /></label>
      ${(rec.pick || []).length > 0 && html`<button class="link small" onClick=${() => { setRec((r) => ({ ...r, pick: [], pickFile: '' })); setMsg(null); }}>${tr('Remove pick list', 'Bỏ danh sách')}</button>`}
    </div>
    ${msg && html`<p class=${'small ' + (msg.bad ? 'bad-text' : 'muted')}>${msg.text}${msg.warn ? ' ' + msg.warn : ''}</p>`}
  </div>`;
}

// ── The form ────────────────────────────────────────────────────────────────

export function RecordForm({ type: typeProp, editId, copyFrom }) {
  const s = useStore();
  const editing = editId ? getRecord(editId) : null;
  const [restored, setRestored] = useState(false);
  const [rec, setRec] = useState(() => {
    if (editing) return structuredClone(editing);
    if (copyFrom && getRecord(copyFrom)) {
      const src = structuredClone(getRecord(copyFrom));
      const fresh = newRecord(src.type);
      return { ...src, id: fresh.id, docNo: fresh.docNo, date: today(), status: 'active', scans: [], history: [], printed: {}, createdAt: undefined, rev: 0, voidReason: '' };
    }
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(typeProp)) || 'null');
      if (d && d.type === typeProp && ((d.lines || []).length || (d.scans || []).length)) { setTimeout(() => setRestored(true)); return { ...d, docNo: docNoTaken(typeProp, d.docNo) ? nextDocNo(typeProp) : d.docNo }; }
    } catch {}
    const r = newRecord(typeProp);
    r.lines = typeProp === 'transfer' || typeProp === 'inbound' || typeProp === 'putaway' ? [] : [blankLine(1)];
    r.nextLn = r.lines.length ? 2 : 1;
    return r;
  });
  const [errors, setErrors] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const recRef = useRef(rec);
  recRef.current = rec;
  const type = rec.type;

  useEffect(() => {
    if (!editing) try { localStorage.setItem(draftKey(type), JSON.stringify(rec)); } catch {}
  }, [rec]);

  if (editId && !editing) return html`<div class="empty"><h4>${tr('Record not found', 'Không tìm thấy chứng từ')}</h4></div>`;

  const set = (patch) => setRec((r) => ({ ...r, ...patch }));
  const setLine = (i, line) => setRec((r) => ({ ...r, lines: r.lines.map((l, j) => (j === i ? line : l)) }));
  const addLine = () => setRec((r) => ({ ...r, lines: [...r.lines, blankLine(r.nextLn)], nextLn: r.nextLn + 1 }));
  const dupLine = (i) => setRec((r) => ({ ...r, lines: [...r.lines.slice(0, i + 1), { ...r.lines[i], ln: r.nextLn }, ...r.lines.slice(i + 1)], nextLn: r.nextLn + 1 }));
  const removeLine = (i) => setRec((r) => ({ ...r, lines: r.lines.filter((_, j) => j !== i) }));

  const taken = docNoTaken(type, rec.docNo, rec.id);
  const t = totals(rec);
  const labels = recordCartons(rec).length;
  const printedBefore = editing && editing.printed && editing.printed.labels;

  const save = (andPrint, nextShelf) => {
    const clean_ = { ...rec, ...(type === 'putaway' ? { loc: normLoc(rec.loc) } : {}), lines: rec.lines.filter((l) => clean(l.code) || num(l.qty) > 0).map((l) => ({ ...l, code: clean(l.code).toUpperCase() })) };
    const errs = validate(clean_, { docNoTaken: !!taken });
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const saved = saveRecord(clean_, editing ? 'edited' : 'created');
    if (!editing) try { localStorage.removeItem(draftKey(type)); } catch {}
    toast(type === 'putaway' ? tr(`${saved.scans.length} cartons put on ${saved.loc}.`, `Đã xếp ${saved.scans.length} thùng lên ${saved.loc}.`) : tr(`${typeName(type)} ${saved.docNo} saved.`, `Đã lưu ${typeName(type).toLowerCase()} ${saved.docNo}.`));
    if (nextShelf) {
      // Straight on to the next shelf in the same warehouse.
      const r = newRecord('putaway'); r.toWh = saved.toWh;
      setRec(r); setErrors([]); window.scrollTo(0, 0); setScanOpen(true);
      return;
    }
    go(type === 'putaway' ? '/stock' : '/r/' + saved.id);
    if (andPrint) {
      const cartons = recordCartons(saved);
      if (cartons.length) setTimeout(() => printLabels(saved, cartons, state.device), 300);
    }
  };

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey(type)); } catch {}
    const r = newRecord(type);
    r.lines = type === 'transfer' || type === 'inbound' || type === 'putaway' ? [] : [blankLine(1)];
    r.nextLn = r.lines.length ? 2 : 1;
    setRec(r); setRestored(false);
  };

  const wh = s.settings.warehouses;
  const titles = {
    handoff: [tr('Production handoff', 'Giao nhận thành phẩm'), tr('Replaces the paper slip "Phiếu Giao Nhận Thành Phẩm". Each carton gets a QR label.', 'Thay cho phiếu giấy "Phiếu Giao Nhận Thành Phẩm". Mỗi thùng có một nhãn QR.')],
    putaway: [tr('Put away / move to shelf', 'Xếp hàng lên kệ'), tr('Scan the shelf label (or type the location), then scan every carton you put there. Use it again when cartons move to another shelf.', 'Quét nhãn kệ (hoặc nhập vị trí), rồi quét từng thùng đặt ở đó. Dùng lại khi thùng chuyển sang kệ khác.')],
    inbound: [tr('Supplier receipt', 'Nhập hàng từ nhà cung cấp'), tr('Goods arriving from a supplier. Upload the supplier\'s packing list: each carton gets a QR label, then the warehouse scans to confirm receipt.', 'Hàng nhập từ nhà cung cấp. Tải packing list của nhà cung cấp: mỗi thùng có một nhãn QR, sau đó kho quét để xác nhận nhận hàng.')],
    transfer: [tr('Warehouse transfer', 'Chuyển kho'), tr('Scan the labelled cartons that are moving. Unlabelled goods can be added as lines and get labels now.', 'Quét các thùng đã có nhãn được chuyển đi. Hàng chưa có nhãn có thể thêm thành dòng và in nhãn ngay.')],
    shipment: [tr('Shipment / packing list', 'Xuất hàng / packing list'), tr('Scan the production cartons that ship as they are. Only goods repacked into new cartons are entered below and get new labels.', 'Quét các thùng sản xuất xuất nguyên. Chỉ hàng đóng lại thùng mới được nhập bên dưới và in nhãn mới.')],
  }[type];

  return html`
    <${PageHead} back=${editing ? '#/r/' + rec.id : '#/'} eyebrow=${editing ? tr('Edit', 'Sửa') : tr('New', 'Tạo mới')} title=${titles[0]} sub=${titles[1]} />
    ${restored && html`<div class="banner info"><${Icon} name="undo" /><div>${tr('Your unsaved draft was restored.', 'Đã khôi phục bản nháp chưa lưu.')} <button class="link" onClick=${discardDraft}>${tr('Start fresh instead', 'Bắt đầu lại từ đầu')}</button></div></div>`}
    ${printedBefore && html`<div class="banner warn"><${Icon} name="alert" /><div>${tr('Labels for this record were already printed. If you change quantities or pcs per carton, reprint the labels for those lines.', 'Nhãn của chứng từ này đã được in. Nếu thay đổi số lượng hoặc SL/thùng, hãy in lại nhãn cho các dòng đó.')}</div></div>`}
    ${errors.length > 0 && html`<div class="banner bad"><${Icon} name="alert" /><div><b>${tr('Please fix:', 'Vui lòng sửa:')}</b><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div></div>`}

    <div class="card form-card">
      <div class="form-grid">
        ${type === 'putaway' && html`<${Field} label=${tr('Location (shelf)', 'Vị trí (kệ)')} required hint=${tr('e.g. A.1.2 = rack A, level 1, position 2', 'vd. A.1.2 = kệ A, tầng 1, ô 2')}>
          <${Input} value=${rec.loc} onInput=${(v) => set({ loc: v.toUpperCase() })} cls="mono" placeholder="A.1.2" /></${Field}>`}
        <${Field} label=${type === 'handoff' ? tr('Slip no. (Số)', 'Số phiếu') : type === 'shipment' ? tr('Invoice / packing no.', 'Số invoice / packing') : type === 'inbound' ? tr('Supplier packing list / invoice no.', 'Số packing list / invoice của NCC') : type === 'putaway' ? tr('Move no.', 'Số phiếu') : tr('Transfer no.', 'Số phiếu chuyển')} required
          error=${taken ? tr(`Already used by ${taken.docNo} on ${taken.date}`, `Đã dùng cho phiếu ngày ${taken.date}`) : ''}
          hint=${type === 'handoff' && !editing ? tr('Continues the paper slip numbering', 'Tiếp nối số phiếu giấy') : ''}>
          <${Input} value=${rec.docNo} onInput=${(v) => set({ docNo: v })} cls="mono" />
        </${Field}>
        <${Field} label=${tr('Date', 'Ngày')} required><${Input} type="date" value=${rec.date} onInput=${(v) => set({ date: v })} /></${Field}>
        ${type === 'putaway' ? '' : type === 'inbound' ? html`<${Field} label=${tr('Supplier', 'Nhà cung cấp')} required><${Input} value=${rec.supplier} onInput=${(v) => set({ supplier: v })} /></${Field}>`
          : html`<${Field} label=${tr('From', 'Từ')}><${WhSelect} value=${rec.fromWh} onChange=${(v) => set({ fromWh: v })} warehouses=${wh} /></${Field}>`}
        ${type !== 'shipment' && html`<${Field} label=${type === 'inbound' ? tr('Receiving warehouse', 'Kho nhận') : type === 'putaway' ? tr('Warehouse', 'Kho') : tr('To', 'Đến')}><${WhSelect} value=${rec.toWh} onChange=${(v) => set({ toWh: v })} warehouses=${wh} /></${Field}>`}
        ${type === 'handoff' && html`
          <${Field} label=${tr('Delivered by', 'Người giao (xuất)')}><${Input} value=${rec.deliveredBy} onInput=${(v) => set({ deliveredBy: v })} /></${Field}>
          <${Field} label=${tr('Received by', 'Người nhận')} hint=${tr('Optional — the warehouse confirms receipt on the saved slip', 'Tùy chọn — kho xác nhận nhận hàng trên phiếu đã lưu')}><${Input} value=${rec.receivedBy} onInput=${(v) => set({ receivedBy: v })} /></${Field}>
          <${Field} label=${tr('Receipt note no. (PNK)', 'Số phiếu nhập kho (PNK)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} placeholder="PNK0003012" /></${Field}>`}
        ${type === 'inbound' && html`
          <${Field} label=${tr('Our PO to the supplier', 'PO của mình gửi NCC')}><${Input} value=${rec.extRef} onInput=${(v) => set({ extRef: v })} placeholder="PO-…" /></${Field}>
          <${Field} label=${tr('Country of origin', 'Xuất xứ')}><${Input} value=${rec.origin} onInput=${(v) => set({ origin: v })} /></${Field}>
          <${Field} label=${tr('Receipt note no. (PNK)', 'Số phiếu nhập kho (PNK)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} /></${Field}>`}
        ${type === 'transfer' && html`
          <${Field} label="PO / POVN"><${Input} value=${rec.extRef} onInput=${(v) => set({ extRef: v })} placeholder="POVN-2600087" /></${Field}>
          <${Field} label=${tr('Delivery note no. (PXK, sending side)', 'Số phiếu xuất kho (PXK, bên giao)')}><${Input} value=${rec.outNoteNo} onInput=${(v) => set({ outNoteNo: v })} placeholder="pxk0006343" /></${Field}>
          <${Field} label=${tr('Receipt note no. (PNK, receiving side)', 'Số phiếu nhập kho (PNK, bên nhận)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} placeholder="pnk0002874" /></${Field}>`}
        ${type === 'shipment' && html`
          <${Field} label=${tr('Customer', 'Khách hàng')} required><${Input} value=${rec.customer} onInput=${(v) => set({ customer: v })} placeholder="Company name" /></${Field}>
          <${Field} label=${tr('Ship to', 'Giao đến')}><${Input} value=${rec.shipTo} onInput=${(v) => set({ shipTo: v })} /></${Field}>
          <${Field} label=${tr('Contact', 'Liên hệ')}><${Input} value=${rec.contact} onInput=${(v) => set({ contact: v })} /></${Field}>
          <${Field} label=${tr('Salesperson', 'Nhân viên kinh doanh')}><${Input} value=${rec.salesperson} onInput=${(v) => set({ salesperson: v })} /></${Field}>
          <${Field} label=${tr('Delivery note no. (PXK)', 'Số phiếu xuất kho (PXK)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} placeholder="pxk0006343" /></${Field}>
          <${Field} label=${tr('Shipping mark', 'Ký hiệu hàng')}><${Input} value=${rec.shippingMark} onInput=${(v) => set({ shippingMark: v })} /></${Field}>
          <${Field} label=${tr('Shipping date (on label)', 'Ngày xuất (trên nhãn)')}><${Input} type="date" value=${rec.shipDate || ''} onInput=${(v) => set({ shipDate: v })} /></${Field}>
          <${Field} label=${tr('Country of origin', 'Xuất xứ')}><${Input} value=${rec.origin} onInput=${(v) => set({ origin: v })} /></${Field}>`}
        <${Field} label=${tr('Note', 'Ghi chú')} cls="span2"><${Input} value=${rec.note} onInput=${(v) => set({ note: v })} /></${Field}>
      </div>
    </div>

    ${type === 'inbound' && html`<${ImportPackingList} rec=${rec} setRec=${setRec} />`}
    ${type === 'shipment' && html`<${PickList} rec=${rec} setRec=${setRec} />`}
    ${type !== 'handoff' && type !== 'inbound' && html`<div class="scan-cta">
      <${Btn} kind="primary" icon="scan" onClick=${() => setScanOpen(true)}>${tr('Scan cartons', 'Quét thùng')}</${Btn}>
      <span class="muted">${type === 'putaway' ? tr('Scan the shelf label first, then each carton on that shelf.', 'Quét nhãn kệ trước, rồi từng thùng trên kệ đó.') : type === 'transfer' ? tr('Fastest way: scan every carton that is moving.', 'Cách nhanh nhất: quét từng thùng được chuyển.') : tr('Scan the production cartons being shipped — they keep their original labels and QR.', 'Quét các thùng sản xuất được xuất đi — giữ nguyên nhãn và QR ban đầu.')}</span>
    </div>`}
    <${ScannedList} rec=${rec} setRec=${setRec} />

    ${type !== 'putaway' && html`<div class="block-title lines-title"><h3>${type === 'inbound' ? tr('Items on the packing list', 'Hàng trên packing list') : type === 'transfer' ? tr('Unlabelled goods', 'Hàng chưa có nhãn') : type === 'shipment' ? tr('Repacked into new cartons (new labels)', 'Đóng lại vào thùng mới (nhãn mới)') : tr('Items', 'Mã hàng')}</h3>
      <span>${rec.lines.length} ${tr(rec.lines.length === 1 ? 'line' : 'lines', 'dòng')}</span></div>
    <div class="lines">
      ${rec.lines.map((l, i) => html`<${LineCard} key=${l.ln} line=${l} idx=${i} type=${type} onChange=${(nl) => setLine(i, nl)} onRemove=${() => removeLine(i)} onDuplicate=${() => dupLine(i)} />`)}
    </div>
    <${Btn} icon="plus" onClick=${addLine} cls="add-line">${tr('Add item', 'Thêm mã hàng')}</${Btn}>`}

    <div class="form-bar">
      <div class="form-totals">
        <div><b>${fmtNum(t.qty, t.qty % 1 ? 2 : 0)}</b><small>${t.unit ? unitLabel(t.unit) : tr('total qty', 'tổng SL')}</small></div>
        <div><b>${t.cartons}</b><small>${tr('cartons', 'thùng')}</small></div>
        ${type === 'putaway' ? html`<div><b class="mono">${normLoc(rec.loc) || '—'}</b><small>${tr('location', 'vị trí')}</small></div>`
          : type === 'inbound' ? html`<div><b>${labels}</b><small>${tr('new labels', 'nhãn mới')}</small></div><div><b>${fmtDec(t.gw, 2)}</b><small>G.W kg</small></div>`
          : type === 'shipment' ? html`<div><b>${fmtDec(t.gw, 2)}</b><small>G.W kg</small></div><div><b>${fmtDec(t.cbm, 3)}</b><small>CBM</small></div>`
          : html`<div><b>${labels}</b><small>${tr('new labels', 'nhãn mới')}</small></div>`}
      </div>
      <div class="form-buttons">
        <${Btn} onClick=${() => history.back()}>${tr('Cancel', 'Hủy')}</${Btn}>
        <${Btn} onClick=${() => save(false)}>${tr('Save', 'Lưu')}</${Btn}>
        ${type === 'putaway' && html`<${Btn} kind="primary" icon="shelf" onClick=${() => save(false, true)}>${tr('Save & next shelf', 'Lưu & kệ tiếp theo')}</${Btn}>`}
        ${labels > 0 && html`<${Btn} kind="primary" icon="printer" onClick=${() => save(true)}>${tr('Save & print labels', 'Lưu & in nhãn')}</${Btn}>`}
      </div>
    </div>
    ${scanOpen && html`<${ScanModal} recRef=${recRef} setRec=${setRec} onClose=${() => setScanOpen(false)} />`}
  `;
}
