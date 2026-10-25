// Company stamp drawing: a round seal with text around the ring, or a rectangular office stamp.
import { makeCanvas } from '../lib/util';

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
}

export const defaultStamp = (): StampSpec => ({
  shape: 'round',
  top: 'YOUR COMPANY LIMITED',
  bottom: 'RC 000000 • LAGOS',
  center: 'PAID',
  sub: 'Accounts',
  dateLine: true,
  date: '',
  color: '#1d3fa8',
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
  return cv;
}
