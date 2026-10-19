// The legacy build of pdf.js supports older iOS Safari / Android WebView versions.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assetBase = new URL('./', document.baseURI).href;

export type PDFDoc = pdfjs.PDFDocumentProxy;
export type PDFPage = pdfjs.PDFPageProxy;
export { pdfjs };

export function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDoc> {
  // pdf.js transfers the buffer to its worker, so always give it a copy.
  return pdfjs.getDocument({
    data: bytes.slice(),
    password,
    standardFontDataUrl: assetBase + 'standard_fonts/',
    cMapUrl: assetBase + 'cmaps/',
    cMapPacked: true,
  }).promise;
}

/** Renders a page (with the given extra rotation) into a new canvas. */
export async function renderPage(page: PDFPage, scale: number, rotation = 0, maxPixels = 16_000_000) {
  let viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const px = viewport.width * viewport.height;
  if (px > maxPixels) {
    scale *= Math.sqrt(maxPixels / px);
    viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return { canvas, scale, viewport };
}

export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
  fontSize: number;
  family: 'sans-serif' | 'serif' | 'monospace';
  bold: boolean;
  italic: boolean;
}

/** Bounding boxes (in displayed page points) of every run of real, typed text on the page. */
export async function getTextBoxes(page: PDFPage, rotation = 0): Promise<TextBox[]> {
  const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  const content = await page.getTextContent();
  const boxes: TextBox[] = [];
  for (const item of content.items as any[]) {
    if (!item.str || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    const style = (content.styles as any)[item.fontName] ?? {};
    const ascent = typeof style.ascent === 'number' && style.ascent > 0 ? style.ascent : 0.8;
    const descent = typeof style.descent === 'number' && style.descent < 0 ? style.descent : -0.2;
    const fontH = Math.hypot(c, d) || Math.hypot(a, b);
    const len = Math.hypot(a, b) || 1;
    const ux = a / len, uy = b / len;
    const vlen = Math.hypot(c, d) || 1;
    const vx = c / vlen, vy = d / vlen;
    const width = item.width || fontH * item.str.length * 0.5;
    const pts: number[][] = [];
    for (const s of [0, width]) for (const t of [descent, ascent]) {
      const px = e + ux * s + vx * t * fontH;
      const py = f + uy * s + vy * t * fontH;
      const pt = [px, py];
      pdfjs.Util.applyTransform(pt, viewport.transform); // transforms in place
      pts.push(pt);
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    const fam = String(style.fontFamily || '').toLowerCase();
    const name = String(item.fontName || '').toLowerCase();
    boxes.push({
      x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, str: item.str, fontSize: fontH,
      family: fam.includes('mono') ? 'monospace' : fam.includes('serif') && !fam.includes('sans') ? 'serif' : 'sans-serif',
      bold: /bold|black|heavy/.test(name),
      italic: /italic|oblique/.test(name),
    });
  }
  return boxes;
}
