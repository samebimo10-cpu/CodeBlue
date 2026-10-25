// Company stamp drawing: a round seal with text around the ring, or a rectangular office stamp.
import { makeCanvas, mulberry32 } from '../lib/util';

export interface StampSpec {
  shape: 'round' | 'rect';
  /** company name: round = top of the ring, rect = first line */
  top: string;
  /** round = bottom of the ring, rect = second line (address, RC number…) */
  bottom: string;
  /** big word in the middle, e.g. PAID or RECEIVED */
  center: string;
  /** small line under the middle word */
  sub: string;
  /** add a "Date: ____" line, filled with `date` when given */
  dateLine: boolean;
  date: string;
  color: string;
  /** how worn / unevenly inked the impression looks: 0 = crisp, 1 = heavily faded */
  fade: number;
  /** picks the fade pattern, so every stamping can look a little different */
  seed: number;
}

export const FADE_LEVELS: [number, string][] = [
  [0, 'Crisp (no fade)'], [0.3, 'Light'], [0.55, 'Medium'], [0.8, 'Heavy'], [1, 'Very worn'],
];

export const defaultStamp = (): StampSpec => ({
  shape: 'round',
  top: 'YOUR COMPANY LIMITED',
  bottom: 'RC 000000 • LAGOS',
  center: 'PAID',
  sub: 'Accounts',
  dateLine: true,
  date: '',
  color: '#1d3fa8',
  fade: 0.3,
  seed: 1,
});

export const STAMP_INKS: [string, string][] = [
  ['#1d3fa8', 'Blue'], ['#b3121f', 'Red'], ['#5b2a86', 'Purple'], ['#14532d', 'Green'], ['#1a1a1a', 'Black'],
];

const FONT = 'Inter, Helvetica, Arial, sans-serif';

/** Draw text along a circle: top text reads clockwise, bottom text reads left-to-right underneath. */
function arcText(c: CanvasRenderingContext2D, str: string, cx: number, cy: number, r: number, size: number, maxSpan: number, bottom: boolean) {
  if (!str) return;
  let fs = size;
  let widths: number[] = [];
  let span = 0;
  const spacing = 0.12;
  for (let i = 0; i < 20; i++) {
    c.font = `800 ${fs}px ${FONT}`;
    widths = Array.from(str).map((ch) => c.measureText(ch).width + fs * spacing);
    span = widths.reduce((a, b) => a + b, 0) / r;
    if (span <= maxSpan) break;
    fs *= 0.94;
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let a = bottom ? Math.PI / 2 + span / 2 : -Math.PI / 2 - span / 2;
  Array.from(str).forEach((ch, i) => {
    const step = widths[i] / r;
    const mid = bottom ? a - step / 2 : a + step / 2;
    c.save();
    c.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid));
    c.rotate(bottom ? mid - Math.PI / 2 : mid + Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
    a = bottom ? a - step : a + step;
  });
}

function fitText(c: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, size: number, weight = 800) {
  let fs = size;
  c.font = `${weight} ${fs}px ${FONT}`;
  while (c.measureText(str).width > maxW && fs > 6) {
    fs *= 0.94;
    c.font = `${weight} ${fs}px ${FONT}`;
  }
  c.fillText(str, x, y);
  return fs;
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    i ? c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : c.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  c.closePath();
  c.fill();
}

function middle(c: CanvasRenderingContext2D, s: StampSpec, cx: number, cy: number, w: number, unit: number) {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const rows = [s.center ? 'center' : '', s.dateLine ? 'date' : '', s.sub ? 'sub' : ''].filter(Boolean);
  const gap = unit * 0.2;
  let y = cy - ((rows.length - 1) * gap) / 2;
  for (const r of rows) {
    if (r === 'center') fitText(c, s.center, cx, y, w, unit * 0.22);
    if (r === 'sub') fitText(c, s.sub, cx, y, w, unit * 0.1, 700);
    if (r === 'date') {
      c.font = `700 ${unit * 0.085}px ${FONT}`;
      const label = 'DATE:';
      const lw = c.measureText(label).width;
      const x0 = cx - w / 2;
      c.textAlign = 'left';
      c.fillText(label, x0, y);
      c.lineWidth = unit * 0.008;
      c.beginPath(); c.moveTo(x0 + lw + unit * 0.02, y + unit * 0.04); c.lineTo(cx + w / 2, y + unit * 0.04); c.stroke();
      if (s.date) {
        c.textAlign = 'center';
        fitText(c, s.date, (x0 + lw + cx + w / 2) / 2, y - unit * 0.005, w - lw - unit * 0.04, unit * 0.09, 700);
      }
      c.textAlign = 'center';
    }
    y += gap;
  }
}

/** Renders the stamp on a transparent canvas, `size` px tall. */
export function renderStamp(s: StampSpec, size = 600): HTMLCanvasElement {
  const round = s.shape === 'round';
  const W = round ? size : Math.round(size * 1.7);
  const cv = makeCanvas(W, size);
  const c = cv.getContext('2d')!;
  c.fillStyle = s.color;
  c.strokeStyle = s.color;
  if (round) {
    const cx = size / 2, cy = size / 2, R = size / 2 - size * 0.02;
    c.lineWidth = size * 0.022;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.lineWidth = size * 0.008;
    c.beginPath(); c.arc(cx, cy, R * 0.93, 0, Math.PI * 2); c.stroke();
    c.lineWidth = size * 0.012;
    c.beginPath(); c.arc(cx, cy, R * 0.62, 0, Math.PI * 2); c.stroke();
    const textR = R * 0.775;
    arcText(c, s.top.toUpperCase(), cx, cy, textR, size * 0.1, Math.PI * 0.95, false);
    arcText(c, s.bottom.toUpperCase(), cx, cy, textR, size * 0.085, Math.PI * 0.55, true);
    star(c, cx - textR, cy, size * 0.03);
    star(c, cx + textR, cy, size * 0.03);
    middle(c, s, cx, cy, R * 0.9, size * 0.6);
  } else {
    const m = size * 0.03;
    c.lineWidth = size * 0.022;
    c.strokeRect(m, m, W - 2 * m, size - 2 * m);
    c.lineWidth = size * 0.008;
    c.strokeRect(m * 2.6, m * 2.6, W - 5.2 * m, size - 5.2 * m);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const inner = W - 9 * m;
    fitText(c, s.top.toUpperCase(), W / 2, size * 0.2, inner, size * 0.12);
    if (s.bottom) fitText(c, s.bottom.toUpperCase(), W / 2, size * 0.32, inner, size * 0.075, 700);
    c.lineWidth = size * 0.008;
    c.beginPath(); c.moveTo(m * 4, size * 0.4); c.lineTo(W - m * 4, size * 0.4); c.stroke();
    middle(c, s, W / 2, size * 0.67, inner * 0.8, size * 0.78);
  }
  if (s.fade > 0) applyFade(cv, s.fade, s.seed, size);
  return cv;
}

/** Integer hash → 0..1, so a pattern looks the same at every render size. */
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise on a grid of `cells` across the stamp height. */
function valueNoise(u: number, v: number, cells: number, seed: number) {
  const x = u * cells, y = v * cells;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/**
 * Makes the ink uneven like a real rubber-stamp impression: one side pressed lighter,
 * blotchy patches where the pad was dry, and fine gaps where the paper grain didn't
 * take ink. The pattern depends only on the seed and position, not on the pixel size.
 */
function applyFade(cv: HTMLCanvasElement, fade: number, seed: number, size: number) {
  const ctx = cv.getContext('2d')!;
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const rand = mulberry32(seed * 7919 + 13);
  const dir = rand() * Math.PI * 2; // which side gets less pressure
  const dx = Math.cos(dir), dy = Math.sin(dir);
  const W = cv.width, H = cv.height;
  for (let y = 0; y < H; y++) {
    const v = y / size;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4 + 3;
      if (!d[i]) continue;
      const u = x / size;
      // uneven pressure across the stamp
      const side = ((u - W / size / 2) * dx + (v - H / size / 2) * dy) / (Math.max(W, H) / size);
      let k = 1 - fade * 0.55 * Math.max(0, side + 0.5);
      // dry patches
      const blot = valueNoise(u, v, 6, seed) * 0.6 + valueNoise(u, v, 14, seed + 1) * 0.4;
      k *= 1 - fade * 0.75 * Math.max(0, blot - 0.35) / 0.65;
      // paper grain: tiny unlinked specks
      const grain = hash(Math.floor(u * 260), Math.floor(v * 260), seed + 2);
      if (grain < fade * 0.35) k *= grain / (fade * 0.35) * 0.5;
      d[i] = Math.max(0, Math.min(255, d[i] * k));
    }
  }
  ctx.putImageData(img, 0, 0);
}
