// Stock by location (storage): where every carton is now, per warehouse and shelf.
// Same columns as the France warehouse stock report; exports to Excel one sheet per rack.

import { html, useState } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore } from '../store.js';
import { Icon, Btn, Field, Input, WhSelect, PageHead, Empty } from '../components.js';
import { currentStock, stockByLocation, locLabel, unitLabel } from '../model.js';
import { fmtNum, norm, normLoc } from '../util.js';
import { downloadStockByLocation } from '../excel.js';
import { printLocationLabels } from '../print.js';

export function StockPage() {
  const s = useStore();
  const whs = s.settings.warehouses || [];
  const [wh, setWh] = useState(() => { try { return localStorage.getItem('ilp.stock.wh') || s.settings.defaults?.shipment?.fromWh || whs[0]?.code || ''; } catch { return whs[0]?.code || ''; } });
  const [q, setQ] = useState('');
  const [locs, setLocs] = useState('');
  const pickWh = (v) => { setWh(v); try { localStorage.setItem('ilp.stock.wh', v); } catch {} };

  const stock = currentStock([...s.records.values()]);
  const all = stockByLocation(stock, wh);
  const nq = norm(q);
  const rows = nq ? all.filter((r) => norm([r.loc, r.code, r.ref, r.desc].join(' ')).includes(nq)) : all;
  const cartons = rows.reduce((a, r) => a + r.cartons, 0);
  const noLoc = all.filter((r) => !r.loc).reduce((a, r) => a + r.cartons, 0);
  const usedLocs = new Set(all.filter((r) => r.loc).map((r) => r.loc)).size;
  const w = whs.find((x) => x.code === wh);
  const whName = w ? w.name : wh;

  // "A.1.1-A.9.6" or a list "A.1.1, A.1.2" → shelf labels to print.
  const expand = (text) => {
    const out = [];
    for (const part of String(text).split(/[,;\n]+/).map((x) => normLoc(x)).filter(Boolean)) {
      // Range = every level × every position in between: A.1.1-A.9.6 → 9 levels × 6 positions.
      const m = part.match(/^([A-Z]+)\.(\d+)\.(\d+)-(?:[A-Z]+\.)?(\d+)\.(\d+)$/);
      if (m) { for (let l = +m[2]; l <= +m[4]; l++) for (let p = +m[3]; p <= +m[5]; p++) out.push(`${m[1]}.${l}.${p}`); }
      else out.push(part);
    }
    return [...new Set(out)].slice(0, 500);
  };

  return html`
    <${PageHead} eyebrow=${tr('Storage', 'Lưu kho')} title=${tr('Stock by location', 'Tồn kho theo vị trí')}
      sub=${tr('Where every carton is now. Cartons get a location when they are put away (or from the stock-in sheet).', 'Mỗi thùng đang ở đâu. Thùng có vị trí khi được xếp kệ (hoặc từ file nhập kho).')}
      actions=${html`<a class="btn primary" href="#/new/putaway"><${Icon} name="shelf" /><span>${tr('Put away cartons', 'Xếp hàng lên kệ')}</span></a>`} />

    <div class="card form-card">
      <div class="form-grid">
        <${Field} label=${tr('Warehouse', 'Kho')}><${WhSelect} value=${wh} onChange=${pickWh} warehouses=${whs} /></${Field}>
        <${Field} label=${tr('Search', 'Tìm')} cls="span2"><${Input} value=${q} onInput=${setQ} placeholder=${tr('Location, code, customer ref…', 'Vị trí, mã hàng, mã KH…')} /></${Field}>
        <div class="stock-dl"><${Btn} icon="download" onClick=${() => downloadStockByLocation(rows, whName)} disabled=${!rows.length} title=${tr('One sheet per rack, like the France stock report', 'Mỗi kệ một sheet, giống báo cáo tồn kho Pháp')}>${tr('Export Excel', 'Xuất Excel')}</${Btn}></div>
      </div>
    </div>

    <div class="kpi-strip">
      <div><small>${tr('Cartons in stock', 'Thùng tồn kho')}</small><b>${fmtNum(cartons)}</b><span>${whName}</span></div>
      <div><small>${tr('Locations used', 'Vị trí đang dùng')}</small><b>${fmtNum(usedLocs)}</b><span>${tr('shelves', 'kệ')}</span></div>
      <div><small>${tr('Items', 'Mã hàng')}</small><b>${fmtNum(new Set(rows.map((r) => r.code)).size)}</b><span>${tr('codes', 'mã')}</span></div>
      <div><small>${tr('No location yet', 'Chưa có vị trí')}</small><b>${fmtNum(noLoc)}</b><span>${tr('cartons to put away', 'thùng cần xếp kệ')}</span></div>
    </div>

    ${rows.length ? html`<div class="card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Location</th><th>${tr('Customer ref', 'Mã KH')} (Référence)</th><th>${tr('Item code', 'Mã hàng')}</th><th>${tr('Description', 'Tên hàng')}</th><th class="r">${tr('Cartons', 'Số thùng')}</th><th class="r">${tr('Per carton', 'SL/thùng')}</th><th class="r">${tr('Total', 'Tổng')}</th></tr></thead>
      <tbody>${rows.map((r, i) => html`<tr class=${i > 0 && rows[i - 1].loc === r.loc ? 'same-loc' : ''}>
        <td class="mono b">${i > 0 && rows[i - 1].loc === r.loc ? '' : r.loc ? locLabel(r.loc) : html`<span class="muted">${tr('— none —', '— chưa có —')}</span>`}</td>
        <td>${r.ref}</td><td class="mono">${r.code}</td><td>${r.desc}</td><td class="r b">${r.cartons}</td><td class="r">${fmtNum(r.perCarton)}</td><td class="r">${fmtNum(r.qty)} <small class="muted">${unitLabel(r.unit)}</small></td></tr>`)}</tbody>
    </table></div></div>`
    : html`<${Empty} icon="box" title=${tr('No cartons in this warehouse yet', 'Kho này chưa có thùng nào')}>${tr('Cartons appear here after a production handoff, a supplier receipt or a transfer into this warehouse.', 'Thùng sẽ hiện ở đây sau khi giao nhận thành phẩm, nhập hàng NCC hoặc chuyển kho vào kho này.')}</${Empty}>`}

    <div class="card soft block">
      <div class="block-title"><h3>${tr('Shelf labels', 'Nhãn kệ')}</h3></div>
      <p class="muted small">${tr('Print a QR label for each shelf position. Scanning it in "Put away" fills in the location. Type a range like A.1.1-A.9.6 or a list A.1.1, A.1.2.', 'In nhãn QR cho từng ô kệ. Quét nhãn trong "Xếp kệ" sẽ tự điền vị trí. Nhập dải như A.1.1-A.9.6 hoặc danh sách A.1.1, A.1.2.')}</p>
      <div class="form-grid">
        <${Field} label=${tr('Locations', 'Vị trí')} cls="span2"><${Input} value=${locs} onInput=${setLocs} cls="mono" placeholder="A.1.1-A.9.6" /></${Field}>
        <div class="stock-dl"><${Btn} icon="printer" onClick=${() => printLocationLabels(expand(locs), s.device)} disabled=${!expand(locs).length}>${tr('Print', 'In')} ${expand(locs).length || ''} ${tr('labels', 'nhãn')}</${Btn}></div>
      </div>
    </div>
  `;
}
