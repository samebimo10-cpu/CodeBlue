// "Scan look": turns finished pages into pictures that look like they came off a
// document scanner: grey or black-and-white toner, off-white paper, a slight tilt,
// soft focus, grain, specks of dust, a shadow along one edge and JPEG compression.
import { PDFDocument } from 'pdf-lib';
import { loadPdf, renderPage } from '../lib/pdfjs';
import { canvasToBlob, makeCanvas, mulberry32 } from '../lib/util';

export interface ScanOptions {
  mode: 'colour' | 'grey' | 'bw';
  /** 0..1 */
  tilt: number;
  noise: number;
  blur: number;
  dust: number;
  shadow: number;
  /** paper tone 0 = pure white, 1 = old cream paper */
  paper: number;
  dpi: 150 | 200 | 300;
  seed: number;
}

export const defaultScan = (): ScanOptions => ({
  mode: 'grey', tilt: 0.5, noise: 0.4, blur: 0.4, dust: 0.3, shadow: 0.3, paper: 0.3, dpi: 200, seed: 1,
});

/** Applies the scanner effects to a rendered page; returns a new canvas the same size. */
export function applyScanLook(src: HTMLCanvasElement, o: ScanOptions, pageSeed: number): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const rand = mulberry32(o.seed * 1009 + pageSeed * 31 + 7);
  const k = W / 1000; // effect sizes relative to the page width

  // 1. soft focus: scanners are never razor sharp
  let work = src;
  if (o.blur > 0) {
    const f = 1 - o.blur * 0.45;
    const small = makeCanvas(W * f, H * f);
    const sc = small.getContext('2d')!;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(src, 0, 0, small.width, small.height);
    work = makeCanvas(W, H);
    const wc = work.getContext('2d')!;
    wc.imageSmoothingQuality = 'high';
    wc.drawImage(small, 0, 0, W, H);
  }

  // 2. slightly crooked placement on the glass
  const out = makeCanvas(W, H);
  const c = out.getContext('2d')!;
  const paper = [255 - o.paper * 12, 255 - o.paper * 16, 255 - o.paper * 34];
  c.fillStyle = `rgb(${paper[0]},${paper[1]},${paper[2]})`;
  c.fillRect(0, 0, W, H);
  const angle = (rand() - 0.5) * 2 * o.tilt * (1.3 * Math.PI / 180);
  c.save();
  c.translate(W / 2 + (rand() - 0.5) * o.tilt * 14 * k, H / 2 + (rand() - 0.5) * o.tilt * 14 * k);
  c.rotate(angle);
  c.drawImage(work, -W / 2, -H / 2);
  c.restore();

  // 3. toner, paper tone, uneven lamp light, grain
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const lightDir = rand() < 0.5 ? 1 : -1;
  for (let y = 0; y < H; y++) {
    const light = 1 - o.paper * 0.05 * (lightDir > 0 ? y / H : 1 - y / H);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (o.mode !== 'colour') {
        let l = 0.299 * r + 0.587 * g + 0.114 * b;
        if (o.mode === 'bw') l = l < 150 ? Math.max(0, l * 0.55 - 10) : Math.min(255, 150 + (l - 150) * 1.6);
        else l = 255 * Math.pow(l / 255, 1.15); // toner is a little heavier than ink
        r = g = b = l;
      } else {
        // colour scanners wash colours out slightly
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * 0.85; g = l + (g - l) * 0.85; b = l + (b - l) * 0.85;
      }
      // white areas take the paper colour; ink stays dark
      const t = Math.min(r, g, b) / 255;
      r = r * (1 - t) + paper[0] * t * (r / 255);
      g = g * (1 - t) + paper[1] * t * (g / 255);
      b = b * (1 - t) + paper[2] * t * (b / 255);
      const n = (rand() - 0.5) * o.noise * 34;
      d[i] = Math.max(0, Math.min(255, r * light + n));
      d[i + 1] = Math.max(0, Math.min(255, g * light + n));
      d[i + 2] = Math.max(0, Math.min(255, b * light + n));
    }
  }
  c.putImageData(img, 0, 0);

  // 4. dust and hairs on the glass
  const specks = Math.round(o.dust * 60);
  for (let i = 0; i < specks; i++) {
    c.fillStyle = `rgba(40,40,40,${0.25 + rand() * 0.5})`;
    const x = rand() * W, y = rand() * H;
    if (rand() < 0.85) {
      c.beginPath();
      c.arc(x, y, (0.4 + rand() * 1.4) * k, 0, Math.PI * 2);
      c.fill();
    } else {
      c.strokeStyle = `rgba(60,60,60,${0.2 + rand() * 0.3})`;
      c.lineWidth = 0.6 * k;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + (rand() - 0.5) * 30 * k, y + (rand() - 0.5) * 30 * k, x + (rand() - 0.5) * 40 * k, y + (rand() - 0.5) * 40 * k);
      c.stroke();
    }
  }

  // 5. shadow where the lid didn't close flat
  if (o.shadow > 0) {
    const side = Math.floor(rand() * 4);
    const len = (side % 2 === 0 ? W : H) * 0.035 * (0.5 + o.shadow);
    const g = side === 0 ? c.createLinearGradient(0, 0, len, 0)
      : side === 1 ? c.createLinearGradient(0, 0, 0, len)
      : side === 2 ? c.createLinearGradient(W, 0, W - len, 0)
      : c.createLinearGradient(0, H, 0, H - len);
    g.addColorStop(0, `rgba(0,0,0,${0.35 * o.shadow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  return out;
}

/** Re-renders a finished PDF as a scanned-looking PDF (one image per page). */
export async function makeScannedPdf(bytes: Uint8Array, o: ScanOptions, onProgress?: (i: number, n: number) => void) {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  out.setProducer('InkDesk PDF');
  out.setCreator('InkDesk PDF');
  try {
    for (let i = 1; i <= src.numPages; i++) {
      onProgress?.(i, src.numPages);
      const page = await src.getPage(i);
      const vp = page.getViewport({ scale: 1, rotation: page.rotate });
      const { canvas } = await renderPage(page, o.dpi / 72, 0, 30_000_000);
      const scanned = applyScanLook(canvas, o, i);
      const jpg = await out.embedJpg(new Uint8Array(await (await canvasToBlob(scanned, 'image/jpeg', 0.72)).arrayBuffer()));
      out.addPage([vp.width, vp.height]).drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    void src.destroy();
  }
  return out.save();
}
