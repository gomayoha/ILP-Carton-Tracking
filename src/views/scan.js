import { html, useState } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, getRecord, findCarton } from '../store.js';
import { PageHead, Icon } from '../components.js';
import { parseScan } from '../qr.js';
import { Scanner, feedback } from './scanner.js';
import { CartonResult } from './carton.js';

export function ScanPage() {
  useStore();
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);

  const onCode = (text) => {
    const p = parseScan(text);
    if (!p) { feedback(false); setResult({ bad: text }); return; }
    if (p.cartonId) {
      const f = findCarton(p.cartonId);
      feedback(!!(f && f.carton));
      setResult({ cid: p.cartonId });
      setRecent((r) => [p.cartonId, ...r.filter((x) => x !== p.cartonId)].slice(0, 8));
      return;
    }
    if (p.recordId) {
      const rec = getRecord(p.recordId);
      feedback(!!rec);
      if (rec) location.hash = '#/r/' + rec.id;
      else setResult({ bad: text });
    }
  };

  return html`
    <${PageHead} eyebrow=${tr('Scan', 'Quét mã')} title=${tr('Scan a carton', 'Quét thùng hàng')}
      sub=${tr('Point the camera at the QR on the carton label. A USB scanner gun also works — click the box below first.', 'Đưa camera vào mã QR trên nhãn thùng. Có thể dùng súng quét USB — bấm vào ô bên dưới trước.')} />
    <div class="scan-layout">
      <${Scanner} onCode=${onCode} />
      <div>
        ${result?.cid && html`<${CartonResult} cid=${result.cid} />`}
        ${result?.bad && html`<div class="card result bad"><div class="result-head"><${Icon} name="alert" size="28" /><div>
          <h3>${tr('Not an Ideal Pack carton label', 'Không phải nhãn thùng Idea L Pack')}</h3>
          <p class="muted">${tr('The code was read, but it is not a label made by this system.', 'Đã đọc được mã, nhưng đây không phải nhãn do hệ thống này tạo.')}</p>
          <p class="mono small break">${result.bad.slice(0, 160)}</p></div></div></div>`}
        ${!result && html`<div class="card soft hint-card">
          <h4>${tr('What you will see', 'Bạn sẽ thấy gì')}</h4>
          <ul class="ticks">
            <li>${tr('Item code, customer ref, quantity and carton number', 'Mã hàng, mã khách, số lượng và số thùng')}</li>
            <li>${tr('Which slip or packing list it belongs to', 'Thuộc phiếu giao nhận hay packing list nào')}</li>
            <li>${tr('Where it is now: which warehouse, or shipped', 'Đang ở đâu: kho nào, hay đã xuất')}</li>
            <li>${tr('A button to reprint a damaged label', 'Nút in lại nhãn bị hỏng')}</li>
          </ul>
        </div>`}
        ${recent.length > 1 && html`<div class="recent-scans"><span class="eyebrow">${tr('Scanned this session', 'Đã quét trong phiên này')}</span>
          ${recent.map((cid) => html`<button class="chip info" onClick=${() => setResult({ cid })}>${cid}</button>`)}</div>`}
      </div>
    </div>
  `;
}
