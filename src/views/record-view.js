// A saved slip / transfer / shipment: summary, labels, printouts, Excel, edit, void.

import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, getRecord, voidRecord, restoreRecord, deleteRecord, recordsUsingCartonsOf, markPrinted, toast, docNoTaken, confirmReceipt, clearReceipt } from '../store.js';
import { Icon, Btn, Chip, PageHead, Confirm, Empty, Modal, Field, Input } from '../components.js';
import { typeName, totals, recordCartons, scanGroups, notation, unitLabel, fmtWO, packingRows, movementBlocks, warehouse, hasReceipt, receiptState, expectedCartonIds } from '../model.js';
import { fmtDate, fmtDateTime, fmtNum, fmtDec, num, toTSV, copyText, go } from '../util.js';
import { printLabels, printSlip, printPackingList, labelHTML } from '../print.js';
import { parseScan } from '../qr.js';
import { Scanner, feedback } from './scanner.js';
import { downloadPackingList, downloadStockRows, downloadLabelList } from '../excel.js';

function LabelPreview({ rec, carton, device }) {
  return html`<div class="label-preview" dangerouslySetInnerHTML=${{ __html: labelHTML(carton, rec, device.labelPreset, { qrMode: device.qrMode, showLogo: device.showLogo }) }}></div>`;
}

// The receiving warehouse counts the cartons against the slip. Scan each label, or tick "all received".
function ReceiptModal({ rec, onClose }) {
  const expected = expectedCartonIds(rec);
  const [ids, setIds] = useState(() => new Set(rec.receipt?.ids || []));
  const idsRef = useRef(ids);
  const [by, setBy] = useState(rec.receipt?.by || rec.receivedBy || '');
  const [note, setNote] = useState(rec.receipt?.note || '');
  const [log, setLog] = useState([]);
  const add = (msg, kind) => setLog((l) => [{ msg, kind }, ...l].slice(0, 20));
  const mark = (cid) => { const n = new Set(idsRef.current); n.add(cid); idsRef.current = n; setIds(n); };

  const onCode = (text) => {
    const p = parseScan(text);
    if (!p || !p.cartonId) { feedback(false); add(tr('Not a carton label', 'Không phải nhãn thùng'), 'bad'); return; }
    if (!expected.includes(p.cartonId)) { feedback(false); add(`${p.cartonId} — ${tr('not on this slip', 'không có trong phiếu này')}`, 'bad'); return; }
    if (idsRef.current.has(p.cartonId)) { feedback(false); add(`${p.cartonId} — ${tr('already counted', 'đã đếm rồi')}`, 'warn'); return; }
    mark(p.cartonId); feedback(true); add(`${p.cartonId} — ${tr('counted', 'đã đếm')}`, 'good');
  };
  const missing = expected.length - ids.size;
  const confirm = () => {
    if (!clean_(by)) { toast(tr('Enter who received the goods.', 'Nhập tên người nhận hàng.'), 'bad'); return; }
    confirmReceipt(rec.id, { by, ids: [...ids], note });
    toast(missing ? tr(`Receipt confirmed — ${missing} carton(s) not counted.`, `Đã xác nhận — còn ${missing} thùng chưa đếm.`) : tr('Receipt confirmed.', 'Đã xác nhận nhận hàng.'), missing ? 'warn' : 'ok');
    onClose();
  };
  return html`<${Modal} title=${tr('Confirm receipt', 'Xác nhận nhận hàng')} onClose=${onClose} wide footer=${html`<span class="muted">${ids.size} / ${expected.length} ${tr('cartons counted', 'thùng đã đếm')}</span><${Btn} onClick=${onClose}>${tr('Cancel', 'Hủy')}</${Btn}><${Btn} kind="primary" icon="check" onClick=${confirm}>${tr('Confirm receipt', 'Xác nhận')}</${Btn}>`}>
    <div class="form-grid">
      <${Field} label=${tr('Received by', 'Người nhận')} required><${Input} value=${by} onInput=${setBy} /></${Field}>
      <${Field} label=${tr('Note (e.g. shortage)', 'Ghi chú (vd: thiếu hàng)')}><${Input} value=${note} onInput=${setNote} /></${Field}>
    </div>
    <div class="scan-layout in-modal">
      <${Scanner} onCode=${onCode} compact />
      <ul class="scan-log">${log.length ? log.map((l) => html`<li class=${l.kind}><${Icon} name=${l.kind === 'good' ? 'check' : 'alert'} />${l.msg}</li>`) : html`<li class="muted">${tr('Scan each carton you receive. Cartons not scanned are reported as missing.', 'Quét từng thùng nhận được. Thùng chưa quét sẽ được ghi là thiếu.')}</li>`}</ul>
    </div>
    <${Btn} small onClick=${() => { const n = new Set(expected); idsRef.current = n; setIds(n); }}>${tr('Mark all received', 'Đánh dấu nhận đủ')}</${Btn}>
  </${Modal}>`;
}
const clean_ = (v) => String(v ?? '').trim();

export function RecordView({ id }) {
  const s = useStore();
  const rec = getRecord(id);
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showAllCartons, setShowAllCartons] = useState(false);

  if (!rec) {
    return html`<${PageHead} back="#/records" title=${tr('Record not found', 'Không tìm thấy chứng từ')} />
      <${Empty} icon="alert" title=${tr('Not on this device yet', 'Chưa có trên thiết bị này')}>${s.mode === 'cloud' ? tr('If it was just created on another device, wait for sync.', 'Nếu vừa tạo trên thiết bị khác, hãy chờ đồng bộ.') : ''}</${Empty}>`;
  }

  const t = totals(rec);
  const cartons = recordCartons(rec);
  const groups = scanGroups(rec);
  const isShip = rec.type === 'shipment';
  const voided = rec.status === 'void';
  const wh = (code) => { const w = warehouse(s.settings, code); return tr(w.name, w.vi); };
  const rc = hasReceipt(rec) ? receiptState(rec) : null;
  const dupe = !voided && docNoTaken(rec.type, rec.docNo, rec.id);

  const doPrintLabels = (list) => {
    if (!list.length) return;
    printLabels(rec, list, s.device);
    markPrinted(rec.id, 'labels');
  };
  const doPrintDoc = () => {
    if (isShip) printPackingList(rec); else printSlip(rec);
    markPrinted(rec.id, isShip ? 'packingList' : 'slip');
  };
  const copyStock = async () => {
    const blocks = movementBlocks(rec, s.settings);
    const text = blocks.map((b) => toTSV(b.rows)).join('\r\n');
    const ok = await copyText(text);
    toast(ok ? tr('Rows copied — paste into the stock report sheet (click the first empty cell in column A).', 'Đã sao chép — dán vào sheet stock report (bấm ô trống đầu tiên ở cột A).') : tr('Could not copy', 'Không sao chép được'), ok ? 'ok' : 'bad', 5000);
  };
  const toggle = (cid) => setSelected((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

  const shown = showAllCartons ? cartons : cartons.slice(0, 24);
  const head = {
    handoff: tr('Production handoff', 'Phiếu giao nhận thành phẩm'),
    transfer: tr('Warehouse transfer', 'Phiếu chuyển kho'),
    shipment: tr('Shipment · packing list', 'Xuất hàng · packing list'),
  }[rec.type];

  return html`
    <${PageHead} back="#/records" eyebrow=${head} title=${html`<span class="mono-title">${rec.docNo}</span>`}
      sub=${html`${fmtDate(rec.date)} · ${isShip ? html`${rec.customer}${rec.shipTo ? ' → ' + rec.shipTo : ''}` : html`${wh(rec.fromWh)} → ${wh(rec.toWh)}`}`}
      actions=${html`
        ${voided ? html`<${Chip} kind="bad" icon="ban">${tr('Voided', 'Đã hủy')}</${Chip}>` : html`<${Chip} kind="good" icon="check">${tr('Active', 'Hiệu lực')}</${Chip}>`}
        ${rc && !voided && (rc.status === 'received'
          ? html`<${Chip} kind=${rc.missing ? 'warn' : 'good'} icon="check">${rc.missing ? tr(`Received · ${rc.missing} missing`, `Đã nhận · thiếu ${rc.missing}`) : tr('Received', 'Đã nhận')}</${Chip}>`
          : html`<${Chip} kind="info" icon="inbox">${tr('Awaiting warehouse receipt', 'Chờ kho xác nhận')}</${Chip}>`)}
        ${dupe && html`<${Chip} kind="warn" icon="alert">${tr('Duplicate number', 'Trùng số')}</${Chip}>`}`} />

    ${rc && rc.status === 'received' && html`<div class=${'banner ' + (rc.missing ? 'warn' : 'info')}><${Icon} name="check" /><div>${tr('Received by', 'Người nhận')} <b>${rc.by}</b> · ${fmtDateTime(rc.at)} — ${rc.counted} / ${rc.expected} ${tr('cartons counted', 'thùng đã đếm')}${rc.missing ? '. ' + tr('Missing cartons need a follow-up with production.', 'Thùng thiếu cần làm rõ với bộ phận sản xuất.') : ''}${rec.receipt?.note ? ' · ' + rec.receipt.note : ''} <button class="link small" onClick=${() => { clearReceipt(rec.id); }}>${tr('Undo receipt', 'Hủy xác nhận')}</button></div></div>`}
    ${voided && html`<div class="banner bad"><${Icon} name="ban" /><div><b>${tr('Voided', 'Đã hủy')}</b> ${rec.voidedAt ? fmtDateTime(rec.voidedAt) : ''} — ${rec.voidReason}. ${tr('Its labels will show as voided when scanned.', 'Nhãn của chứng từ này sẽ báo đã hủy khi quét.')}</div></div>`}

    <div class="toolbar">
      ${rc && !voided && html`<${Btn} kind=${rc.status === 'received' ? '' : 'primary'} icon="scan" onClick=${() => setConfirm('receipt')}>${rc.status === 'received' ? tr('Recount / edit receipt', 'Đếm lại / sửa xác nhận') : tr('Confirm receipt (warehouse)', 'Xác nhận nhận hàng (kho)')}</${Btn}>`}
      ${cartons.length > 0 && html`<${Btn} kind="primary" icon="printer" onClick=${() => doPrintLabels(cartons)} disabled=${voided}>${tr('Print all labels', 'In tất cả nhãn')} (${cartons.length})</${Btn}>`}
      <${Btn} icon="file" onClick=${doPrintDoc}>${isShip ? tr('Print packing list', 'In packing list') : tr('Print slip', 'In phiếu')}</${Btn}>
      ${isShip && html`<${Btn} icon="download" onClick=${() => downloadPackingList(rec)}>${tr('Packing list .xlsx', 'Packing list .xlsx')}</${Btn}>`}
      <${Btn} icon="copy" onClick=${copyStock} disabled=${voided}>${tr('Copy rows for stock report', 'Sao chép dòng cho stock report')}</${Btn}>
      <${Btn} icon="download" onClick=${() => downloadStockRows([rec], s.settings, rec.docNo)} disabled=${voided}>${tr('Stock rows .xlsx', 'Dòng stock .xlsx')}</${Btn}>
      <span class="toolbar-gap"></span>
      ${!voided && html`<a class="btn secondary" href=${'#/r/' + rec.id + '/edit'}><${Icon} name="edit" /><span>${tr('Edit', 'Sửa')}</span></a>`}
      <a class="btn secondary" href=${'#/new/' + rec.type + '?copy=' + rec.id}><${Icon} name="copy" /><span>${tr('Copy as new', 'Sao chép thành mới')}</span></a>
      ${voided
        ? html`<${Btn} icon="undo" onClick=${() => restoreRecord(rec.id)}>${tr('Restore', 'Khôi phục')}</${Btn}>`
        : html`<${Btn} kind="danger-ghost" icon="ban" onClick=${() => setConfirm('void')}>${tr('Void', 'Hủy phiếu')}</${Btn}>`}
      <${Btn} kind="danger-ghost" icon="trash" onClick=${() => setConfirm('delete')}>${tr('Delete permanently', 'Xóa hẳn')}</${Btn}>
    </div>

    <div class="kpi-strip">
      <div><small>${tr('Total quantity', 'Tổng số lượng')}</small><b>${fmtNum(t.qty, t.qty % 1 ? 2 : 0)}</b><span>${t.unit ? unitLabel(t.unit) : ''}</span></div>
      <div><small>${tr('Cartons', 'Số thùng')}</small><b>${t.cartons}</b><span>${groups.length ? `${t.scanned} ${tr('scanned', 'đã quét')}` : `${cartons.length} ${tr('labels', 'nhãn')}`}</span></div>
      ${isShip ? html`
        <div><small>${tr('Net weight', 'TL tịnh')}</small><b>${fmtNum(t.nw, 2)}</b><span>kg</span></div>
        <div><small>${tr('Gross weight', 'TL cả bì')}</small><b>${fmtNum(t.gw, 2)}</b><span>kg</span></div>
        <div><small>CBM</small><b>${fmtNum(t.cbm, 3)}</b><span>m³</span></div>` : html`
        <div><small>${tr('Lines', 'Số dòng')}</small><b>${t.lines + groups.length}</b><span>${tr('items', 'mã hàng')}</span></div>
        ${rec.type === 'handoff' ? html`<div><small>${tr('Received by', 'Người nhận')}</small><b class="text">${rec.receivedBy || '—'}</b><span>${rec.deliveredBy ? tr('from ', 'từ ') + rec.deliveredBy : ''}</span></div>`
          : html`<div><small>PO / PNK</small><b class="text">${rec.extRef || '—'}</b><span>${rec.noteNo || ''}</span></div>`}`}
    </div>

    ${isShip ? html`<div class="card"><div class="block-title"><h3>${tr('Packing list', 'Packing list')}</h3><span>${tr('Same layout as the paper packing list', 'Giống mẫu packing list giấy')}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Customer PO</th><th>Customer code</th><th>Internal code</th><th>Description</th><th class="c">Carton no</th><th class="r">Order QTY</th><th class="r">UOM</th><th class="r">Qty/UOM</th><th class="r">N.W</th><th class="r">G.W</th><th class="c">L×W×H</th><th class="r">Total N.W</th><th class="r">Total G.W</th><th class="r">CBM</th></tr></thead>
        <tbody>${packingRows(rec).map((r) => html`<tr><td>${r.po}</td><td>${r.ref}</td><td class="mono">${r.code}</td><td>${r.desc}</td><td class="c">${r.cartonNo}</td><td class="r">${fmtNum(r.qty)}</td><td class="r">${r.uoms}</td><td class="r">${r.perUom === '' ? '' : fmtNum(r.perUom)}</td><td class="r">${r.nw === '' ? '' : fmtNum(r.nw, 2)}</td><td class="r">${r.gw === '' ? '' : fmtNum(r.gw, 2)}</td><td class="c">${r.l ? `${fmtDec(r.l, 1)}×${fmtDec(r.w, 1)}×${fmtDec(r.h, 1)}` : ''}</td><td class="r">${r.tnw === '' ? '' : fmtNum(r.tnw, 2)}</td><td class="r">${r.tgw === '' ? '' : fmtNum(r.tgw, 2)}</td><td class="r">${r.cbm === '' ? '' : fmtNum(r.cbm, 3)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="5" class="r">TOTAL</td><td class="r">${fmtNum(t.qty)}</td><td class="r">${t.cartons}</td><td></td><td></td><td></td><td></td><td class="r">${fmtNum(t.nw, 2)}</td><td class="r">${fmtNum(t.gw, 2)}</td><td class="r">${fmtNum(t.cbm, 3)}</td></tr></tfoot>
      </table></div></div>`
    : (rec.lines || []).length > 0 && html`<div class="card"><div class="block-title"><h3>${tr('Items', 'Mã hàng')}</h3></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>${tr('Item code', 'Mã hàng')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th>${tr('Description', 'Tên hàng')}</th>
          ${rec.type === 'handoff' && html`<th class="r">${tr('Requested', 'SL Y/C')}</th>`}<th class="r">${tr('Quantity', 'Số lượng')}</th><th>${tr('Unit', 'ĐVT')}</th><th>${tr('Cartons', 'Số thùng')}</th>${rec.type === 'handoff' && html`<th>WO</th>`}</tr></thead>
        <tbody>${rec.lines.map((l, i) => html`<tr><td>${i + 1}</td><td class="mono">${l.code}</td><td>${l.ref}</td><td>${l.desc}</td>
          ${rec.type === 'handoff' && html`<td class="r">${l.reqQty ? fmtNum(num(l.reqQty)) : ''}</td>`}<td class="r b">${fmtNum(num(l.qty), num(l.qty) % 1 ? 2 : 0)}</td><td>${unitLabel(l.unit)}</td><td>${notation(l.qty, l.ppc) || '—'}</td>${rec.type === 'handoff' && html`<td>${fmtWO(l.wo)}</td>`}</tr>`)}</tbody>
      </table></div></div>`}

    ${groups.length > 0 && html`<div class="card"><div class="block-title"><h3>${tr('Scanned cartons', 'Thùng đã quét')}</h3><span>${t.scanned} ${tr('cartons', 'thùng')}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${tr('Item code', 'Mã hàng')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th>${tr('Description', 'Tên hàng')}</th><th class="r">${tr('Cartons', 'Thùng')}</th><th class="r">${tr('Per carton', 'SL/thùng')}</th><th class="r">${tr('Total', 'Tổng')}</th></tr></thead>
        <tbody>${groups.map((g) => html`<tr><td class="mono">${g.code}</td><td>${g.ref}</td><td>${g.desc}</td><td class="r">${g.cartons}</td><td class="r">${fmtNum(g.qtyPer)}</td><td class="r b">${fmtNum(g.qty)}</td></tr>`)}</tbody>
      </table></div></div>`}

    ${cartons.length > 0 && html`<div class="card">
      <div class="block-title"><h3>${tr('Carton labels', 'Nhãn thùng')}</h3>
        <span>${rec.printed?.labels ? tr(`Printed ${rec.printed.labels}×`, `Đã in ${rec.printed.labels} lần`) : tr('Not printed yet', 'Chưa in')}</span></div>
      <div class="labels-area">
        <div class="label-preview-wrap"><${LabelPreview} rec=${rec} carton=${cartons[0]} device=${s.device} />
          <small class="muted">${tr('Preview of label 1 — size and QR type are set in Settings.', 'Xem trước nhãn 1 — khổ nhãn và loại QR chỉnh trong Cài đặt.')}</small></div>
        <div class="carton-pick">
          <div class="carton-grid">${shown.map((c) => html`<label class=${'carton-chip ' + (selected.has(c.id) ? 'on' : '')}>
            <input type="checkbox" checked=${selected.has(c.id)} onChange=${() => toggle(c.id)} />
            <b>${c.n}/${c.of}</b><span class="mono">${c.code.slice(-8)}</span><span>${fmtNum(c.qty)}${c.isPartial ? ' ◐' : ''}</span></label>`)}</div>
          ${cartons.length > 24 && html`<button class="link small" onClick=${() => setShowAllCartons(!showAllCartons)}>${showAllCartons ? tr('Show fewer', 'Thu gọn') : tr(`Show all ${cartons.length}`, `Xem tất cả ${cartons.length}`)}</button>`}
          <div class="carton-actions">
            <${Btn} small icon="printer" disabled=${!selected.size || voided} onClick=${() => doPrintLabels(cartons.filter((c) => selected.has(c.id)))}>${tr('Print selected', 'In nhãn đã chọn')} (${selected.size})</${Btn}>
            <${Btn} small onClick=${() => setSelected(new Set(cartons.map((c) => c.id)))}>${tr('Select all', 'Chọn tất cả')}</${Btn}>
            ${selected.size > 0 && html`<${Btn} small onClick=${() => setSelected(new Set())}>${tr('Clear', 'Bỏ chọn')}</${Btn}>`}
            <${Btn} small icon="download" onClick=${() => downloadLabelList(rec)}>${tr('Carton list .csv', 'Danh sách thùng .csv')}</${Btn}>
          </div>
        </div>
      </div>
    </div>`}

    <div class="grid-2 block">
      ${rec.note && html`<div class="card soft"><h4>${tr('Note', 'Ghi chú')}</h4><p class="prose">${rec.note}</p></div>`}
      <div class="card soft"><h4>${tr('History', 'Lịch sử')}</h4>
        <ul class="history">${(rec.history || []).slice().reverse().map((h) => html`<li><b>${({ created: tr('Created', 'Tạo'), edited: tr('Edited', 'Sửa'), voided: tr('Voided', 'Hủy'), restored: tr('Restored', 'Khôi phục'), printed: tr('Printed', 'In'), received: tr('Receipt confirmed', 'Xác nhận nhận hàng'), 'receipt-cleared': tr('Receipt undone', 'Hủy xác nhận nhận hàng') })[h.action] || h.action}</b> · ${fmtDateTime(h.at)}${h.device ? ' · ' + h.device : ''}</li>`)}</ul>
      </div>
    </div>

    ${confirm === 'delete' && html`<${Confirm} title=${tr('Delete this record permanently?', 'Xóa hẳn chứng từ này?')} danger confirmLabel=${tr('Delete permanently', 'Xóa hẳn')}
      message=${tr(`${rec.docNo} will be erased completely and cannot be restored. Use Void instead if you want to keep the history.`, `${rec.docNo} sẽ bị xóa hoàn toàn và không thể khôi phục. Nếu muốn giữ lịch sử, hãy dùng Hủy phiếu.`) + (recordsUsingCartonsOf(rec.id).length ? ' ' + tr(`Warning: ${recordsUsingCartonsOf(rec.id).map((r) => r.docNo).join(', ')} scanned cartons from this record and will lose their carton details.`, `Cảnh báo: ${recordsUsingCartonsOf(rec.id).map((r) => r.docNo).join(', ')} đã quét thùng của chứng từ này và sẽ mất thông tin thùng.`) : '')}
      onConfirm=${() => { deleteRecord(rec.id); toast(tr('Record deleted.', 'Đã xóa chứng từ.')); go('/records'); }} onClose=${() => setConfirm(null)} />`}
    ${confirm === 'receipt' && html`<${ReceiptModal} rec=${rec} onClose=${() => setConfirm(null)} />`}
    ${confirm === 'void' && html`<${Confirm} title=${tr('Void this record?', 'Hủy chứng từ này?')} danger withReason confirmLabel=${tr('Void record', 'Hủy chứng từ')}
      message=${tr('The record stays in the system marked VOID (nothing is deleted). Its carton labels will show as voided when scanned. You can restore it later.', 'Chứng từ vẫn được giữ lại và đánh dấu ĐÃ HỦY (không xóa). Nhãn thùng sẽ báo đã hủy khi quét. Có thể khôi phục sau.')}
      onConfirm=${(reason) => { voidRecord(rec.id, reason); toast(tr('Record voided.', 'Đã hủy chứng từ.')); }} onClose=${() => setConfirm(null)} />`}
  `;
}
