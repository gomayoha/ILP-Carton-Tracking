// Shared UI pieces.

import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { tr } from './i18n.js';
import { searchItems } from './store.js';

// ── Icons (stroke icons, 24×24 grid) ────────────────────────────────────────
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  printer: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01',
  wifiOff: 'M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.2-2.4M16.7 10.7A10 10 0 0 1 19 12.5M2 9a15 15 0 0 1 4.6-3M10.7 5.1A15 15 0 0 1 22 9M12 20h.01',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  x: 'M18 6 6 18M6 6l12 12',
  camera: 'M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2z',
  chevronDown: 'M6 9l6 6 6-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
};

export const Icon = ({ name, size, cls = '' }) => html`<svg class=${'icon ' + cls} viewBox="0 0 24 24" aria-hidden="true" style=${size ? `width:${size}px;height:${size}px` : ''}><path d=${P[name] || ''} /></svg>`;

// ── Basic pieces ────────────────────────────────────────────────────────────

export function Btn({ kind = 'secondary', icon, children, onClick, type = 'button', disabled, small, title, cls = '' }) {
  return html`<button type=${type} class=${`btn ${kind} ${small ? 'small' : ''} ${cls}`} onClick=${onClick} disabled=${disabled} title=${title}>
    ${icon && html`<${Icon} name=${icon} />`}${children && html`<span>${children}</span>`}
  </button>`;
}

export function Field({ label, hint, error, required, children, cls = '' }) {
  return html`<label class=${'field ' + cls}>
    <span class="field-label">${label}${required && html`<b class="req" aria-hidden="true"> *</b>`}</span>
    ${children}
    ${error ? html`<span class="field-error">${error}</span>` : hint && html`<span class="field-hint">${hint}</span>`}
  </label>`;
}

export function Input({ value, onInput, type = 'text', placeholder, inputmode, required, autofocus, list, cls = '', step, min, onBlur, onKeyDown, readOnly }) {
  return html`<input class=${'input ' + cls} type=${type} value=${value ?? ''} placeholder=${placeholder} inputmode=${inputmode}
    required=${required} autofocus=${autofocus} list=${list} step=${step} min=${min} readOnly=${readOnly}
    onInput=${(e) => onInput && onInput(e.target.value)} onBlur=${onBlur} onKeyDown=${onKeyDown} />`;
}

export function NumInput(props) {
  return html`<${Input} ...${props} type="text" inputmode="decimal" cls=${'num ' + (props.cls || '')} />`;
}

export function Select({ value, onChange, options, cls = '' }) {
  return html`<select class=${'input ' + cls} value=${value} onChange=${(e) => onChange(e.target.value)}>
    ${options.map((o) => html`<option value=${o.value} selected=${o.value === value}>${o.label}</option>`)}
  </select>`;
}

export const Chip = ({ kind = 'info', icon, children }) => html`<span class=${'chip ' + kind}>${icon && html`<${Icon} name=${icon} />`}${children}</span>`;

export function PageHead({ eyebrow, title, sub, actions, back }) {
  return html`<div class="page-head">
    <div>
      ${back && html`<a class="back" href=${back}><${Icon} name="arrowLeft" /> ${tr('Back', 'Quay lại')}</a>`}
      ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
      <h1>${title}</h1>
      ${sub && html`<p class="page-sub">${sub}</p>`}
    </div>
    ${actions && html`<div class="page-actions">${actions}</div>`}
  </div>`;
}

export function Empty({ icon = 'inbox', title, children }) {
  return html`<div class="empty"><${Icon} name=${icon} /><h4>${title}</h4>${children && html`<p>${children}</p>`}</div>`;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return html`<div class="modal-back" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${'modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><h3>${title}</h3><button class="icon-btn" onClick=${onClose} aria-label=${tr('Close', 'Đóng')}><${Icon} name="x" /></button></div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div>
  </div>`;
}

export function Confirm({ title, message, confirmLabel, danger, withReason, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return html`<${Modal} title=${title} onClose=${onClose} footer=${html`
    <${Btn} onClick=${onClose}>${tr('Cancel', 'Hủy')}</${Btn}>
    <${Btn} kind=${danger ? 'danger' : 'primary'} disabled=${withReason && !reason.trim()} onClick=${() => { onConfirm(reason.trim()); onClose(); }}>${confirmLabel}</${Btn}>`}>
    <p class="prose">${message}</p>
    ${withReason && html`<${Field} label=${tr('Reason', 'Lý do')} required><${Input} value=${reason} onInput=${setReason} autofocus placeholder=${tr('e.g. wrong quantity, entered twice', 'VD: sai số lượng, nhập trùng')} /></${Field}>`}
  </${Modal}>`;
}

// ── Item picker with autocomplete ───────────────────────────────────────────
// Search by internal code (or just its last digits), customer ref or description.

export function ItemPicker({ value, onPick, onInput, placeholder, autofocus }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef();
  useEffect(() => { setQ(value || ''); }, [value]);
  const results = open ? searchItems(q, 12) : [];
  const pick = (it) => { setQ(it.code); setOpen(false); onPick(it); };
  const key = (e) => {
    if (!open && (e.key === 'ArrowDown')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && results[hi]) { e.preventDefault(); pick(results[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return html`<div class="picker" ref=${ref}>
    <div class="picker-input">
      <${Icon} name="search" />
      <input class="input" value=${q} placeholder=${placeholder || tr('Code, last digits, customer ref or name', 'Mã hàng, số cuối, mã khách hoặc tên')}
        autofocus=${autofocus} autocomplete="off" spellcheck="false"
        onInput=${(e) => { setQ(e.target.value); setOpen(true); setHi(0); onInput && onInput(e.target.value); }}
        onFocus=${() => q && setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 180)} onKeyDown=${key} />
    </div>
    ${open && q && html`<div class="picker-list" role="listbox">
      ${results.length ? results.map((it, i) => html`<button type="button" role="option" class=${'picker-opt ' + (i === hi ? 'hi' : '')} onMouseDown=${(e) => { e.preventDefault(); pick(it); }}>
        <span class="po-code">${it.code}</span><span class="po-ref">${it.ref}</span><span class="po-desc">${it.desc}</span>
      </button>`) : html`<div class="picker-none">${tr('No item found. You can still type the code — it will be added to the item list.', 'Không tìm thấy. Vẫn có thể nhập mã — mã sẽ được thêm vào danh mục.')}</div>`}
    </div>`}
  </div>`;
}

export function WhSelect({ value, onChange, warehouses, allowEmpty }) {
  const opts = (warehouses || []).map((w) => ({ value: w.code, label: tr(w.name, w.vi) }));
  if (allowEmpty) opts.unshift({ value: '', label: '—' });
  return html`<${Select} value=${value} onChange=${onChange} options=${opts} />`;
}

export function Toast({ toast }) {
  if (!toast) return null;
  return html`<div class=${'toast ' + toast.kind} role="status"><${Icon} name=${toast.kind === 'bad' ? 'alert' : 'check'} />${toast.msg}</div>`;
}
