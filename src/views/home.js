import { html } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, recordsList, saveRecord, saveItem, rowToItem, toast } from '../store.js';
import { Icon, Btn, Chip } from '../components.js';
import { totals, typeShort, split } from '../model.js';
import { today, addDays, fmtDate, fmtNum } from '../util.js';
import { SAMPLE_ITEMS, sampleRecords } from '../sample.js';

function weekStart() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(today(), -day);
}

export function RecordRow({ r }) {
  const t = totals(r);
  const icon = { handoff: 'inbox', transfer: 'swap', shipment: 'truck' }[r.type];
  return html`<a class=${'rec-row ' + (r.status === 'void' ? 'void' : '')} href=${'#/r/' + r.id}>
    <span class=${'rec-ico t-' + r.type}><${Icon} name=${icon} /></span>
    <span class="rec-main">
      <b>${r.docNo || '—'}</b>
      <small>${typeShort(r.type)} · ${fmtDate(r.date)}${r.customer ? ' · ' + r.customer : ''}${r.type !== 'shipment' && r.fromWh ? ` · ${r.fromWh} → ${r.toWh}` : ''}</small>
    </span>
    <span class="rec-nums">
      <b>${fmtNum(t.qty)}</b><small>${t.cartons} ${tr('ctns', 'thùng')}</small>
    </span>
    ${r.status === 'void' && html`<${Chip} kind="idle" icon="ban">${tr('Void', 'Đã hủy')}</${Chip}>`}
  </a>`;
}

export function Home() {
  const s = useStore();
  const all = recordsList().filter((r) => r.status !== 'void');
  const ws = weekStart();
  const t0 = today();
  const week = all.filter((r) => r.date >= ws && r.date <= t0);
  const sum = (list, f) => list.reduce((a, r) => a + f(r), 0);
  const labelled = (list) => sum(list, (r) => (r.lines || []).reduce((a, l) => a + split(l.qty, l.ppc).count, 0));
  const scanned = (list) => sum(list, (r) => (r.scans || []).length);
  const todayList = all.filter((r) => r.date === t0);
  const weekLabelled = labelled(week);
  const recent = recordsList().slice(0, 6);

  const loadSample = async () => {
    for (const r of SAMPLE_ITEMS) { const it = rowToItem(r); if (!s.items.has(it.code)) saveItem(it); }
    for (const r of sampleRecords()) if (!s.records.has(r.id)) saveRecord(r, 'created');
    toast(tr('Sample slip 0001955 and packing list IDE0004000 loaded.', 'Đã tải phiếu mẫu 0001955 và packing list IDE0004000.'));
  };

  return html`
    <section class="hero">
      <div>
        <p class="eyebrow">${tr('Carton QR tracking · Idea L Pack', 'Theo dõi thùng bằng QR · Idea L Pack')}</p>
        <h1>${tr('Every carton, one scan away.', 'Mỗi thùng hàng, chỉ một lần quét.')}</h1>
        <p class="hero-sub">${tr('Record production handoffs, transfers between warehouses and shipments. Every carton gets a QR label that anyone can scan to see what is inside and where it has been.',
          'Ghi nhận giao nhận thành phẩm, chuyển kho và xuất hàng. Mỗi thùng có nhãn QR — quét để biết bên trong có gì và đã đi đâu.')}</p>
      </div>
      <aside class="headline-card">
        <span class="eyebrow">${tr('This week', 'Tuần này')}</span>
        <div class="headline-value">${fmtNum(weekLabelled)}</div>
        <p class="headline-label">${tr('cartons labelled since Monday', 'thùng đã dán nhãn từ thứ Hai')}</p>
        <div class="headline-mini">
          <div><b>${week.filter((r) => r.type === 'handoff').length}</b><small>${tr('handoff slips', 'phiếu giao nhận')}</small></div>
          <div><b>${week.filter((r) => r.type === 'transfer').length}</b><small>${tr('transfers', 'lần chuyển kho')}</small></div>
          <div><b>${week.filter((r) => r.type === 'shipment').length}</b><small>${tr('shipments', 'lô xuất hàng')}</small></div>
        </div>
      </aside>
    </section>

    ${s.mode === 'local' && html`<div class="banner warn"><${Icon} name="info" />
      <div><b>${tr('Demo mode', 'Chế độ thử')}</b> — ${tr('data is saved only in this browser. Connect Firebase (docs/SETUP.md) to share it across phones and PCs.', 'dữ liệu chỉ lưu trên trình duyệt này. Kết nối Firebase (docs/SETUP.md) để dùng chung trên điện thoại và máy tính.')}
      ${!s.records.has('S1955A0B') && html`<div class="banner-actions"><${Btn} small icon="sparkle" onClick=${loadSample}>${tr('Load sample: slip 0001955 + packing list IDE0004000', 'Tải dữ liệu mẫu: phiếu 0001955 + packing list IDE0004000')}</${Btn}></div>`}</div>
    </div>`}

    <section class="actions-grid">
      <a class="action big" href="#/scan"><${Icon} name="scan" /><b>${tr('Scan a carton', 'Quét thùng')}</b><small>${tr('Camera or scanner gun', 'Camera hoặc súng quét')}</small></a>
      <a class="action" href="#/new/handoff"><${Icon} name="inbox" /><b>${tr('Production handoff', 'Giao nhận thành phẩm')}</b><small>${tr('PRO → WH slip + carton labels', 'Phiếu PRO → Kho + nhãn thùng')}</small></a>
      <a class="action" href="#/new/transfer"><${Icon} name="swap" /><b>${tr('Warehouse transfer', 'Chuyển kho')}</b><small>${tr('Scan cartons from one warehouse to another', 'Quét thùng chuyển giữa các kho')}</small></a>
      <a class="action" href="#/new/shipment"><${Icon} name="truck" /><b>${tr('Shipment', 'Xuất hàng')}</b><small>${tr('Packing list + shipping labels', 'Packing list + nhãn xuất hàng')}</small></a>
    </section>

    <section class="grid-2 block">
      <div class="card">
        <div class="block-title"><h3>${tr('Recent', 'Gần đây')}</h3><a class="link" href="#/records">${tr('All records', 'Tất cả chứng từ')} →</a></div>
        ${recent.length ? html`<div class="rec-list">${recent.map((r) => html`<${RecordRow} r=${r} />`)}</div>`
          : html`<p class="muted">${tr('Nothing recorded yet. Start with a production handoff.', 'Chưa có dữ liệu. Hãy bắt đầu với phiếu giao nhận thành phẩm.')}</p>`}
      </div>
      <div class="card soft">
        <div class="block-title"><h3>${tr('Today', 'Hôm nay')}</h3><span>${fmtDate(t0)}</span></div>
        <div class="mini-stats">
          <div><b>${fmtNum(labelled(todayList))}</b><span>${tr('cartons labelled', 'thùng dán nhãn')}</span></div>
          <div><b>${fmtNum(scanned(todayList))}</b><span>${tr('cartons scanned out', 'thùng quét xuất')}</span></div>
          <div><b>${fmtNum(sum(todayList.filter((r) => r.type === 'handoff'), (r) => totals(r).qty))}</b><span>${tr('pcs received from production', 'sp nhận từ sản xuất')}</span></div>
        </div>
        <p class="muted small">${s.items.size ? tr(`${fmtNum(s.items.size)} items in the item list.`, `${fmtNum(s.items.size)} mã hàng trong danh mục.`) : html`${tr('The item list is empty — ', 'Danh mục mã hàng đang trống — ')}<a class="link" href="#/items">${tr('import it from the stock report', 'nhập từ file stock report')}</a>.`}</p>
      </div>
    </section>
  `;
}
