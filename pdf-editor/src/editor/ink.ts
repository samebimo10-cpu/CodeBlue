import { BG, GRAPHIC, HANDWRITTEN, TYPED, bgAt, classify, type Classification, type Raster } from './classify';
import { hexToRgb, makeCanvas } from '../lib/util';
import { cropToInk } from '../handwriting/generate';

export type TakeMode = 'handwritten' | 'typed' | 'ink';

export interface ExtractOptions {
  mode: TakeMode;
  /** null keeps the original ink colour */
  color: string | null;
  /** 0..1, higher keeps fainter strokes */
  strength: number;
}

/**
 * Lifts ink off its paper: returns a transparent PNG-ready canvas holding only
 * the chosen kind of ink, optionally recoloured. Works on photos too because the
 * paper colour is estimated locally (shadows, yellowed paper, uneven light).
 */
export function extractInk(
  img: Raster,
  opts: ExtractOptions,
  rect = { x: 0, y: 0, w: img.width, h: img.height },
  cls?: Classification,
): HTMLCanvasElement {
  const c = cls ?? classify(img, [], { sensitivity: 0.5 + opts.strength * 0.3 });
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const w = Math.min(img.width - x0, Math.ceil(rect.w)), h = Math.min(img.height - y0, Math.ceil(rect.h));
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d')!;
  const res = ctx.createImageData(w, h);
  const tint = opts.color ? hexToRgb(opts.color) : null;
  const want = (l: number) =>
    opts.mode === 'ink' ? l !== BG && l !== GRAPHIC : opts.mode === 'handwritten' ? l === HANDWRITTEN : l === TYPED;
  const range = 150 - opts.strength * 90;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0;
    const i = sy * img.width + sx;
    if (!want(c.labels[i])) continue;
    const p = i * 4;
    const [br, bgc, bb] = bgAt(c, sx, sy);
    const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
    const drop = Math.max(br - r, bgc - g, bb - b, (br + bgc + bb - r - g - b) / 3);
    const a = Math.max(0, Math.min(1, drop / range));
    if (a <= 0.02) continue;
    const q = (y * w + x) * 4;
    if (tint) {
      res.data[q] = tint[0]; res.data[q + 1] = tint[1]; res.data[q + 2] = tint[2];
    } else {
      // undo the blend with the paper to recover the pen colour
      res.data[q] = Math.max(0, Math.min(255, (r - br * (1 - a)) / a));
      res.data[q + 1] = Math.max(0, Math.min(255, (g - bgc * (1 - a)) / a));
      res.data[q + 2] = Math.max(0, Math.min(255, (b - bb * (1 - a)) / a));
    }
    res.data[q + 3] = Math.round(a * 255);
  }
  ctx.putImageData(res, 0, 0);
  return cropToInk(out, 3);
}

export function canvasRaster(c: HTMLCanvasElement): Raster {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
}
