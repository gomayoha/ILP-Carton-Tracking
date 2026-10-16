// App shell: top bar, navigation, router.

import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import { tr, getLang, setLang, onLang } from './i18n.js';
import { useStore, init, toast } from './store.js';
import { Icon, Toast } from './components.js';
import { Home } from './views/home.js';
import { ScanPage } from './views/scan.js';
import { RecordsPage } from './views/records.js';
import { RecordView } from './views/record-view.js';
import { RecordForm } from './views/record-form.js';
import { ItemsPage } from './views/items.js';
import { SettingsPage } from './views/settings.js';
import { CartonPage } from './views/carton.js';
import { LoginPage } from './views/login.js';

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => { setR(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

function useLang() {
  const [l, setL] = useState(getLang());
  useEffect(() => onLang(setL), []);
  return l;
}

function SyncPill({ s }) {
  if (s.mode === 'local') return html`<span class="sync warn" title=${tr('Data is saved only in this browser until Firebase is connected.', 'Dữ liệu chỉ lưu trên trình duyệt này cho đến khi kết nối Firebase.')}><${Icon} name="info" /><span class="st">${tr('Demo mode', 'Chế độ thử')}</span></span>`;
  const y = s.sync;
  if (y.error === 'permission') return html`<span class="sync bad"><${Icon} name="alert" /><span class="st">${tr('No access', 'Không có quyền')}</span></span>`;
  if (!y.online) return html`<span class="sync warn"><${Icon} name="wifiOff" /><span class="st">${tr('Offline', 'Mất mạng')}</span>${y.pending ? ` · ${y.pending}` : ''}</span>`;
  if (y.pending) return html`<span class="sync warn"><${Icon} name="refresh" cls="spin" /><span class="st">${tr('Syncing', 'Đang đồng bộ')}</span> ${y.pending}</span>`;
  return html`<span class="sync good"><${Icon} name="check" /><span class="st">${tr('Synced', 'Đã đồng bộ')}</span></span>`;
}

const NAV = [
  { key: '', icon: 'home', en: 'Home', vi: 'Trang chủ' },
  { key: 'scan', icon: 'scan', en: 'Scan', vi: 'Quét mã' },
  { key: 'records', icon: 'list', en: 'Records', vi: 'Chứng từ' },
  { key: 'items', icon: 'box', en: 'Items', vi: 'Mã hàng' },
  { key: 'settings', icon: 'settings', en: 'Settings', vi: 'Cài đặt' },
];

function App() {
  const s = useStore();
  const route = useRoute();
  useLang();
  const [newOpen, setNewOpen] = useState(false);

  if (!s.ready) return html`<div class="boot"><img src="assets/img/logo.png" alt="Idea L Pack" /><p>${tr('Loading…', 'Đang tải…')}</p></div>`;
  if (s.needLogin) return html`<${LoginPage} />`;

  const [p0, p1, p2] = route.parts;
  let view;
  if (!p0) view = html`<${Home} />`;
  else if (p0 === 'scan') view = html`<${ScanPage} />`;
  else if (p0 === 'records') view = html`<${RecordsPage} query=${route.query} />`;
  else if (p0 === 'new' && p1) view = html`<${RecordForm} key=${'new-' + p1 + (route.query.copy || '')} type=${p1} copyFrom=${route.query.copy} />`;
  else if (p0 === 'r' && p1 && p2 === 'edit') view = html`<${RecordForm} key=${'edit-' + p1} editId=${p1} />`;
  else if (p0 === 'r' && p1) view = html`<${RecordView} key=${p1} id=${p1} />`;
  else if (p0 === 'c' && p1) view = html`<${CartonPage} key=${p1} cid=${p1} />`;
  else if (p0 === 'items') view = html`<${ItemsPage} />`;
  else if (p0 === 'settings') view = html`<${SettingsPage} />`;
  else view = html`<div class="empty"><h4>${tr('Page not found', 'Không tìm thấy trang')}</h4><p><a href="#/">${tr('Go home', 'Về trang chủ')}</a></p></div>`;

  const active = p0 === 'new' || p0 === 'r' ? 'records' : p0 === 'c' ? 'scan' : (p0 || '');

  return html`
    <a class="skip" href="#main">${tr('Skip to content', 'Bỏ qua đến nội dung')}</a>
    <header class="topbar">
      <a class="brand" href="#/" aria-label="Idea L Pack — Carton Tracking">
        <img src="assets/img/logo.png" alt="Idea L Pack" />
        <span>CARTON TRACKING</span>
      </a>
      <div class="header-right">
        <${SyncPill} s=${s} />
        <div class="lang" role="group" aria-label="Language">
          <button aria-pressed=${getLang() === 'vi'} onClick=${() => setLang('vi')}>VI</button>
          <button aria-pressed=${getLang() === 'en'} onClick=${() => setLang('en')}>EN</button>
        </div>
      </div>
    </header>
    <nav class="tabbar" aria-label=${tr('Main', 'Chính')}>
      <div>
        ${NAV.map((n) => html`<a href=${'#/' + n.key} aria-current=${active === n.key ? 'page' : undefined}><${Icon} name=${n.icon} />${tr(n.en, n.vi)}</a>`)}
        <div class="new-menu">
          <button class="btn primary small" onClick=${() => setNewOpen(!newOpen)} aria-expanded=${newOpen}><${Icon} name="plus" /><span>${tr('New', 'Tạo mới')}</span></button>
          ${newOpen && html`<div class="menu" onClick=${() => setNewOpen(false)}>
            <a href="#/new/handoff"><${Icon} name="inbox" />${tr('Production handoff', 'Giao nhận thành phẩm')}</a>
            <a href="#/new/transfer"><${Icon} name="swap" />${tr('Warehouse transfer', 'Chuyển kho')}</a>
            <a href="#/new/shipment"><${Icon} name="truck" />${tr('Shipment / packing list', 'Xuất hàng / packing list')}</a>
          </div>`}
        </div>
      </div>
    </nav>
    ${s.mode === 'cloud' && s.sync.error === 'permission' && html`<div class="banner bad shell"><${Icon} name="alert" />${tr('The database refused access. Check the Firestore rules (see docs/SETUP.md) or sign in again.', 'Cơ sở dữ liệu từ chối truy cập. Kiểm tra Firestore rules (xem docs/SETUP.md) hoặc đăng nhập lại.')}</div>`}
    <main id="main" class="shell" tabindex="-1">${view}</main>
    <nav class="bottombar" aria-label=${tr('Main', 'Chính')}>
      ${[NAV[0], NAV[2], NAV[1], NAV[3], NAV[4]].map((n) => html`<a href=${'#/' + n.key} class=${n.key === 'scan' ? 'scan-btn' : ''} aria-current=${active === n.key ? 'page' : undefined}><${Icon} name=${n.icon} /><span>${tr(n.en, n.vi)}</span></a>`)}
    </nav>
    <footer class="app-foot shell">
      <span>© ${new Date().getFullYear()} Idea L Pack</span><span>${tr('Carton QR tracking', 'Theo dõi thùng bằng mã QR')}</span><span>INTERNAL USE</span>
    </footer>
    <${Toast} toast=${s.toast} />
  `;
}

render(html`<${App} />`, document.getElementById('app'));
init();

// Offline support: cache the app so it opens without Wi-Fi.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast(tr('A new version is ready — reopen the app to update.', 'Đã có phiên bản mới — mở lại ứng dụng để cập nhật.'), 'ok', 8000);
        }
      });
    });
  }).catch(() => {});
}
