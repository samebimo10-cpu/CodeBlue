import { describe, expect, it } from 'vitest';
import { BG, GRAPHIC, HANDWRITTEN, TYPED, classify, eraseCircle, type Raster } from '../src/editor/classify';

function blank(w: number, h: number, rgb = [255, 255, 255]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { width: w, height: h, data };
}
function rect(img: Raster, x: number, y: number, w: number, h: number, rgb: number[]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set([...rgb, 255], (yy * img.width + xx) * 4);
}
/** thick stroke along a polyline */
function stroke(img: Raster, pts: [number, number][], r: number, rgb: number[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k++) rect(img, Math.round(x0 + ((x1 - x0) * k) / n) - r, Math.round(y0 + ((y1 - y0) * k) / n) - r, 2 * r + 1, 2 * r + 1, rgb);
  }
}
const labelAt = (c: ReturnType<typeof classify>, x: number, y: number) => c.labels[y * c.width + x];

describe('ink classifier', () => {
  // A line of "typed" glyphs: 12 small boxes on a common baseline, plus a big scribble.
  const img = blank(400, 200);
  for (let i = 0; i < 12; i++) rect(img, 20 + i * 14, 30, 8, 12, [20, 20, 20]);
  stroke(img, [[40, 120], [80, 80], [120, 160], [170, 90], [230, 170], [300, 100]], 2, [30, 30, 30]);
  rect(img, 10, 190, 380, 2, [0, 0, 0]); // ruled line
  const cls = classify(img, []);

  it('labels aligned small glyphs as typed', () => {
    expect(labelAt(cls, 24, 36)).toBe(TYPED);
    expect(labelAt(cls, 20 + 11 * 14 + 4, 36)).toBe(TYPED);
  });
  it('labels a large irregular stroke as handwriting', () => {
    expect(labelAt(cls, 80, 80)).toBe(HANDWRITTEN);
  });
  it('labels long rules as graphics and paper as background', () => {
    expect(labelAt(cls, 200, 190)).toBe(GRAPHIC);
    expect(labelAt(cls, 350, 20)).toBe(BG);
  });
  it('treats real PDF text boxes as typed even when large', () => {
    // a big bold "O" outline, far larger than any other glyph on the page
    const big = blank(200, 100);
    rect(big, 20, 20, 60, 6, [0, 0, 0]); rect(big, 20, 64, 60, 6, [0, 0, 0]);
    rect(big, 20, 20, 6, 50, [0, 0, 0]); rect(big, 74, 20, 6, 50, [0, 0, 0]);
    const c = classify(big, [{ x: 18, y: 18, w: 66, h: 56 }]);
    expect(labelAt(c, 22, 40)).toBe(TYPED);
    expect(classify(big, []).labels[40 * 200 + 22]).toBe(HANDWRITTEN);
  });
  it('treats blue ink as handwriting', () => {
    const b = blank(200, 100);
    for (let i = 0; i < 6; i++) rect(b, 20 + i * 14, 30, 8, 12, [25, 50, 190]);
    const c = classify(b, [], { colouredIsHandwriting: true });
    expect(labelAt(c, 24, 36)).toBe(HANDWRITTEN);
  });
  it('handwriting eraser leaves typed pixels untouched', () => {
    const mask = { width: 400, height: 200, data: new Uint8ClampedArray(400 * 200 * 4) };
    eraseCircle(cls, mask, 60, 60, 80, 'handwritten');
    const alpha = (x: number, y: number) => mask.data[(y * 400 + x) * 4 + 3];
    expect(alpha(80, 80)).toBe(255); // scribble painted over
    expect(alpha(24, 36)).toBe(0); // typed glyph kept
    expect(alpha(130, 20)).toBe(0); // paper untouched
    const typedMask = { width: 400, height: 200, data: new Uint8ClampedArray(400 * 200 * 4) };
    eraseCircle(cls, typedMask, 60, 60, 80, 'typed');
    expect(typedMask.data[(36 * 400 + 24) * 4 + 3]).toBe(255);
    expect(typedMask.data[(80 * 400 + 80) * 4 + 3]).toBe(0);
  });
  it('repaints with the local paper colour', () => {
    const yellow = blank(200, 100, [250, 240, 200]);
    stroke(yellow, [[20, 20], [90, 80], [160, 30]], 2, [30, 30, 30]);
    const c = classify(yellow, []);
    const mask = { width: 200, height: 100, data: new Uint8ClampedArray(200 * 100 * 4) };
    eraseCircle(c, mask, 90, 80, 10, 'ink');
    const p = (80 * 200 + 90) * 4;
    expect(mask.data[p + 3]).toBe(255);
    expect(Math.abs(mask.data[p] - 250)).toBeLessThan(6);
    expect(Math.abs(mask.data[p + 2] - 200)).toBeLessThan(6);
  });
});

describe('handwriting touching typed text', () => {
  it('keeps the typed underline but finds the pen stroke crossing it', () => {
    const img = blank(400, 120);
    // typed run "Name: ________" inside a text rect
    for (let i = 0; i < 5; i++) rect(img, 20 + i * 12, 40, 8, 12, [15, 15, 15]);
    rect(img, 90, 50, 200, 2, [15, 15, 15]);
    const runs = [{ x: 18, y: 38, w: 274, h: 16 }, { x: 18, y: 90, w: 100, h: 16 }, { x: 150, y: 90, w: 100, h: 16 }];
    // black pen squiggle written across the underline
    stroke(img, [[110, 52], [130, 20], [150, 70], [170, 18], [190, 72], [210, 25]], 1, [20, 20, 20]);
    const c = classify(img, runs);
    expect(labelAt(c, 24, 46)).toBe(TYPED);
    expect(labelAt(c, 250, 50)).toBe(TYPED);
    expect(labelAt(c, 130, 21)).toBe(HANDWRITTEN);
    expect(labelAt(c, 170, 19)).toBe(HANDWRITTEN);
  });
});
