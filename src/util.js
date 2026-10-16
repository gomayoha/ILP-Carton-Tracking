// Small shared helpers: ids, dates, numbers, text search, files.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)

export function newId(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += B32[b % 32];
  return s;
}

export const pad = (n, w) => String(n).padStart(w, '0');

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

// Vietnam uses day/month/year everywhere (paper forms, packing lists).
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

export function fmtDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
}

export function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function fmtNum(n, dp = 0) {
  if (n === null || n === undefined || n === '' || !isFinite(n)) return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// Up to `dp` decimals, no trailing zeros (8.95, 9.4, 12).
export function fmtDec(n, dp = 3) {
  if (n === null || n === undefined || n === '' || !isFinite(n)) return '';
  return Number(round(Number(n), dp)).toLocaleString('en-US', { maximumFractionDigits: dp });
}

// "0001955" → "0001956", "IDE0004000" → "IDE0004001", "POVN-2600087" → "POVN-2600088".
export function incrementDocNo(s) {
  const m = String(s || '').match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return '';
  const next = String(BigInt(m[2]) + 1n).padStart(m[2].length, '0');
  return m[1] + next + m[3];
}

// Lower-case, strip Vietnamese diacritics, collapse spaces — for forgiving search.
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/ /g, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function clean(s) {
  return String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function downloadFile(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCSV(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Vietnamese text correctly.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function toTSV(rows) {
  return rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '))).join('\t')).join('\r\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

export const go = (path) => { location.hash = path; };

export const isLocalHost = () => /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/.test(location.hostname);
