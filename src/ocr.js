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
async function toCanvas(source) {
  const bmp = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (bmp instanceof HTMLCanvasElement && scale === 1) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
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
export async function ocrTable(images, progress) {
  const w = await worker();
  const items = [], itemsRows = [];
  for (let i = 0; i < images.length; i++) {
    onProgress = (m) => { if (progress && m.status === 'recognizing text') progress((i + m.progress) / images.length, i + 1, images.length); };
    const canvas = await toCanvas(images[i]);
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
  return { ...linesToTable(textToLines(items)), rows2: linesToTable(textToLines(itemsRows)), hasText: items.length > 0 };
}
