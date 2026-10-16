// Item master: search, edit, import from the stock report workbooks.

import { html, useState } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { useStore, searchItems, saveItem, importItems, toast, itemToRow } from '../store.js';
import { Icon, Btn, PageHead, Empty, Field, Input, NumInput, Select, Modal } from '../components.js';
import { UNITS, unitLabel } from '../model.js';
import { fmtNum, fmtDec, fmtDateTime, num, clean } from '../util.js';
import { parseItemFiles } from '../excel.js';

function ItemEditor({ item, onClose }) {
  const [it, setIt] = useState({ code: '', ref: '', desc: '', uom: 'piece', ppc: '', l: '', w: '', h: '', nw: '', gw: '', cust: '', ...item });
  const set = (p) => setIt((x) => ({ ...x, ...p }));
  const isNew = !item?.code;
  const save = () => {
    if (!/^[A-Z0-9][A-Z0-9._-]{3,}$/i.test(clean(it.code))) return toast(tr('Enter a valid item code.', 'Nhập mã hàng hợp lệ.'), 'bad');
    const out = { ...it, code: clean(it.code).toUpperCase() };
    for (const k of ['ppc', 'l', 'w', 'h', 'nw', 'gw']) out[k] = out[k] === '' ? '' : num(out[k]);
    saveItem(out);
    toast(tr('Item saved.', 'Đã lưu mã hàng.'));
    onClose();
  };
  return html`<${Modal} title=${isNew ? tr('Add item', 'Thêm mã hàng') : it.code} onClose=${onClose} footer=${html`<${Btn} onClick=${onClose}>${tr('Cancel', 'Hủy')}</${Btn}><${Btn} kind="primary" onClick=${save}>${tr('Save', 'Lưu')}</${Btn}>`}>
    <div class="form-grid">
      <${Field} label=${tr('Internal code', 'Mã nội bộ')} required><${Input} value=${it.code} onInput=${(v) => set({ code: v })} readOnly=${!isNew} cls="mono" placeholder="ILPDIM13033191" /></${Field}>
      <${Field} label=${tr('Customer ref', 'Mã khách hàng')}><${Input} value=${it.ref} onInput=${(v) => set({ ref: v })} /></${Field}>
      <${Field} label=${tr('Description', 'Tên hàng')} cls="span2"><${Input} value=${it.desc} onInput=${(v) => set({ desc: v })} /></${Field}>
      <${Field} label=${tr('Unit', 'Đơn vị')}><${Select} value=${it.uom || 'piece'} onChange=${(v) => set({ uom: v })} options=${UNITS.map((u) => ({ value: u.code, label: tr(u.en, u.vi) }))} /></${Field}>
      <${Field} label=${tr('Usual pcs per carton', 'SL / thùng thường dùng')}><${NumInput} value=${it.ppc} onInput=${(v) => set({ ppc: v })} /></${Field}>
      <${Field} label=${tr('N.W / carton (kg)', 'TL tịnh / thùng (kg)')}><${NumInput} value=${it.nw} onInput=${(v) => set({ nw: v })} /></${Field}>
      <${Field} label=${tr('G.W / carton (kg)', 'TL cả bì / thùng (kg)')}><${NumInput} value=${it.gw} onInput=${(v) => set({ gw: v })} /></${Field}>
      <${Field} label=${tr('Carton L × W × H (cm)', 'Thùng D × R × C (cm)')} cls="span2"><div class="dims"><${NumInput} value=${it.l} onInput=${(v) => set({ l: v })} placeholder="L" /><span>×</span><${NumInput} value=${it.w} onInput=${(v) => set({ w: v })} placeholder="W" /><span>×</span><${NumInput} value=${it.h} onInput=${(v) => set({ h: v })} placeholder="H" /></div></${Field}>
      <${Field} label=${tr('Usual customer', 'Khách hàng thường')} cls="span2"><${Input} value=${it.cust} onInput=${(v) => set({ cust: v })} /></${Field}>
    </div>
    <p class="muted small">${tr('Carton size, weights and dimensions also update by themselves from saved slips and shipments.', 'Quy cách thùng, trọng lượng và kích thước cũng tự cập nhật từ các phiếu đã lưu.')}</p>
  </${Modal}>`;
}

function ImportModal({ onClose }) {
  const s = useStore();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');

  const parse = async () => {
    setBusy(true); setErr('');
    try {
      const existing = keep ? [...s.items.values()].map(itemToRow) : [];
      setRes(await parseItemFiles(files, existing));
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const apply = async () => {
    if (s.mode === 'cloud' && !navigator.onLine) return setErr(tr('You are offline. Importing needs a connection.', 'Đang mất mạng. Cần có mạng để nhập.'));
    setBusy(true);
    try {
      await importItems(res.rows, files.map((f) => f.name).join(', '));
      toast(tr(`${fmtNum(res.stats.total)} items imported.`, `Đã nhập ${fmtNum(res.stats.total)} mã hàng.`));
      onClose();
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };

  return html`<${Modal} title=${tr('Import item list from Excel', 'Nhập danh mục mã hàng từ Excel')} onClose=${onClose} wide footer=${html`
    <${Btn} onClick=${onClose}>${tr('Cancel', 'Hủy')}</${Btn}>
    ${res ? html`<${Btn} kind="primary" icon="upload" onClick=${apply} disabled=${busy}>${busy ? tr('Saving…', 'Đang lưu…') : tr(`Import ${fmtNum(res.stats.total)} items`, `Nhập ${fmtNum(res.stats.total)} mã hàng`)}</${Btn}>`
      : html`<${Btn} kind="primary" onClick=${parse} disabled=${!files.length || busy}>${busy ? tr('Reading…', 'Đang đọc…') : tr('Read files', 'Đọc file')}</${Btn}>`}`}>
    <p class="prose">${tr('Choose the stock report workbooks (Print and Trading). The app reads every sheet that has an internal-code column — "STOCK PRINT REPORT", "item", "PRINT", "In-out detail", "SPEC", "vị trí" — and joins internal code, customer ref, description, carton size and dimensions. Nothing in the Excel files is changed.',
      'Chọn file stock report (Print và Trading). Ứng dụng đọc mọi sheet có cột mã nội bộ — "STOCK PRINT REPORT", "item", "PRINT", "In-out detail", "SPEC", "vị trí" — và ghép mã nội bộ, mã khách, tên hàng, quy cách thùng và kích thước. File Excel không bị thay đổi.')}</p>
    <label class="file-drop">
      <input type="file" accept=".xlsx,.xlsm,.xls,.csv" multiple onChange=${(e) => { setFiles([...e.target.files]); setRes(null); }} />
      <${Icon} name="upload" size="28" />
      <b>${files.length ? files.map((f) => f.name).join(', ') : tr('Choose Excel files', 'Chọn file Excel')}</b>
      <small>${tr('You can pick several files at once', 'Có thể chọn nhiều file cùng lúc')}</small>
    </label>
    ${s.items.size > 0 && html`<label class="check"><input type="checkbox" checked=${keep} onChange=${(e) => setKeep(e.target.checked)} /> ${tr(`Keep the ${fmtNum(s.items.size)} items already in the list (recommended)`, `Giữ lại ${fmtNum(s.items.size)} mã hàng đang có (khuyên dùng)`)}</label>`}
    ${err && html`<div class="banner bad"><${Icon} name="alert" />${err}</div>`}
    ${res && html`<div class="import-result">
      <div class="mini-stats">
        <div><b>${fmtNum(res.stats.total)}</b><span>${tr('items', 'mã hàng')}</span></div>
        <div><b>${fmtNum(res.stats.withRef)}</b><span>${tr('with customer ref', 'có mã khách')}</span></div>
        <div><b>${fmtNum(res.stats.withCarton)}</b><span>${tr('with carton size', 'có quy cách thùng')}</span></div>
      </div>
      <p class="muted small">${tr('Sheets read', 'Sheet đã đọc')}: ${res.report.map((r) => `${r.sheet} (${fmtNum(r.rows)})`).join(' · ') || '—'}</p>
      ${res.sample.length > 0 && html`<div class="table-wrap"><table class="data"><thead><tr><th>${tr('Internal code', 'Mã nội bộ')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th>${tr('Description', 'Tên hàng')}</th></tr></thead>
        <tbody>${res.sample.map((i) => html`<tr><td class="mono">${i.code}</td><td>${i.ref}</td><td>${i.desc}</td></tr>`)}</tbody></table></div>`}
      <p class="muted small">${tr('Items edited in the app keep their edits.', 'Mã hàng đã sửa trong ứng dụng vẫn giữ nội dung đã sửa.')}</p>
    </div>`}
  </${Modal}>`;
}

export function ItemsPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [imp, setImp] = useState(false);
  const all = [...s.items.values()];
  // Without a search, show items people actually use first: edited/learned, then those with a customer ref.
  const list = q ? searchItems(q, 100) : [...all.filter((i) => i.edited), ...all.filter((i) => !i.edited && i.ref), ...all.filter((i) => !i.edited && !i.ref)].slice(0, 100);
  const meta = s.itemsMeta;

  return html`
    <${PageHead} eyebrow=${tr('Item list', 'Danh mục mã hàng')} title=${tr('Items', 'Mã hàng')}
      sub=${meta ? tr(`${fmtNum(s.items.size)} items · last import ${fmtDateTime(meta.importedAt)}`, `${fmtNum(s.items.size)} mã hàng · nhập lần cuối ${fmtDateTime(meta.importedAt)}`) : tr('Import the stock report once so staff pick items instead of typing long codes.', 'Nhập file stock report một lần để nhân viên chọn mã thay vì gõ mã dài.')}
      actions=${html`<${Btn} icon="upload" onClick=${() => setImp(true)}>${tr('Import from Excel', 'Nhập từ Excel')}</${Btn}><${Btn} kind="primary" icon="plus" onClick=${() => setEdit({})}>${tr('Add item', 'Thêm mã hàng')}</${Btn}>`} />
    <div class="search-box big"><${Icon} name="search" /><${Input} value=${q} onInput=${setQ} autofocus placeholder=${tr('Search code, last digits, customer ref or name', 'Tìm mã, số cuối, mã khách hoặc tên hàng')} /></div>
    ${all.length === 0 ? html`<${Empty} icon="box" title=${tr('No items yet', 'Chưa có mã hàng')}>${tr('Use "Import from Excel" and choose the STOCK REPORT Print and Trading files.', 'Bấm "Nhập từ Excel" và chọn file STOCK REPORT Print và Trading.')}</${Empty}>`
      : html`<div class="table-wrap card flush"><table class="data">
        <thead><tr><th>${tr('Internal code', 'Mã nội bộ')}</th><th>${tr('Customer ref', 'Mã KH')}</th><th>${tr('Description', 'Tên hàng')}</th><th class="r">${tr('Pcs/ctn', 'SL/thùng')}</th><th class="r">N.W / G.W</th><th class="c">L×W×H</th><th></th></tr></thead>
        <tbody>${list.map((it) => html`<tr class="clickable" onClick=${() => setEdit(it)}>
          <td class="mono">${it.code}</td><td>${it.ref}</td><td class="wrap">${it.desc}</td><td class="r">${num(it.ppc) ? fmtNum(num(it.ppc)) : ''}</td>
          <td class="r">${num(it.nw) || num(it.gw) ? `${fmtDec(it.nw, 2)} / ${fmtDec(it.gw, 2)}` : ''}</td>
          <td class="c">${num(it.l) ? `${fmtDec(it.l, 1)}×${fmtDec(it.w, 1)}×${fmtDec(it.h, 1)}` : ''}</td>
          <td class="r"><${Icon} name="edit" /></td></tr>`)}</tbody>
      </table></div>
      <p class="muted small center">${q ? tr(`Top ${list.length} matches`, `${list.length} kết quả phù hợp nhất`) : tr(`Showing 100 of ${fmtNum(all.length)} — search to find any item.`, `Hiện 100 / ${fmtNum(all.length)} — tìm kiếm để thấy mã bất kỳ.`)}</p>`}
    ${edit && html`<${ItemEditor} item=${edit} onClose=${() => setEdit(null)} />`}
    ${imp && html`<${ImportModal} onClose=${() => setImp(false)} />`}
  `;
}
