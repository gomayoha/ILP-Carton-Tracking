// Reads the text of a PDF in the browser (pdf.js, vendored; loaded only when a PDF is opened)
// and turns it into table rows for packingListLines(). Scanned PDFs (pictures, no text) give nothing.

import { textToLines, linesToTable } from './model.js';

let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import('../vendor/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return lib;
}

export async function pdfTable(file) {
  const L = await pdfjs();
  const doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, , d, x, y] = it.transform;
      items.push({ s: it.str, x, y, w: it.width || 0, h: Math.hypot(b, d) || Math.abs(a) || it.height || 8, page: p });
    }
  }
  await doc.destroy();
  return { ...linesToTable(textToLines(items)), hasText: items.length > 0 };
}
