// One form for all three documents: production handoff, warehouse transfer, shipment.

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, getRecord, newRecord, saveRecord, docNoTaken, nextDocNo, findCarton, cartonLocation, toast, state } from '../store.js';
import { Icon, Btn, Field, Input, NumInput, Select, ItemPicker, WhSelect, PageHead, Modal, Chip } from '../components.js';
import { UNITS, split, notation, totals, validate, typeName, scanGroups, unitLabel, recordCartons } from '../model.js';
import { num, round, fmtNum, fmtDec, newId, today, clean, go } from '../util.js';
import { parseScan } from '../qr.js';
import { Scanner, feedback } from './scanner.js';
import { printLabels } from '../print.js';

const draftKey = (type) => `ilp.draft.new.${type}`;
const unitOpts = () => UNITS.map((u) => ({ value: u.code, label: tr(u.en, u.vi) }));

function blankLine(ln) {
  return { ln, code: '', ref: '', desc: '', unit: 'piece', qty: '', ppc: '', reqQty: '', wo: '', po: '', nw: '', gw: '', pnw: '', pgw: '', l: '', w: '', h: '', printDate: '', packDate: '' };
}

function fromItem(line, it, type) {
  const out = { ...line, code: it.code, ref: it.ref || '', desc: it.desc || '', unit: it.uom || line.unit || 'piece' };
  if (num(it.ppc) > 0) out.ppc = num(it.ppc);
  if (type === 'shipment') for (const k of ['nw', 'gw', 'l', 'w', 'h']) if (num(it[k]) > 0) out[k] = num(it[k]);
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
      ${isShip && html`<${Field} label="Customer PO"><${Input} value=${line.po} onInput=${(v) => set({ po: v })} /></${Field}>`}
      ${type === 'handoff' && html`<${Field} label=${tr('Requested qty', 'SL yêu cầu')}><${NumInput} value=${line.reqQty} onInput=${(v) => set({ reqQty: v })} /></${Field}>`}
      <${Field} label=${type === 'handoff' ? tr('Actual qty', 'SL thực nhận') : isShip ? tr('Order qty', 'SL đặt hàng') : tr('Quantity', 'Số lượng')} required>
        <${NumInput} value=${line.qty} onInput=${(v) => set({ qty: v })} />
      </${Field}>
      <${Field} label=${tr('Pcs per carton', 'SL / thùng')} hint=${!num(line.ppc) ? tr('Leave empty = no labels', 'Để trống = không in nhãn') : ''}>
        <${NumInput} value=${line.ppc} onInput=${(v) => set({ ppc: v })} />
      </${Field}>
      <${Field} label=${tr('Unit', 'Đơn vị')}><${Select} value=${line.unit || 'piece'} onChange=${(v) => set({ unit: v })} options=${unitOpts()} /></${Field}>
      ${type === 'handoff' && html`<${Field} label=${tr('Work order', 'Lệnh sản xuất')}><${Input} value=${line.wo} onInput=${(v) => set({ wo: v })} placeholder="WO10131" /></${Field}>`}
      ${isShip && html`
        <${Field} label=${tr('N.W / carton (kg)', 'TL tịnh / thùng (kg)')}><${NumInput} value=${line.nw} onInput=${(v) => set({ nw: v })} /></${Field}>
        <${Field} label=${tr('G.W / carton (kg)', 'TL cả bì / thùng (kg)')}><${NumInput} value=${line.gw} onInput=${(v) => set({ gw: v })} /></${Field}>
        <${Field} label=${tr('Carton L × W × H (cm)', 'Thùng D × R × C (cm)')} cls="span2">
          <div class="dims"><${NumInput} value=${line.l} onInput=${(v) => set({ l: v })} placeholder="L" /><span>×</span><${NumInput} value=${line.w} onInput=${(v) => set({ w: v })} placeholder="W" /><span>×</span><${NumInput} value=${line.h} onInput=${(v) => set({ h: v })} placeholder="H" /></div>
        </${Field}>`}
    </div>
    ${isShip && sp.partial > 0 && html`<div class="partial-box">
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
      ${sp.count ? html`<span class="notation">${notation(line.qty, line.ppc)}</span><span>= ${fmtNum(num(line.qty))} ${unitLabel(line.unit)} · <b>${sp.count} ${tr(sp.count === 1 ? 'label' : 'labels', 'nhãn')}</b></span>`
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
    if (!p || !p.cartonId) { feedback(false); add(tr('Not a carton label', 'Không phải nhãn thùng'), 'bad'); return; }
    const f = findCarton(p.cartonId);
    if (!f || !f.carton) { feedback(false); add(`${p.cartonId} — ${tr('not found', 'không tìm thấy')}`, 'bad'); return; }
    if (f.rec.status === 'void') { feedback(false); add(`${p.cartonId} — ${tr('its record is voided', 'chứng từ đã hủy')}`, 'bad'); return; }
    if (f.rec.type === 'shipment') { feedback(false); add(`${p.cartonId} — ${tr('this is a shipping label', 'đây là nhãn xuất hàng')}`, 'bad'); return; }
    if (f.rec.id === cur.id) { feedback(false); add(`${p.cartonId} — ${tr('label belongs to this same record', 'nhãn thuộc chính chứng từ này')}`, 'bad'); return; }
    if ((cur.scans || []).some((x) => x.cid === p.cartonId)) { feedback(false); add(`${p.cartonId} — ${tr('already scanned', 'đã quét rồi')}`, 'warn'); return; }

    const c = f.carton;
    const next = { ...cur, scans: [...(cur.scans || []), { cid: c.id, code: c.code, ref: c.ref || '', desc: c.desc || '', qty: c.qty, unit: c.unit, from: f.rec.id }] };
    if (cur.type === 'shipment') {
      const i = cur.lines.findIndex((l) => l.code === c.code);
      if (i >= 0) next.lines = cur.lines.map((l, j) => (j === i ? { ...l, qty: round(num(l.qty) + num(c.qty), 3) } : l));
      else {
        const it = state.items.get(c.code) || { code: c.code, ref: c.ref, desc: c.desc, uom: c.unit };
        next.lines = [...cur.lines, { ...fromItem(blankLine(cur.nextLn), it, 'shipment'), qty: c.qty }];
        next.nextLn = cur.nextLn + 1;
      }
    }
    recRef.current = next; // so a fast second scan sees this one
    setRec(next);

    const loc = cartonLocation(p.cartonId);
    if (loc?.shipped) { feedback(false); add(`${p.cartonId} — ${tr('added, but it was already shipped in', 'đã thêm, nhưng thùng đã xuất trong')} ${loc.rec.docNo}`, 'warn'); return; }
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
  return html`<div class="card scanned">
    <div class="block-title"><h3>${tr('Scanned cartons', 'Thùng đã quét')}</h3><span>${(rec.scans || []).length} ${tr('cartons', 'thùng')}</span></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${tr('Item', 'Mã hàng')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th class="r">${tr('Cartons', 'Thùng')}</th><th class="r">${tr('Per carton', 'SL/thùng')}</th><th class="r">${tr('Total', 'Tổng')}</th></tr></thead>
      <tbody>${groups.map((g) => html`<tr><td class="mono">${g.code}</td><td>${g.ref}</td><td class="r">${g.cartons}</td><td class="r">${fmtNum(g.qtyPer)}</td><td class="r b">${fmtNum(g.qty)}</td></tr>`)}</tbody>
    </table></div>
    <button class="link small" onClick=${() => setOpen(!open)}>${open ? tr('Hide carton IDs', 'Ẩn mã thùng') : tr('Show carton IDs (remove a wrong scan)', 'Xem mã thùng (xóa thùng quét nhầm)')}</button>
    ${open && html`<div class="cid-list">${rec.scans.map((s) => html`<span class="chip info">${s.cid}<button aria-label=${tr('Remove', 'Xóa')} onClick=${() => remove(s.cid)}><${Icon} name="x" /></button></span>`)}</div>`}
    ${rec.type === 'shipment' && html`<p class="muted small">${tr('Scanned quantities were added to the lines above. Set pcs per carton there to print shipping labels.', 'Số lượng quét đã được cộng vào các dòng ở trên. Nhập SL/thùng để in nhãn xuất hàng.')}</p>`}
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
    r.lines = typeProp === 'transfer' ? [] : [blankLine(1)];
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

  const save = (andPrint) => {
    const clean_ = { ...rec, lines: rec.lines.filter((l) => clean(l.code) || num(l.qty) > 0).map((l) => ({ ...l, code: clean(l.code).toUpperCase() })) };
    const errs = validate(clean_, { docNoTaken: !!taken });
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const saved = saveRecord(clean_, editing ? 'edited' : 'created');
    if (!editing) try { localStorage.removeItem(draftKey(type)); } catch {}
    toast(tr(`${typeName(type)} ${saved.docNo} saved.`, `Đã lưu ${typeName(type).toLowerCase()} ${saved.docNo}.`));
    go('/r/' + saved.id);
    if (andPrint) {
      const cartons = recordCartons(saved);
      if (cartons.length) setTimeout(() => printLabels(saved, cartons, state.device), 300);
    }
  };

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey(type)); } catch {}
    const r = newRecord(type);
    r.lines = type === 'transfer' ? [] : [blankLine(1)];
    r.nextLn = r.lines.length ? 2 : 1;
    setRec(r); setRestored(false);
  };

  const wh = s.settings.warehouses;
  const titles = {
    handoff: [tr('Production handoff', 'Giao nhận thành phẩm'), tr('Replaces the paper slip "Phiếu Giao Nhận Thành Phẩm". Each carton gets a QR label.', 'Thay cho phiếu giấy "Phiếu Giao Nhận Thành Phẩm". Mỗi thùng có một nhãn QR.')],
    transfer: [tr('Warehouse transfer', 'Chuyển kho'), tr('Scan the labelled cartons that are moving. Unlabelled goods can be added as lines and get labels now.', 'Quét các thùng đã có nhãn được chuyển đi. Hàng chưa có nhãn có thể thêm thành dòng và in nhãn ngay.')],
    shipment: [tr('Shipment / packing list', 'Xuất hàng / packing list'), tr('Enter order quantity and pcs per carton — cartons, weights, CBM and labels are worked out for you.', 'Nhập số lượng và SL/thùng — hệ thống tự tính số thùng, trọng lượng, CBM và nhãn.')],
  }[type];

  return html`
    <${PageHead} back=${editing ? '#/r/' + rec.id : '#/'} eyebrow=${editing ? tr('Edit', 'Sửa') : tr('New', 'Tạo mới')} title=${titles[0]} sub=${titles[1]} />
    ${restored && html`<div class="banner info"><${Icon} name="undo" /><div>${tr('Your unsaved draft was restored.', 'Đã khôi phục bản nháp chưa lưu.')} <button class="link" onClick=${discardDraft}>${tr('Start fresh instead', 'Bắt đầu lại từ đầu')}</button></div></div>`}
    ${printedBefore && html`<div class="banner warn"><${Icon} name="alert" /><div>${tr('Labels for this record were already printed. If you change quantities or pcs per carton, reprint the labels for those lines.', 'Nhãn của chứng từ này đã được in. Nếu thay đổi số lượng hoặc SL/thùng, hãy in lại nhãn cho các dòng đó.')}</div></div>`}
    ${errors.length > 0 && html`<div class="banner bad"><${Icon} name="alert" /><div><b>${tr('Please fix:', 'Vui lòng sửa:')}</b><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div></div>`}

    <div class="card form-card">
      <div class="form-grid">
        <${Field} label=${type === 'handoff' ? tr('Slip no. (Số)', 'Số phiếu') : type === 'shipment' ? tr('Invoice / packing no.', 'Số invoice / packing') : tr('Transfer no.', 'Số phiếu chuyển')} required
          error=${taken ? tr(`Already used by ${taken.docNo} on ${taken.date}`, `Đã dùng cho phiếu ngày ${taken.date}`) : ''}
          hint=${type === 'handoff' && !editing ? tr('Continues the paper slip numbering', 'Tiếp nối số phiếu giấy') : ''}>
          <${Input} value=${rec.docNo} onInput=${(v) => set({ docNo: v })} cls="mono" />
        </${Field}>
        <${Field} label=${tr('Date', 'Ngày')} required><${Input} type="date" value=${rec.date} onInput=${(v) => set({ date: v })} /></${Field}>
        <${Field} label=${tr('From', 'Từ')}><${WhSelect} value=${rec.fromWh} onChange=${(v) => set({ fromWh: v })} warehouses=${wh} /></${Field}>
        ${type !== 'shipment' && html`<${Field} label=${tr('To', 'Đến')}><${WhSelect} value=${rec.toWh} onChange=${(v) => set({ toWh: v })} warehouses=${wh} /></${Field}>`}
        ${type === 'handoff' && html`
          <${Field} label=${tr('Delivered by', 'Người giao (xuất)')}><${Input} value=${rec.deliveredBy} onInput=${(v) => set({ deliveredBy: v })} /></${Field}>
          <${Field} label=${tr('Received by', 'Người nhận')} required><${Input} value=${rec.receivedBy} onInput=${(v) => set({ receivedBy: v })} /></${Field}>`}
        ${type === 'transfer' && html`
          <${Field} label="PO / POVN"><${Input} value=${rec.extRef} onInput=${(v) => set({ extRef: v })} placeholder="POVN-2600087" /></${Field}>
          <${Field} label=${tr('Receipt note no. (PNK)', 'Số phiếu nhập kho (PNK)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} placeholder="pnk0002874" /></${Field}>`}
        ${type === 'shipment' && html`
          <${Field} label=${tr('Customer', 'Khách hàng')} required><${Input} value=${rec.customer} onInput=${(v) => set({ customer: v })} placeholder="Company name" /></${Field}>
          <${Field} label=${tr('Ship to', 'Giao đến')}><${Input} value=${rec.shipTo} onInput=${(v) => set({ shipTo: v })} /></${Field}>
          <${Field} label=${tr('Contact', 'Liên hệ')}><${Input} value=${rec.contact} onInput=${(v) => set({ contact: v })} /></${Field}>
          <${Field} label=${tr('Salesperson', 'Nhân viên kinh doanh')}><${Input} value=${rec.salesperson} onInput=${(v) => set({ salesperson: v })} /></${Field}>
          <${Field} label=${tr('Delivery note no. (PXK)', 'Số phiếu xuất kho (PXK)')}><${Input} value=${rec.noteNo} onInput=${(v) => set({ noteNo: v })} placeholder="pxk0006343" /></${Field}>
          <${Field} label=${tr('Shipping mark', 'Ký hiệu hàng')}><${Input} value=${rec.shippingMark} onInput=${(v) => set({ shippingMark: v })} /></${Field}>
          <${Field} label=${tr('Country of origin', 'Xuất xứ')}><${Input} value=${rec.origin} onInput=${(v) => set({ origin: v })} /></${Field}>`}
        <${Field} label=${tr('Note', 'Ghi chú')} cls="span2"><${Input} value=${rec.note} onInput=${(v) => set({ note: v })} /></${Field}>
      </div>
    </div>

    ${type !== 'handoff' && html`<div class="scan-cta">
      <${Btn} kind="primary" icon="scan" onClick=${() => setScanOpen(true)}>${tr('Scan cartons', 'Quét thùng')}</${Btn}>
      <span class="muted">${type === 'transfer' ? tr('Fastest way: scan every carton that is moving.', 'Cách nhanh nhất: quét từng thùng được chuyển.') : tr('Optional: scan production cartons being shipped to fill the lines.', 'Tùy chọn: quét thùng sản xuất để tự điền các dòng.')}</span>
    </div>`}
    <${ScannedList} rec=${rec} setRec=${setRec} />

    <div class="block-title lines-title"><h3>${type === 'transfer' ? tr('Unlabelled goods', 'Hàng chưa có nhãn') : tr('Items', 'Mã hàng')}</h3>
      <span>${rec.lines.length} ${tr(rec.lines.length === 1 ? 'line' : 'lines', 'dòng')}</span></div>
    <div class="lines">
      ${rec.lines.map((l, i) => html`<${LineCard} key=${l.ln} line=${l} idx=${i} type=${type} onChange=${(nl) => setLine(i, nl)} onRemove=${() => removeLine(i)} onDuplicate=${() => dupLine(i)} />`)}
    </div>
    <${Btn} icon="plus" onClick=${addLine} cls="add-line">${tr('Add item', 'Thêm mã hàng')}</${Btn}>

    <div class="form-bar">
      <div class="form-totals">
        <div><b>${fmtNum(t.qty, t.qty % 1 ? 2 : 0)}</b><small>${t.unit ? unitLabel(t.unit) : tr('total qty', 'tổng SL')}</small></div>
        <div><b>${t.cartons}</b><small>${tr('cartons', 'thùng')}</small></div>
        ${type === 'shipment' ? html`<div><b>${fmtDec(t.gw, 2)}</b><small>G.W kg</small></div><div><b>${fmtDec(t.cbm, 3)}</b><small>CBM</small></div>`
          : html`<div><b>${labels}</b><small>${tr('new labels', 'nhãn mới')}</small></div>`}
      </div>
      <div class="form-buttons">
        <${Btn} onClick=${() => history.back()}>${tr('Cancel', 'Hủy')}</${Btn}>
        <${Btn} onClick=${() => save(false)}>${tr('Save', 'Lưu')}</${Btn}>
        ${labels > 0 && html`<${Btn} kind="primary" icon="printer" onClick=${() => save(true)}>${tr('Save & print labels', 'Lưu & in nhãn')}</${Btn}>`}
      </div>
    </div>
    ${scanOpen && html`<${ScanModal} recRef=${recRef} setRec=${setRec} onClose=${() => setScanOpen(false)} />`}
  `;
}
