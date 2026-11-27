// Reads photos and scanned PDFs inside the browser (Tesseract.js, vendored in vendor/ocr; nothing is sent
// online — Ms Ly, 26 Nov 2026: no online AI). The words found, with their positions, go through the same
// textToLines → linesToTable steps as a text PDF, so the same column rules apply.
// Loaded only when someone reads a photo (about 8 MB the first time, then cached by the browser).

import { textToLines, linesToTable } from './model.js';
import { loadScript } from './util.js';

const BASE = new URL('../vendor/ocr/', import.meta.url).href;
let workerP = null;
let onProgress = null;

function worker() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      const w = await window.Tesseract.createWorker(['eng', 'vie'], 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE, // the worker picks the fast (SIMD) or the older-phone engine file from this folder
        langPath: BASE.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        logger: (m) => onProgress && onProgress(m),
      });
      // "Sparse text" mode: finds words inside bordered tables, which the default page mode skips
      // (tested on real delivery-note photos, 26 Nov 2026: every ILP code read correctly).
      await w.setParameters({ tessedit_pageseg_mode: '11' });
      return w;
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

// Big phone photos are slow to read and no more accurate: keep the long side at most 2400 px.
async function toCanvas(source, clean) {
  const bmp = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (bmp instanceof HTMLCanvasElement && scale === 1 && !clean) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (clean) evenLight(c);
  return c;
}

// Photos taken on the floor are lit unevenly (one side darker, a shadow from the phone). The reader
// then loses the text on the dark side. Divide every pixel by the local paper brightness, so the
// paper is white everywhere and the text stays dark. The paper brightness is the photo shrunk to a
// small size and stretched back (a strong blur that works in every browser).
function evenLight(c) {
  const W = c.width, H = c.height, g = c.getContext('2d', { willReadFrequently: true });
  const sw = Math.max(8, Math.round(W / 40)), sh = Math.max(8, Math.round(H / 40));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const sg = small.getContext('2d');
  // Shrink in steps so dark text averages out instead of being skipped.
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, 0, 0, sw, sh);
  // Paper is the brightest thing around: take the max of each small pixel's neighbours so text strokes don't darken it.
  const sd = sg.getImageData(0, 0, sw, sh), sp = sd.data, mx = new Uint8ClampedArray(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(sw - 1, Math.max(0, x + dx)), yy = Math.min(sh - 1, Math.max(0, y + dy)), k = (yy * sw + xx) * 4;
      m = Math.max(m, (sp[k] * 3 + sp[k + 1] * 6 + sp[k + 2]) / 10);
    }
    mx[y * sw + x] = m;
  }
  for (let i = 0; i < mx.length; i++) { sp[i * 4] = sp[i * 4 + 1] = sp[i * 4 + 2] = mx[i]; sp[i * 4 + 3] = 255; }
  sg.putImageData(sd, 0, 0);
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  const bgc = bg.getContext('2d', { willReadFrequently: true });
  bgc.imageSmoothingQuality = 'high';
  bgc.drawImage(small, 0, 0, W, H);
  const b = bgc.getImageData(0, 0, W, H).data, im = g.getImageData(0, 0, W, H), p = im.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = (p[i] * 3 + p[i + 1] * 6 + p[i + 2]) / 10, paper = Math.max(40, b[i]);
    const o = Math.min(255, (v / paper) * 255);
    p[i] = p[i + 1] = p[i + 2] = o;
  }
  dropLines(p, W, H);
  g.putImageData(im, 0, 0);
}

// Table borders: numbers are often written right against a cell border, and on a tilted photo the
// reader takes the border as part of the number ("1.000|" → junk). Long straight dark runs are
// borders, never letters, so paint them white before reading.
function dropLines(p, W, H) {
  const dark = (i) => p[i * 4] < 170;
  const kill = new Uint8Array(W * H);
  const minX = Math.max(60, Math.round(W / 30)), minY = Math.max(60, Math.round(H / 18));
  for (let y = 0; y < H; y++) {
    let s = -1;
    for (let x = 0; x <= W; x++) {
      const d = x < W && dark(y * W + x);
      if (d && s < 0) s = x;
      if (!d && s >= 0) { if (x - s >= minX) for (let k = s; k < x; k++) kill[y * W + k] = 1; s = -1; }
    }
  }
  for (let x = 0; x < W; x++) {
    let s = -1;
    for (let y = 0; y <= H; y++) {
      const d = y < H && dark(y * W + x);
      if (d && s < 0) s = y;
      if (!d && s >= 0) { if (y - s >= minY) for (let k = s; k < y; k++) kill[k * W + x] = 1; s = -1; }
    }
  }
  // Also the soft edge pixels right next to a removed line.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (kill[i] === 1) for (const j of [i - 1, i + 1, i - W, i + W]) if (!kill[j] && p[j * 4] < 230) kill[j] = 2;
  }
  for (let i = 0; i < kill.length; i++) if (kill[i]) p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = 255;
}

function linesOf(data) {
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) out.push(l);
  return out;
}

function wordsOf(data) {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  return linesOf(data).flatMap((l) => l.words || []);
}

// Phone photos are rarely straight: the text lines slope. Take the median slope of the longer
// text lines and turn every word back by that angle, so one table row lines up again.
function skewAngle(data) {
  const a = linesOf(data)
    .map((l) => l.baseline || l.bbox && { x0: l.bbox.x0, y0: l.bbox.y1, x1: l.bbox.x1, y1: l.bbox.y1 })
    .filter((b) => b && b.x1 - b.x0 > 120)
    .map((b) => Math.atan2(b.y1 - b.y0, b.x1 - b.x0))
    .filter((r) => Math.abs(r) < 0.35)
    .sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

// images: File / Blob / canvas[]; progress(0..1, label) is called while reading.
// clean: even the light and remove table borders first. Used only as a second try when the normal
// reading missed a quantity (excel.js), because on most photos the normal reading is already right.
export async function ocrTable(images, progress, { clean = false } = {}) {
  const w = await worker();
  const items = [], itemsRows = [];
  for (let i = 0; i < images.length; i++) {
    onProgress = (m) => { if (progress && m.status === 'recognizing text') progress((i + m.progress) / images.length, i + 1, images.length); };
    const canvas = await toCanvas(images[i], clean);
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: true });
    const ang = skewAngle(data), cos = Math.cos(-ang), sin = Math.sin(-ang);
    const first = wordsOf(data);
    let words = first;
    // The whole-page pass misses a lone digit in a table cell ("2", "5"). Re-read each item row
    // as one line of text and use those words for that row instead.
    const codeWords = words.filter((x) => /ILP[A-Z0-9]{6,}/i.test(x.text || ''));
    if (codeWords.length) {
      await w.setParameters({ tessedit_pageseg_mode: '7' });
      try {
        for (const cw of codeWords.slice(0, 40)) {
          const h = cw.bbox.y1 - cw.bbox.y0, cy = (cw.bbox.y0 + cw.bbox.y1) / 2;
          const top = Math.max(0, Math.round(cy - h * 1.3)), height = Math.min(canvas.height - top, Math.round(h * 2.6));
          // Crop the row into its own image (the library's "rectangle" option reads table borders as text).
          const strip = document.createElement('canvas');
          strip.width = canvas.width; strip.height = height;
          const sg = strip.getContext('2d');
          sg.fillStyle = '#fff'; sg.fillRect(0, 0, strip.width, strip.height);
          sg.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
          const r = await w.recognize(strip, {}, { blocks: true });
          const row = wordsOf(r.data)
            .map((x) => ({ ...x, bbox: { x0: x.bbox.x0, x1: x.bbox.x1, y0: x.bbox.y0 + top, y1: x.bbox.y1 + top } }))
            .filter((x) => String(x.text || '').replace(/[|[\]{}]/g, '').trim() && Math.abs((x.bbox.y0 + x.bbox.y1) / 2 - cy) < h * 0.9);
          if (!row.some((x) => /ILP[A-Z0-9]{6,}/i.test(x.text || ''))) continue; // keep the first reading if this one lost the code
          words = words.filter((x) => Math.abs((x.bbox.y0 + x.bbox.y1) / 2 - cy) >= h * 0.9).concat(row);
        }
      } finally { await w.setParameters({ tessedit_pageseg_mode: '11' }); }
    }
    const add = (list, out) => {
      for (const wd of list) {
        const t = String(wd.text || '').trim().replace(/^[|[\]{}]+|[|[\]{}]+$/g, '');
        if (!t || (wd.confidence !== undefined && wd.confidence < 20)) continue;
        const b = wd.bbox;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const rx = cx * cos - cy * sin, ry = cx * sin + cy * cos; // word centre, turned straight
        const wdt = b.x1 - b.x0, hgt = b.y1 - b.y0;
        // Image y grows downward; the line rules expect PDF-style y (upward), so flip it.
        out.push({ s: t, x: rx - wdt / 2, y: -ry, w: wdt, h: hgt, page: i + 1 });
      }
    };
    add(first, items);
    add(words, itemsRows);
  }
  onProgress = null;
  // Two readings: the whole page (main), and the same with each item row re-read on its own (rows),
  // which only fills what the main one missed (see excel.js).
  return { ...linesToTable(textToLines(items)), rows2: linesToTable(textToLines(itemsRows)), hasText: items.length > 0,
    retry: clean ? null : () => ocrTable(images, progress, { clean: true }) };
}
