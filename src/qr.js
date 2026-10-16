// QR code drawing (SVG, crisp at any print size) and label payloads.
//
// Every carton has an ID like  K7Q2M9XD-1-34
//   K7Q2M9XD = the record (slip / shipment) it was created in
//   1        = line number inside that record (never reused, so edits don't shift labels)
//   34       = carton number on that line
//
// The QR can carry that ID in three ways (Settings → Labels). The scanner understands all three,
// so labels printed in different modes still work together.
//   link — https://…/#/c/K7Q2M9XD-1-34   (any phone camera opens the record)    ← default
//   id   — ILP:K7Q2M9XD-1-34              (shortest code, needs this app to look up)
//   data — ID + item details separated by TABs (a USB scanner gun types it across Excel columns)

import { APP_URL } from './config.js';
import { isLocalHost } from './util.js';

const ID_RE = /([0-9A-HJKMNP-TV-Z]{8})-(\d{1,3})-(\d{1,4})/;
const REC_RE = /#\/r\/([0-9A-HJKMNP-TV-Z]{8})\b/;

export function appBaseUrl() {
  if (!isLocalHost() && location.protocol.startsWith('http')) return location.origin + location.pathname;
  return APP_URL;
}

export function cartonPayload(carton, mode = 'link') {
  if (mode === 'id') return `ILP:${carton.id}`;
  if (mode === 'data') {
    return [carton.id, carton.code, carton.ref, carton.qty, carton.unit, carton.docNo, carton.extraRef || '', carton.date, `${carton.n}/${carton.of}`].join('\t');
  }
  return `${appBaseUrl()}#/c/${carton.id}`;
}

export const recordPayload = (rec) => `${appBaseUrl()}#/r/${rec.id}`;

// Accepts anything a scanner can produce and returns { cartonId } or { recordId } or null.
export function parseScan(text) {
  const s = String(text || '').trim().toUpperCase();
  if (!s) return null;
  const m = s.match(ID_RE);
  if (m) return { cartonId: `${m[1]}-${Number(m[2])}-${Number(m[3])}`, recordId: m[1], line: Number(m[2]), seq: Number(m[3]) };
  const r = String(text).match(REC_RE);
  if (r) return { recordId: r[1].toUpperCase() };
  return null;
}

// Returns an SVG string. Uses the qrcode-generator library loaded in index.html.
export function qrSvg(text, { ecc = 'M', margin = 0 } = {}) {
  const qr = window.qrcode(0, ecc);
  qr.addData(unescape(encodeURIComponent(text)), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" class="qr"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
