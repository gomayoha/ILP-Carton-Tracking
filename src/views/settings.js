// Settings: this device (printer/labels) and shared settings (warehouses, numbering, defaults).

import { html, useState } from '../../vendor/preact-htm.js';
import { tr, getLang, setLang } from '../i18n.js';
import { useStore, saveDevice, saveSettings, toast, signOut, resetDemo, DEFAULT_SETTINGS } from '../store.js';
import { Icon, Btn, PageHead, Field, Input, Select, Confirm, Chip, WhSelect } from '../components.js';
import { LABEL_PRESETS, printLabels } from '../print.js';
import { FIREBASE_CONFIG, REQUIRE_LOGIN, APP_VERSION } from '../config.js';
import { appBaseUrl } from '../qr.js';
import { typeName } from '../model.js';

const SAMPLE_REC = { id: 'TEST0000', type: 'handoff', docNo: '0000000', date: new Date().toISOString().slice(0, 10), fromWh: 'PRO', toWh: 'PRINT' };
const SAMPLE_CARTON = { id: 'TEST0000-1-1', n: 1, of: 1, code: 'ILPDIM13033191', ref: '9090070468', desc: 'Printed hanger collar', qty: 900, unit: 'piece', wo: '10131', isPartial: false };

function Warehouses({ settings }) {
  const [list, setList] = useState(structuredClone(settings.warehouses || []));
  const [dirty, setDirty] = useState(false);
  const upd = (i, patch) => { setList((l) => l.map((w, j) => (j === i ? { ...w, ...patch } : w))); setDirty(true); };
  const add = () => { setList((l) => [...l, { code: '', name: '', vi: '', short: '', layout: 'print' }]); setDirty(true); };
  const remove = (i) => { setList((l) => l.filter((_, j) => j !== i)); setDirty(true); };
  const save = () => {
    const clean = list.map((w) => ({ ...w, code: String(w.code || '').trim().toUpperCase() })).filter((w) => w.code);
    if (new Set(clean.map((w) => w.code)).size !== clean.length) return toast(tr('Two warehouses have the same code.', 'Có hai kho trùng mã.'), 'bad');
    saveSettings({ warehouses: clean });
    setDirty(false);
    toast(tr('Warehouses saved for everyone.', 'Đã lưu danh sách kho cho mọi người.'));
  };
  return html`<div class="table-wrap"><table class="data edit">
      <thead><tr><th>${tr('Code', 'Mã')}</th><th>${tr('Name (English)', 'Tên (tiếng Anh)')}</th><th>${tr('Name (Vietnamese)', 'Tên (tiếng Việt)')}</th><th>${tr('Word used in Excel', 'Từ dùng trong Excel')}</th><th>${tr('Stock sheet layout', 'Mẫu sheet stock')}</th><th></th></tr></thead>
      <tbody>${list.map((w, i) => html`<tr>
        <td><${Input} value=${w.code} onInput=${(v) => upd(i, { code: v })} cls="mono short" /></td>
        <td><${Input} value=${w.name} onInput=${(v) => upd(i, { name: v })} /></td>
        <td><${Input} value=${w.vi} onInput=${(v) => upd(i, { vi: v })} /></td>
        <td><${Input} value=${w.short} onInput=${(v) => upd(i, { short: v })} placeholder="pack" /></td>
        <td><${Select} value=${w.layout} onChange=${(v) => upd(i, { layout: v })} options=${[{ value: 'print', label: 'PRINT (SKU, Customer ref…)' }, { value: 'trading', label: 'In-out detail (Packing no…)' }]} /></td>
        <td><button class="icon-btn" aria-label=${tr('Remove', 'Xóa')} onClick=${() => remove(i)}><${Icon} name="trash" /></button></td>
      </tr>`)}</tbody>
    </table></div>
    <p class="muted small">${tr('"Word used in Excel" fills the Shipping Docs column, e.g. "transfer to pack" / "transfer from print".', '"Từ dùng trong Excel" điền vào cột Shipping Docs, VD: "transfer to pack" / "transfer from print".')}</p>
    <div class="row-actions"><${Btn} small icon="plus" onClick=${add}>${tr('Add warehouse', 'Thêm kho')}</${Btn}>${dirty && html`<${Btn} small kind="primary" onClick=${save}>${tr('Save warehouses', 'Lưu danh sách kho')}</${Btn}>`}</div>`;
}

function SharedDefaults({ settings }) {
  const [seeds, setSeeds] = useState({ ...DEFAULT_SETTINGS.seeds, ...(settings.seeds || {}) });
  const [defs, setDefs] = useState(structuredClone({ ...DEFAULT_SETTINGS.defaults, ...(settings.defaults || {}) }));
  const [mark, setMark] = useState(settings.shippingMark || 'IDEA L PACK');
  const [origin, setOrigin] = useState(settings.origin || 'VIETNAM');
  const wh = settings.warehouses;
  const setDef = (type, k, v) => setDefs((d) => ({ ...d, [type]: { ...d[type], [k]: v } }));
  const save = () => { saveSettings({ seeds, defaults: defs, shippingMark: mark, origin }); toast(tr('Saved for everyone.', 'Đã lưu cho mọi người.')); };
  return html`
    <div class="settings-grid">
      ${['handoff', 'transfer', 'shipment'].map((t) => html`<div class="mini-card">
        <h5>${typeName(t)}</h5>
        <${Field} label=${tr('Last number used', 'Số cuối đã dùng')} hint=${tr('The app suggests the next one', 'Ứng dụng gợi ý số tiếp theo')}><${Input} value=${seeds[t]} onInput=${(v) => setSeeds({ ...seeds, [t]: v })} cls="mono" /></${Field}>
        <${Field} label=${tr('Default from', 'Mặc định từ')}><${WhSelect} value=${defs[t]?.fromWh || ''} onChange=${(v) => setDef(t, 'fromWh', v)} warehouses=${wh} allowEmpty /></${Field}>
        ${t !== 'shipment' && html`<${Field} label=${tr('Default to', 'Mặc định đến')}><${WhSelect} value=${defs[t]?.toWh || ''} onChange=${(v) => setDef(t, 'toWh', v)} warehouses=${wh} allowEmpty /></${Field}>`}
      </div>`)}
    </div>
    <div class="form-grid">
      <${Field} label=${tr('Shipping mark (packing list)', 'Ký hiệu hàng (packing list)')}><${Input} value=${mark} onInput=${setMark} /></${Field}>
      <${Field} label=${tr('Country of origin', 'Xuất xứ')}><${Input} value=${origin} onInput=${setOrigin} /></${Field}>
    </div>
    <div class="row-actions"><${Btn} kind="primary" small onClick=${save}>${tr('Save defaults', 'Lưu mặc định')}</${Btn}></div>`;
}

export function SettingsPage() {
  const s = useStore();
  const d = s.device;
  const [confirmReset, setConfirmReset] = useState(false);
  const presetOpts = Object.entries(LABEL_PRESETS).map(([k, p]) => ({ value: k, label: tr(p.en, p.vi) }));

  return html`
    <${PageHead} eyebrow=${tr('Settings', 'Cài đặt')} title=${tr('Settings', 'Cài đặt')} />

    <section class="card block-card">
      <div class="block-title"><h3>${tr('This device · labels & printer', 'Thiết bị này · nhãn & máy in')}</h3><${Chip} kind="info">${tr('Only this device', 'Chỉ thiết bị này')}</${Chip}></div>
      <div class="form-grid">
        <${Field} label=${tr('Label size', 'Khổ nhãn')} hint=${tr('Choose the label stock loaded in this printer.', 'Chọn loại nhãn đang lắp trong máy in này.')}>
          <${Select} value=${d.labelPreset} onChange=${(v) => saveDevice({ labelPreset: v })} options=${presetOpts} />
        </${Field}>
        <${Field} label=${tr('What the QR code holds', 'Nội dung mã QR')}>
          <${Select} value=${d.qrMode} onChange=${(v) => saveDevice({ qrMode: v })} options=${[
            { value: 'link', label: tr('Link — any phone camera opens the carton (recommended)', 'Đường link — camera điện thoại nào cũng mở được (khuyên dùng)') },
            { value: 'id', label: tr('Carton ID only — smallest code', 'Chỉ mã thùng — mã nhỏ nhất') },
            { value: 'data', label: tr('Data for scanner gun → Excel columns', 'Dữ liệu cho súng quét → cột Excel') }]} />
        </${Field}>
        <${Field} label=${tr('Device name (optional)', 'Tên thiết bị (tùy chọn)')} hint=${tr('Shown in record history, e.g. "Print WH PC".', 'Hiện trong lịch sử chứng từ, VD: "Máy tính kho Print".')}>
          <${Input} value=${d.deviceName} onInput=${(v) => saveDevice({ deviceName: v })} />
        </${Field}>
        <div class="field checks">
          <label class="check"><input type="checkbox" checked=${d.showLogo} onChange=${(e) => saveDevice({ showLogo: e.target.checked })} /> ${tr('Print the logo on labels', 'In logo trên nhãn')}</label>
          <label class="check"><input type="checkbox" checked=${d.beep} onChange=${(e) => saveDevice({ beep: e.target.checked })} /> ${tr('Beep when scanning', 'Phát tiếng bíp khi quét')}</label>
        </div>
      </div>
      <div class="row-actions"><${Btn} icon="printer" onClick=${() => printLabels(SAMPLE_REC, [SAMPLE_CARTON], d)}>${tr('Print a test label', 'In thử một nhãn')}</${Btn}>
        <span class="muted small">${tr('In the print dialog choose your label printer, set margins to "None" and scale to 100%.', 'Trong hộp thoại in, chọn máy in nhãn, lề "Không" và tỷ lệ 100%.')}</span></div>
      <p class="muted small">${tr('QR links point to', 'Link trong QR trỏ tới')}: <span class="mono">${appBaseUrl()}</span></p>
    </section>

    <section class="card block-card">
      <div class="block-title"><h3>${tr('Language', 'Ngôn ngữ')}</h3></div>
      <div class="segmented"><button aria-pressed=${getLang() === 'vi'} onClick=${() => setLang('vi')}>Tiếng Việt</button><button aria-pressed=${getLang() === 'en'} onClick=${() => setLang('en')}>English</button></div>
      <p class="muted small">${tr('Printed slips and labels always show both languages, like the paper forms.', 'Phiếu và nhãn in ra luôn có cả hai ngôn ngữ, giống mẫu giấy.')}</p>
    </section>

    <section class="card block-card">
      <div class="block-title"><h3>${tr('Warehouses', 'Danh sách kho')}</h3><${Chip} kind="warn">${tr('Shared with everyone', 'Dùng chung cho mọi người')}</${Chip}></div>
      <${Warehouses} key=${JSON.stringify(s.settings.warehouses)} settings=${s.settings} />
    </section>

    <section class="card block-card">
      <div class="block-title"><h3>${tr('Numbering & defaults', 'Đánh số & mặc định')}</h3><${Chip} kind="warn">${tr('Shared with everyone', 'Dùng chung cho mọi người')}</${Chip}></div>
      <${SharedDefaults} key=${JSON.stringify([s.settings.seeds, s.settings.defaults])} settings=${s.settings} />
    </section>

    <section class="card block-card">
      <div class="block-title"><h3>${tr('Connection', 'Kết nối')}</h3></div>
      <dl class="kv">
        <div><dt>${tr('Mode', 'Chế độ')}</dt><dd>${s.mode === 'cloud' ? tr('Shared database (Firebase)', 'Cơ sở dữ liệu dùng chung (Firebase)') : tr('Demo — this browser only', 'Thử — chỉ trình duyệt này')}</dd></div>
        ${FIREBASE_CONFIG && html`<div><dt>${tr('Project', 'Dự án')}</dt><dd class="mono">${FIREBASE_CONFIG.projectId}</dd></div>`}
        <div><dt>${tr('Network', 'Mạng')}</dt><dd>${s.sync.online ? tr('Online', 'Có mạng') : tr('Offline — changes are kept and sent later', 'Mất mạng — thay đổi được giữ lại và gửi sau')}</dd></div>
        ${s.mode === 'cloud' && html`<div><dt>${tr('Waiting to sync', 'Chờ đồng bộ')}</dt><dd>${s.sync.pending || 0}</dd></div>`}
        <div><dt>${tr('Login', 'Đăng nhập')}</dt><dd>${REQUIRE_LOGIN ? (s.user ? s.user.email : '—') : tr('Off — anyone with the link can use it', 'Tắt — ai có link đều dùng được')}</dd></div>
        <div><dt>${tr('Records on this device', 'Chứng từ trên thiết bị')}</dt><dd>${s.records.size}</dd></div>
        <div><dt>${tr('Version', 'Phiên bản')}</dt><dd>${APP_VERSION}</dd></div>
      </dl>
      <div class="row-actions">
        ${REQUIRE_LOGIN && s.user && html`<${Btn} icon="logout" onClick=${signOut}>${tr('Sign out', 'Đăng xuất')}</${Btn}>`}
        ${s.mode === 'local' && html`<${Btn} kind="danger-ghost" icon="trash" onClick=${() => setConfirmReset(true)}>${tr('Clear demo data', 'Xóa dữ liệu thử')}</${Btn}>`}
      </div>
    </section>
    ${confirmReset && html`<${Confirm} title=${tr('Clear all demo data?', 'Xóa toàn bộ dữ liệu thử?')} danger confirmLabel=${tr('Clear demo data', 'Xóa dữ liệu thử')}
      message=${tr('This removes the demo records, items and settings saved in this browser. It cannot be undone. (It does not touch any shared database.)', 'Thao tác này xóa chứng từ, mã hàng và cài đặt thử lưu trên trình duyệt này, không thể hoàn tác. (Không ảnh hưởng cơ sở dữ liệu dùng chung.)')}
      onConfirm=${resetDemo} onClose=${() => setConfirmReset(false)} />`}
  `;
}
