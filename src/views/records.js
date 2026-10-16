// Search, filter and export all slips, transfers and shipments.

import { html, useState } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, recordsList, toast } from '../store.js';
import { Icon, Btn, PageHead, Empty, Input, Select } from '../components.js';
import { totals, typeShort, movementBlocks } from '../model.js';
import { today, addDays, norm, fmtNum, toTSV, copyText } from '../util.js';
import { RecordRow } from './home.js';
import { downloadStockRows, downloadLines, stockRows } from '../excel.js';

const FKEY = 'ilp.recordFilters';

function matches(r, q) {
  if (!q) return true;
  const hay = norm([r.docNo, r.customer, r.shipTo, r.extRef, r.noteNo, r.receivedBy, r.deliveredBy, r.note,
    ...(r.lines || []).flatMap((l) => [l.code, l.ref, l.desc, l.wo, l.wo ? 'wo' + l.wo : '', l.po]),
    ...(r.scans || []).flatMap((x) => [x.cid, x.code, x.ref])].join(' '));
  return norm(q).split(' ').every((w) => hay.includes(w));
}

export function RecordsPage({ query }) {
  const s = useStore();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FKEY) || '{}'); } catch { return {}; } })();
  const [type, setType] = useState(query.type || saved.type || 'all');
  const [range, setRange] = useState(saved.range || '30');
  const [from, setFrom] = useState(saved.from || addDays(today(), -30));
  const [to, setTo] = useState(saved.to || today());
  const [status, setStatus] = useState(saved.status || 'active');
  const [q, setQ] = useState('');

  const persist = (patch) => { try { localStorage.setItem(FKEY, JSON.stringify({ type, range, from, to, status, ...patch })); } catch {} };
  const setT = (v) => { setType(v); persist({ type: v }); };
  const setR = (v) => { setRange(v); persist({ range: v }); };

  let lo = '', hi = '9999';
  if (range === 'today') { lo = today(); hi = today(); }
  else if (range === '7') lo = addDays(today(), -6);
  else if (range === '30') lo = addDays(today(), -29);
  else if (range === 'custom') { lo = from; hi = to; }

  const list = recordsList().filter((r) =>
    (type === 'all' || r.type === type) &&
    (status === 'all' || (status === 'void' ? r.status === 'void' : r.status !== 'void')) &&
    (!lo || (r.date >= lo && r.date <= hi)) && matches(r, q));

  const sumQty = list.filter((r) => r.status !== 'void').reduce((a, r) => a + totals(r).qty, 0);
  const sumCtn = list.filter((r) => r.status !== 'void').reduce((a, r) => a + totals(r).cartons, 0);
  const label = range === 'today' ? today() : lo ? `${lo} to ${hi === '9999' ? today() : hi}` : 'all';

  const copyAll = async () => {
    const blocks = stockRows(list, s.settings);
    if (!blocks.length) return toast(tr('Nothing to copy.', 'Không có gì để sao chép.'), 'bad');
    if (blocks.length > 1) {
      toast(tr('These records touch more than one warehouse sheet — use "Stock rows .xlsx" to get one sheet per warehouse.', 'Các chứng từ liên quan nhiều kho — dùng "Dòng stock .xlsx" để có mỗi kho một sheet.'), 'bad', 6000);
      return;
    }
    const ok = await copyText(toTSV(blocks[0].rows));
    toast(ok ? tr(`${blocks[0].rows.length} rows copied for ${blocks[0].wh.code}.`, `Đã sao chép ${blocks[0].rows.length} dòng cho ${blocks[0].wh.code}.`) : tr('Could not copy', 'Không sao chép được'), ok ? 'ok' : 'bad');
  };

  const types = [['all', tr('All', 'Tất cả')], ['handoff', typeShort('handoff')], ['transfer', typeShort('transfer')], ['shipment', typeShort('shipment')]];
  return html`
    <${PageHead} eyebrow=${tr('Records', 'Chứng từ')} title=${tr('Slips, transfers & shipments', 'Phiếu, chuyển kho & xuất hàng')}
      actions=${html`<a class="btn primary" href="#/new/handoff"><${Icon} name="plus" /><span>${tr('New handoff', 'Phiếu giao nhận mới')}</span></a>`} />

    <div class="filters card">
      <div class="segmented" role="group">${types.map(([k, l]) => html`<button aria-pressed=${type === k} onClick=${() => setT(k)}>${l}</button>`)}</div>
      <div class="filter-row">
        <div class="search-box"><${Icon} name="search" /><${Input} value=${q} onInput=${setQ} placeholder=${tr('Doc no, item code, customer ref, WO, PO, customer…', 'Số phiếu, mã hàng, mã KH, WO, PO, khách hàng…')} /></div>
        <${Select} value=${range} onChange=${setR} options=${[
          { value: 'today', label: tr('Today', 'Hôm nay') }, { value: '7', label: tr('Last 7 days', '7 ngày qua') },
          { value: '30', label: tr('Last 30 days', '30 ngày qua') }, { value: 'all', label: tr('All dates', 'Mọi ngày') }, { value: 'custom', label: tr('Custom dates', 'Chọn ngày') }]} />
        ${range === 'custom' && html`<${Input} type="date" value=${from} onInput=${(v) => { setFrom(v); persist({ from: v }); }} /><${Input} type="date" value=${to} onInput=${(v) => { setTo(v); persist({ to: v }); }} />`}
        <${Select} value=${status} onChange=${(v) => { setStatus(v); persist({ status: v }); }} options=${[
          { value: 'active', label: tr('Active', 'Hiệu lực') }, { value: 'void', label: tr('Voided', 'Đã hủy') }, { value: 'all', label: tr('Active + voided', 'Tất cả') }]} />
      </div>
    </div>

    <div class="list-head">
      <p><b>${list.length}</b> ${tr('records', 'chứng từ')} · ${fmtNum(sumQty)} ${tr('pcs', 'sp')} · ${fmtNum(sumCtn)} ${tr('cartons', 'thùng')}</p>
      <div class="list-actions">
        <${Btn} small icon="copy" onClick=${copyAll} disabled=${!list.length}>${tr('Copy stock rows', 'Sao chép dòng stock')}</${Btn}>
        <${Btn} small icon="download" onClick=${() => downloadStockRows(list, s.settings, label)} disabled=${!list.length}>${tr('Stock rows .xlsx', 'Dòng stock .xlsx')}</${Btn}>
        <${Btn} small icon="download" onClick=${() => downloadLines(list, s.settings, label)} disabled=${!list.length}>${tr('All lines .xlsx', 'Tất cả dòng .xlsx')}</${Btn}>
        <${Btn} small onClick=${() => downloadLines(list, s.settings, label, 'csv')} disabled=${!list.length}>CSV</${Btn}>
      </div>
    </div>

    ${list.length ? html`<div class="card flush"><div class="rec-list">${list.slice(0, 300).map((r) => html`<${RecordRow} r=${r} />`)}</div></div>
      ${list.length > 300 && html`<p class="muted center">${tr('Showing the first 300. Narrow the dates or search to see more.', 'Đang hiện 300 chứng từ đầu. Thu hẹp ngày hoặc tìm kiếm để xem thêm.')}</p>`}`
      : html`<${Empty} icon="search" title=${tr('No records match', 'Không có chứng từ phù hợp')}>${tr('Try a wider date range or clear the search.', 'Thử mở rộng khoảng ngày hoặc xóa ô tìm kiếm.')}</${Empty}>`}
  `;
}
