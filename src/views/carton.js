// What a scanned carton is, where it came from and where it went.

import { html } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, findCarton, cartonMovements, cartonLocation, getRecord } from '../store.js';
import { Icon, Btn, Chip, PageHead, Empty } from '../components.js';
import { typeName, unitLabel, fmtWO, warehouse } from '../model.js';
import { fmtDate, fmtNum, fmtDec } from '../util.js';
import { printLabels } from '../print.js';

export function CartonResult({ cid, compact }) {
  const s = useStore();
  const found = findCarton(cid);
  if (!found || !found.carton) {
    const rec = found?.rec || getRecord(String(cid).split('-')[0]);
    return html`<div class="card result bad">
      <div class="result-head"><${Icon} name="alert" size="28" /><div>
        <h3>${rec ? tr('This carton is no longer on its record', 'Thùng này không còn trong chứng từ') : tr('Carton not found', 'Không tìm thấy thùng')}</h3>
        <p class="muted">${rec
          ? tr(`Record ${rec.docNo} was edited after the label was printed (carton count changed). Reprint the labels for that record.`, `Chứng từ ${rec.docNo} đã được sửa sau khi in nhãn (thay đổi số thùng). Hãy in lại nhãn của chứng từ này.`)
          : s.mode === 'cloud' && !s.sync.synced
            ? tr('Still downloading records — wait a moment and scan again.', 'Đang tải dữ liệu — chờ một chút rồi quét lại.')
            : tr('No record has this carton ID. If it was created on another device, check that device is online so it can sync.', 'Không có chứng từ nào chứa mã thùng này. Nếu được tạo trên thiết bị khác, hãy kiểm tra thiết bị đó đã có mạng để đồng bộ.')}</p>
        <p class="mono small">${cid}</p>
        ${rec && html`<a class="link" href=${'#/r/' + rec.id}>${tr('Open record', 'Mở chứng từ')} ${rec.docNo} →</a>`}
      </div></div>
    </div>`;
  }
  const { carton: c, rec } = found;
  const moves = cartonMovements(cid);
  const loc = cartonLocation(cid);
  const wh = (code) => { const w = warehouse(s.settings, code); return tr(w.name, w.vi); };
  const voided = rec.status === 'void';
  const status = voided
    ? html`<${Chip} kind="bad" icon="ban">${tr('Record voided', 'Chứng từ đã hủy')}</${Chip}>`
    : loc?.shipped
      ? html`<${Chip} kind="info" icon="truck">${tr('Shipped', 'Đã xuất')} · ${loc.rec.docNo}</${Chip}>`
      : html`<${Chip} kind="good" icon="check">${tr('In', 'Tại')} ${wh(loc?.wh)}</${Chip}>`;

  return html`<div class=${'card result ' + (voided ? 'void' : '')}>
    <div class="result-head">
      <div class="result-ctn"><span>${rec.type === 'shipment' ? 'CARTON' : tr('CARTON', 'THÙNG')}</span><b>${c.n}<i>/${c.of}</i></b></div>
      <div class="result-main">
        ${status}
        <h3 class="mono">${c.code}</h3>
        <p><b>${c.ref || '—'}</b>${c.desc ? ' · ' + c.desc : ''}</p>
        <p class="result-qty">${fmtNum(c.qty, c.qty % 1 ? 2 : 0)} <small>${unitLabel(c.unit)}</small>${c.isPartial ? html` <${Chip} kind="warn">${tr('Partial carton', 'Thùng lẻ')}</${Chip}>` : ''}</p>
      </div>
    </div>
    <dl class="kv">
      <div><dt>${rec.type === 'shipment' ? tr('Packing list', 'Packing list') : tr('Slip no.', 'Số phiếu')}</dt><dd><a class="link" href=${'#/r/' + rec.id}>${rec.docNo}</a></dd></div>
      <div><dt>${tr('Date', 'Ngày')}</dt><dd>${fmtDate(rec.date)}</dd></div>
      ${c.wo && html`<div><dt>${tr('Work order', 'Lệnh SX')}</dt><dd>${fmtWO(c.wo)}</dd></div>`}
      ${c.po && html`<div><dt>Customer PO</dt><dd>${c.po}</dd></div>`}
      ${rec.type === 'shipment' && html`<div><dt>${tr('Customer', 'Khách hàng')}</dt><dd>${rec.customer}</dd></div>`}
      ${rec.type === 'shipment' && (c.nw || c.gw) && html`<div><dt>N.W / G.W</dt><dd>${fmtDec(c.nw, 2)} / ${fmtDec(c.gw, 2)} kg</dd></div>`}
      <div><dt>${tr('Carton ID', 'Mã thùng')}</dt><dd class="mono">${c.id}</dd></div>
    </dl>
    ${!compact && html`<div class="timeline">
      <h4>${tr('History', 'Lịch sử')}</h4>
      <ol>
        <li><span class="dot good"></span><div><b>${rec.type === 'shipment' ? tr('Packed for shipment', 'Đóng gói xuất hàng') : tr('Labelled', 'Dán nhãn')} — ${typeName(rec.type)}</b>
          <small>${fmtDate(rec.date)} · ${rec.docNo}${rec.type !== 'shipment' ? ` · ${rec.fromWh} → ${rec.toWh}` : ` · ${rec.customer}`}</small></div></li>
        ${moves.map((m) => html`<li><span class=${'dot ' + (m.type === 'shipment' ? 'info' : 'good')}></span><div>
          <b>${m.type === 'shipment' ? tr('Shipped', 'Đã xuất hàng') : tr('Transferred', 'Đã chuyển kho')} — <a class="link" href=${'#/r/' + m.id}>${m.docNo}</a></b>
          <small>${fmtDate(m.date)} · ${m.type === 'shipment' ? m.customer : `${m.fromWh} → ${m.toWh}`}</small></div></li>`)}
      </ol>
    </div>`}
    <div class="result-actions">
      <${Btn} icon="printer" onClick=${() => printLabels(rec, [c], s.device)}>${tr('Reprint label', 'In lại nhãn')}</${Btn}>
      <a class="btn secondary" href=${'#/r/' + rec.id}><${Icon} name="file" /><span>${tr('Open record', 'Mở chứng từ')}</span></a>
    </div>
  </div>`;
}

export function CartonPage({ cid }) {
  return html`
    <${PageHead} back="#/scan" eyebrow=${tr('Carton', 'Thùng hàng')} title=${tr('Carton details', 'Thông tin thùng')} />
    <${CartonResult} cid=${cid} />
    <p class="center"><a class="btn primary" href="#/scan"><${Icon} name="scan" /><span>${tr('Scan another', 'Quét thùng khác')}</span></a></p>
  `;
}
