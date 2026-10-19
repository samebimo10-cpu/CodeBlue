// Ink classifier behind the smart erasers.
//
// Every page is rasterised and each dark ("ink") pixel is labelled as
//   TYPED       – printed / typed text
//   HANDWRITTEN – pen, pencil, marker, signatures, ink annotations
//   GRAPHIC     – ruled lines, boxes, filled shapes, photos and logos
// so an eraser can remove one kind of ink and leave the rest untouched.
//
// Signals used, strongest first:
//  1. Real text in the PDF (pdf.js text runs) is typed, always.
//  2. Shape of the connected ink blob: long thin rules and big dense blobs are graphics.
//  3. Typed glyphs are small, similar in height and sit in rows on a shared
//     baseline; handwriting is larger, joined-up and irregular.
//  4. Coloured ink (blue / red pen) outside real text counts as handwriting.
// Tiny marks (i-dots, commas, specks) inherit the label of the ink around them.

export const BG = 0;
export const TYPED = 1;
export const HANDWRITTEN = 2;
export const GRAPHIC = 3;

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClassifyOptions {
  /** 0..1 – higher finds fainter ink. */
  sensitivity?: number;
  /** Treat coloured (blue/red/green) ink outside real text as handwriting. */
  colouredIsHandwriting?: boolean;
}

export interface Classification {
  width: number;
  height: number;
  labels: Uint8Array;
  /** Background estimate per block, used to repaint erased pixels with "paper". */
  bs: number;
  cols: number;
  rows: number;
  bgR: Float32Array;
  bgG: Float32Array;
  bgB: Float32Array;
  glyphHeight: number;
  counts: [number, number, number, number];
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function saturation(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

function estimateBackground(img: Raster, bs: number) {
  const { width: W, height: H, data } = img;
  const cols = Math.ceil(W / bs), rows = Math.ceil(H / bs);
  const bgR = new Float32Array(cols * rows), bgG = new Float32Array(cols * rows), bgB = new Float32Array(cols * rows);
  const hist = new Uint32Array(64);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      hist.fill(0);
      const x0 = bx * bs, y0 = by * bs, x1 = Math.min(W, x0 + bs), y1 = Math.min(H, y0 + bs);
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        hist[Math.min(63, lum(data[i], data[i + 1], data[i + 2]) >> 2)]++;
        n++;
      }
      // The paper is the bright majority: average the brightest ~40% of the block.
      let acc = 0, cut = 63;
      for (; cut > 0; cut--) {
        acc += hist[cut];
        if (acc >= n * 0.4) break;
      }
      let r = 0, g = 0, b = 0, m = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        if (lum(data[i], data[i + 1], data[i + 2]) >> 2 >= cut) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; m++;
        }
      }
      const k = by * cols + bx;
      bgR[k] = m ? r / m : 255; bgG[k] = m ? g / m : 255; bgB[k] = m ? b / m : 255;
    }
  }
  return { cols, rows, bgR, bgG, bgB };
}

/** Bilinear background colour at a pixel. */
export function bgAt(c: Classification, x: number, y: number): [number, number, number] {
  const fx = Math.max(0, Math.min(c.cols - 1, x / c.bs - 0.5));
  const fy = Math.max(0, Math.min(c.rows - 1, y / c.bs - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(c.cols - 1, x0 + 1), y1 = Math.min(c.rows - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const mix = (arr: Float32Array) => {
    const a = arr[y0 * c.cols + x0], b = arr[y0 * c.cols + x1], d = arr[y1 * c.cols + x0], e = arr[y1 * c.cols + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
  };
  return [mix(c.bgR), mix(c.bgG), mix(c.bgB)];
}

function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

export function classify(img: Raster, textRects: Rect[], opts: ClassifyOptions = {}): Classification {
  const { width: W, height: H, data } = img;
  const N = W * H;
  const sens = opts.sensitivity ?? 0.5;
  const colouredIsHw = opts.colouredIsHandwriting ?? true;
  const bs = 24;
  const bg = estimateBackground(img, bs);
  const inkThreshold = 70 - sens * 50; // luminance drop vs paper that counts as ink
  const haloThreshold = 10;

  // 1. Ink mask.
  const ink = new Uint8Array(N);
  const dark = new Float32Array(N); // how much darker than paper
  for (let y = 0; y < H; y++) {
    const by = Math.min(bg.rows - 1, (y / bs) | 0);
    for (let x = 0; x < W; x++) {
      const k = by * bg.cols + Math.min(bg.cols - 1, (x / bs) | 0);
      const i = y * W + x, p = i * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const d = lum(bg.bgR[k], bg.bgG[k], bg.bgB[k]) - lum(r, g, b);
      const cd = Math.abs(r - bg.bgR[k]) + Math.abs(g - bg.bgG[k]) + Math.abs(b - bg.bgB[k]);
      dark[i] = Math.max(d, cd / 3);
      if (d > inkThreshold || (cd > inkThreshold * 2.2 && saturation(r, g, b) > 0.3)) ink[i] = 1;
    }
  }

  // 2. Real-text coverage. Rects are padded a little so tall letters and accents fit.
  //    inText holds (rect index + 1); ink is "cut" at these rects so a pen stroke that
  //    touches a typed line (a name written across the underline) stays separate from it.
  const inText = new Int32Array(N);
  textRects.forEach((r, ri) => {
    const py = Math.max(1, r.h * 0.12);
    const x0 = Math.max(0, Math.floor(r.x) - 1), y0 = Math.max(0, Math.floor(r.y - py));
    const x1 = Math.min(W, Math.ceil(r.x + r.w) + 1), y1 = Math.min(H, Math.ceil(r.y + r.h + py));
    for (let y = y0; y < y1; y++) inText.fill(ri + 1, y * W + x0, y * W + x1);
  });
  const rectSat = new Float32Array(textRects.length), rectInk = new Uint32Array(textRects.length);
  let inkTotal = 0, inkInText = 0;
  for (let i = 0; i < N; i++) {
    if (!ink[i]) continue;
    inkTotal++;
    const ri = inText[i] - 1;
    if (ri < 0) continue;
    inkInText++;
    const p = i * 4;
    rectSat[ri] += saturation(data[p], data[p + 1], data[p + 2]);
    rectInk[ri]++;
  }
  // A born-digital page: its typed text is all in the text layer, so ink outside it is
  // pen, annotation or graphics — never typed.
  const digital = textRects.length >= 3 && inkTotal > 0 && inkInText / inkTotal > 0.3;
  const free = (i: number) => ink[i] && !inText[i];

  // 3. Connected components (8-neighbour, union-find).
  const parent = new Int32Array(N).fill(-1);
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!free(i)) continue;
    parent[i] = i;
    if (x > 0 && free(i - 1)) union(i, i - 1);
    if (y > 0) {
      const u = i - W;
      if (free(u)) union(i, u);
      if (x > 0 && free(u - 1)) union(i, u - 1);
      if (x < W - 1 && free(u + 1)) union(i, u + 1);
    }
  }

  const compOf = new Int32Array(N).fill(-1);
  const roots = new Map<number, number>();
  type Comp = { x0: number; y0: number; x1: number; y1: number; n: number; r: number; g: number; b: number; label: number };
  const comps: Comp[] = [];
  for (let i = 0; i < N; i++) {
    if (!free(i)) continue;
    const root = find(i);
    let c = roots.get(root);
    if (c === undefined) {
      c = comps.length;
      roots.set(root, c);
      const x = i % W, y = (i / W) | 0;
      comps.push({ x0: x, y0: y, x1: x, y1: y, n: 0, r: 0, g: 0, b: 0, label: BG });
    }
    compOf[i] = c;
    const o = comps[c], x = i % W, y = (i / W) | 0, p = i * 4;
    if (x < o.x0) o.x0 = x;
    if (x > o.x1) o.x1 = x;
    if (y < o.y0) o.y0 = y;
    if (y > o.y1) o.y1 = y;
    o.n++;
    o.r += data[p]; o.g += data[p + 1]; o.b += data[p + 2];
  }

  // 4. Typical glyph height for this page.
  let m: number;
  const textHeights = textRects.map((r) => r.h).filter((v) => v > 2);
  if (textHeights.length >= 3) m = median(textHeights) * 0.72;
  else {
    const hs: number[] = [];
    for (const c of comps) {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      const dens = c.n / (w * h);
      if (h >= 5 && h <= 90 && w / h < 3 && dens > 0.12 && dens < 0.9) hs.push(h);
    }
    m = median(hs) || 14;
  }
  m = Math.max(4, m);

  // Long perfectly straight runs (table rules, box outlines) mark graphics.
  const straightLen = Math.max(20, Math.round(m * 3));
  const straight = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!free(y * W + x)) { x++; continue; }
      let e = x;
      while (e < W && free(y * W + e)) e++;
      if (e - x >= straightLen) straight.fill(1, y * W + x, y * W + e);
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!free(y * W + x)) { y++; continue; }
      let e = y;
      while (e < H && free(e * W + x)) e++;
      if (e - y >= straightLen) for (let k = y; k < e; k++) straight[k * W + x] = 1;
      y = e;
    }
  }
  const straightCount = new Uint32Array(comps.length);
  for (let i = 0; i < N; i++) if (straight[i] && compOf[i] >= 0) straightCount[compOf[i]]++;

  // 5. Classify the "significant" blobs by shape.
  const small = (c: Comp) => c.y1 - c.y0 + 1 < m * 0.55 && c.x1 - c.x0 + 1 < m * 0.9;
  const typedCandidates: number[] = [];
  comps.forEach((c, idx) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const dens = c.n / (w * h);
    if ((w > 6 * m && h < 0.45 * m) || (h > 6 * m && w < 0.45 * m) || straightCount[idx] / c.n > 0.55) {
      c.label = GRAPHIC; // ruled line, table border, underline bar
      return;
    }
    if ((dens > 0.55 && w * h > 9 * m * m) || (w > 12 * m && h > 12 * m && dens > 0.3)) {
      c.label = GRAPHIC; // filled shape, photo, logo
      return;
    }
    if (small(c)) return; // decided later from neighbours
    const coloured = saturation(c.r / c.n, c.g / c.n, c.b / c.n) > 0.32 && lum(c.r / c.n, c.g / c.n, c.b / c.n) > 25;
    if (coloured && colouredIsHw) {
      c.label = HANDWRITTEN;
      return;
    }
    if (digital) {
      c.label = HANDWRITTEN;
      return;
    }
    const tol = 1.25 + sens * 0.5;
    if (h <= m * 1.65 * tol && w <= m * 2.6 * tol) typedCandidates.push(idx);
    else c.label = HANDWRITTEN;
  });

  // Typed glyphs line up: look for similar-height neighbours on the same baseline.
  const cell = Math.max(4, Math.round(m * 1.6));
  const grid = new Map<string, number[]>();
  const key = (gx: number, gy: number) => gx + ',' + gy;
  for (const idx of typedCandidates) {
    const c = comps[idx];
    const k = key(Math.floor((c.x0 + c.x1) / 2 / cell), Math.floor(c.y1 / cell));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(idx);
  }
  const baseTol = m * (0.16 + sens * 0.08);
  const neighbours = new Map<number, number[]>();
  for (const idx of typedCandidates) {
    const c = comps[idx];
    const cx = (c.x0 + c.x1) / 2, h = c.y1 - c.y0 + 1;
    const gx = Math.floor(cx / cell), gy = Math.floor(c.y1 / cell);
    const found: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      for (const j of grid.get(key(gx + dx, gy + dy)) ?? []) {
        if (j === idx) continue;
        const o = comps[j];
        const oh = o.y1 - o.y0 + 1;
        const gap = Math.max(o.x0 - c.x1, c.x0 - o.x1);
        if (gap > m * 1.4) continue;
        // compare either baselines (most letters) or the x-height tops
        if (Math.abs(o.y1 - c.y1) > baseTol && Math.abs(o.y0 - c.y0) > baseTol) continue;
        const ratio = oh / h;
        if (ratio < 0.5 || ratio > 2) continue;
        found.push(j);
      }
    }
    neighbours.set(idx, found);
  }
  // a glyph in the middle of a row has neighbours on both sides; the first and
  // last glyph of a row only need one neighbour that is itself mid-row
  const seed = new Set(typedCandidates.filter((i) => neighbours.get(i)!.length >= 2));
  for (const idx of typedCandidates) {
    const typed = seed.has(idx) || neighbours.get(idx)!.some((j) => seed.has(j));
    comps[idx].label = typed ? TYPED : HANDWRITTEN;
  }

  // 6. Small marks inherit from what's around them.
  const lcell = Math.max(4, Math.round(m));
  const lcols = Math.ceil(W / lcell), lrows = Math.ceil(H / lcell);
  const votes = new Int32Array(lcols * lrows * 4);
  for (const c of comps) {
    if (c.label === BG) continue;
    for (let gy = Math.floor(c.y0 / lcell); gy <= Math.floor(c.y1 / lcell); gy++)
      for (let gx = Math.floor(c.x0 / lcell); gx <= Math.floor(c.x1 / lcell); gx++) votes[(gy * lcols + gx) * 4 + c.label] += 1;
  }
  for (const r of textRects) {
    for (let gy = Math.max(0, Math.floor(r.y / lcell)); gy <= Math.min(lrows - 1, Math.floor((r.y + r.h) / lcell)); gy++)
      for (let gx = Math.max(0, Math.floor(r.x / lcell)); gx <= Math.min(lcols - 1, Math.floor((r.x + r.w) / lcell)); gx++) votes[(gy * lcols + gx) * 4 + TYPED] += 2;
  }
  for (const c of comps) {
    if (c.label !== BG) continue;
    const gx = Math.floor((c.x0 + c.x1) / 2 / lcell), gy = Math.floor((c.y0 + c.y1) / 2 / lcell);
    const tally = [0, 0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= lcols || y >= lrows) continue;
      for (let l = 1; l <= 3; l++) tally[l] += votes[(y * lcols + x) * 4 + l];
    }
    let best = HANDWRITTEN; // isolated specks: pen dots / scanner dirt
    if (tally[TYPED] > tally[HANDWRITTEN] && tally[TYPED] >= tally[GRAPHIC]) best = TYPED;
    else if (tally[GRAPHIC] > tally[HANDWRITTEN] && tally[GRAPHIC] > tally[TYPED]) best = GRAPHIC;
    c.label = best;
  }

  // 7. Per-pixel labels, grown into the soft anti-aliased edge of each stroke.
  const labels = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (compOf[i] >= 0) labels[i] = comps[compOf[i]].label;
    else if (ink[i] && inText[i]) {
      // inside a text run: typed, unless it is clearly pen-coloured on neutral print
      const ri = inText[i] - 1, p = i * 4;
      const runSat = rectInk[ri] ? rectSat[ri] / rectInk[ri] : 0;
      const sat = saturation(data[p], data[p + 1], data[p + 2]);
      const pen = colouredIsHw && runSat < 0.22 && sat > Math.max(0.18, runSat * 2 + 0.1) && lum(data[p], data[p + 1], data[p + 2]) > 25;
      labels[i] = pen ? HANDWRITTEN : TYPED;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = labels.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (labels[i] || dark[i] < haloThreshold) continue;
      const l = labels[i - 1] || labels[i + 1] || labels[i - W] || labels[i + W] ||
        labels[i - W - 1] || labels[i - W + 1] || labels[i + W - 1] || labels[i + W + 1];
      if (l) next[i] = l;
    }
    labels.set(next);
  }

  // Cover the faint outer fringe too (about 1.5 pt), so no ghost outline is left after
  // erasing — PDF viewers smooth the patch edges and draw vector ink sharper than the raster.
  for (let pass = 0; pass < 3; pass++) {
    const next = labels.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (labels[i]) continue;
      const l = labels[i - 1] || labels[i + 1] || labels[i - W] || labels[i + W];
      if (l && l !== GRAPHIC) next[i] = l;
    }
    labels.set(next);
  }

  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) counts[labels[i]]++;
  return { width: W, height: H, labels, bs, ...bg, glyphHeight: m, counts };
}

export type EraseMode = 'handwritten' | 'typed' | 'ink' | 'area';

export function matches(mode: EraseMode, label: number) {
  switch (mode) {
    case 'handwritten': return label === HANDWRITTEN;
    case 'typed': return label === TYPED;
    case 'ink': return label !== BG;
    case 'area': return true;
  }
}

/**
 * Paints "paper" over matching pixels inside a circle of the mask raster.
 * Returns the touched bounding box or null.
 */
export function eraseCircle(c: Classification, mask: Raster, cx: number, cy: number, r: number, mode: EraseMode): Rect | null {
  const W = c.width;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(c.height - 1, Math.ceil(cy + r));
  let hit = false;
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    const i = y * W + x;
    if (!matches(mode, c.labels[i])) continue;
    const [R, G, B] = bgAt(c, x, y);
    const p = i * 4;
    mask.data[p] = R; mask.data[p + 1] = G; mask.data[p + 2] = B; mask.data[p + 3] = 255;
    hit = true;
  }
  return hit ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}

/** Erases matching pixels inside a rectangle (used by "Edit existing text"). */
export function eraseRect(c: Classification, mask: Raster, rect: Rect, mode: EraseMode): Rect | null {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(c.width - 1, Math.ceil(rect.x + rect.w)), y1 = Math.min(c.height - 1, Math.ceil(rect.y + rect.h));
  let hit = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * c.width + x;
    if (!matches(mode, c.labels[i])) continue;
    const [R, G, B] = bgAt(c, x, y);
    const p = i * 4;
    mask.data[p] = R; mask.data[p + 1] = G; mask.data[p + 2] = B; mask.data[p + 3] = 255;
    hit = true;
  }
  return hit ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}

/** Colour-coded preview of what the classifier found. */
export function paintLabels(c: Classification, out: Raster) {
  const colours: Record<number, [number, number, number, number]> = {
    [TYPED]: [30, 110, 255, 235],
    [HANDWRITTEN]: [235, 30, 120, 240],
    [GRAPHIC]: [20, 170, 90, 200],
  };
  for (let i = 0; i < c.labels.length; i++) {
    const col = colours[c.labels[i]];
    const p = i * 4;
    if (!col) { out.data[p + 3] = 0; continue; }
    out.data[p] = col[0]; out.data[p + 1] = col[1]; out.data[p + 2] = col[2]; out.data[p + 3] = col[3];
  }
}
