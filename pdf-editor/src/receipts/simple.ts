// Quick receipt: a plain, printable receipt form for an airport hotel & taxi business.
// The same drawing serves both uses: print it blank and fill it in by hand, or type the
// details in and save a finished PDF. It scales to every paper size from a 58 mm roll to A4.
import { hexToRgb, makeCanvas } from '../lib/util';

export type QuickPaper = 'A4' | 'A5' | 'A6' | 'Letter' | 'thermal80' | 'thermal58';

export const QUICK_PAPER: Record<QuickPaper, { w: number; h: number | null; label: string }> = {
  A4: { w: 595.28, h: 841.89, label: 'A4 (full page)' },
  A5: { w: 419.53, h: 595.28, label: 'A5 (half A4)' },
  A6: { w: 297.64, h: 419.53, label: 'A6 (quarter A4)' },
  Letter: { w: 612, h: 792, label: 'US Letter' },
  thermal80: { w: 226.77, h: null, label: '80 mm till roll' },
  thermal58: { w: 164.41, h: null, label: '58 mm till roll' },
};

export interface QuickItem {
  desc: string;
  amount: number | null;
}

export interface QuickData {
  business: { name: string; tagline: string; address: string; phone: string };
  logo: string | null;
  accent: string;
  title: string;
  currency: string;
  paper: QuickPaper;
  /** true = empty form for filling in by hand */
  blank: boolean;
  receiptNo: string;
  date: string;
  customer: string;
  phone: string;
  flight: string;
  taxi: boolean;
  hotel: boolean;
  international: boolean;
  local: boolean;
  pickup: string;
  dropoff: string;
  room: string;
  nights: string;
  checkIn: string;
  checkOut: string;
  items: QuickItem[];
  payment: '' | 'cash' | 'pos' | 'transfer';
  footer: string;
}

export const defaultQuick = (): QuickData => ({
  business: {
    name: 'Your Airport Hotel & Taxi',
    tagline: 'Airport taxi • Hotel stays',
    address: 'Airport Road, near Murtala Muhammed International Airport, Ikeja, Lagos',
    phone: 'Tel: 0800 000 0000',
  },
  logo: null,
  accent: '#0c4a6e',
  title: 'RECEIPT',
  currency: '₦',
  paper: 'A5',
  blank: true,
  receiptNo: '0001',
  date: new Date().toLocaleDateString('en-GB'),
  customer: '',
  phone: '',
  flight: '',
  taxi: true,
  hotel: true,
  international: true,
  local: false,
  pickup: 'MMIA International Terminal',
  dropoff: 'Hotel',
  room: '',
  nights: '',
  checkIn: '',
  checkOut: '',
  items: [
    { desc: 'Taxi: International Terminal → Hotel', amount: 25000 },
    { desc: 'Hotel room (2 nights)', amount: 110000 },
  ],
  payment: 'cash',
  footer: 'Thank you. Safe travels!',
});

export const quickTotal = (d: QuickData) =>
  Math.round(d.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;

// ───────────────────────────── amount in words ─────────────────────────────

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];

function under100(n: number) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}
function under1000(n: number) {
  const hnd = Math.floor(n / 100), rest = n % 100;
  return [hnd ? ONES[hnd] + ' hundred' : '', rest ? under100(rest) : ''].filter(Boolean).join(' and ');
}

/** British English: 204250 → "two hundred and four thousand, two hundred and fifty". */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const chunks: number[] = [];
  while (n > 0) { chunks.push(n % 1000); n = Math.floor(n / 1000); }
  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (!chunks[i]) continue;
    parts.push(under1000(chunks[i]) + SCALES[i]);
  }
  // "one thousand and five", but "one thousand, two hundred"
  const last = chunks[0];
  if (parts.length > 1 && last > 0 && last < 100) {
    const tail = parts.pop()!;
    return parts.join(', ') + ' and ' + tail;
  }
  return parts.join(', ');
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
  '₦': ['naira', 'kobo'], '$': ['dollars', 'cents'], '£': ['pounds', 'pence'], '€': ['euros', 'cents'],
  'GH₵': ['cedis', 'pesewas'], 'KSh ': ['shillings', 'cents'], 'R ': ['rand', 'cents'], '₹': ['rupees', 'paise'],
  'CFA ': ['CFA francs', ''], 'USh ': ['shillings', ''],
};

export function amountInWords(amount: number, currency: string): string {
  const [major, minor] = CURRENCY_WORDS[currency] ?? ['', ''];
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  let s = numberToWords(whole) + (major ? ' ' + major : '');
  if (cents && minor) s += ', ' + numberToWords(cents) + ' ' + minor;
  s += ' only';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───────────────────────────── drawing ─────────────────────────────

const SANS = 'Inter, Helvetica, Arial, sans-serif';
const INK = '#1f2937';
const FILL = '#16307a'; // typed entries look like they were written in on the form
const LINE = '#6b7280';

function money(n: number, currency: string) {
  return currency + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Ctx {
  c: CanvasRenderingContext2D;
  s: number; // size factor
  W: number;
  M: number;
  accent: string;
}

function font(x: Ctx, size: number, weight = 400) {
  x.c.font = `${weight} ${size * x.s}px ${SANS}`;
}

function text(x: Ctx, str: string, px: number, py: number, size: number, o: { weight?: number; color?: string; align?: CanvasTextAlign; max?: number } = {}) {
  font(x, size, o.weight);
  x.c.fillStyle = o.color ?? INK;
  x.c.textAlign = o.align ?? 'left';
  x.c.textBaseline = 'alphabetic';
  if (o.max && o.max > 0) x.c.fillText(str, px, py, o.max);
  else x.c.fillText(str, px, py);
}

function width(x: Ctx, str: string, size: number, weight = 400) {
  font(x, size, weight);
  return x.c.measureText(str).width;
}

function rule(x: Ctx, x1: number, x2: number, y: number, color = LINE, w = 0.6, dash: number[] = []) {
  const c = x.c;
  c.save();
  c.strokeStyle = color; c.lineWidth = w * Math.max(0.7, x.s); c.setLineDash(dash);
  c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
  c.restore();
}

/** "Label: ______" with an optional typed value on the line. */
function field(x: Ctx, label: string, value: string, px: number, py: number, w: number) {
  const lw = width(x, label, 8.5, 600);
  text(x, label, px, py, 8.5, { weight: 600 });
  const lx = px + lw + 5 * x.s;
  rule(x, lx, px + w, py + 2 * x.s);
  if (value) text(x, value, lx + 2 * x.s, py - 1 * x.s, 9.5, { weight: 600, color: FILL, max: px + w - lx - 3 * x.s });
}

/** A tick box; returns the width it took. */
function checkbox(x: Ctx, label: string, on: boolean, px: number, py: number) {
  const b = 8.5 * x.s;
  const c = x.c;
  c.save();
  c.strokeStyle = INK; c.lineWidth = 0.8 * Math.max(0.7, x.s);
  c.strokeRect(px, py - b + 1 * x.s, b, b);
  if (on) {
    c.strokeStyle = FILL; c.lineWidth = 1.6 * x.s; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(px + b * 0.18, py - b * 0.45 + x.s);
    c.lineTo(px + b * 0.42, py - b * 0.18 + x.s);
    c.lineTo(px + b * 0.9, py - b * 0.95 + x.s);
    c.stroke();
  }
  c.restore();
  text(x, label, px + b + 4 * x.s, py, 8.5);
  return b + 4 * x.s + width(x, label, 8.5) + 10 * x.s;
}

/** Lays out a label followed by tick boxes, wrapping onto new lines when narrow. Returns new y. */
function tickRow(x: Ctx, label: string, boxes: [string, boolean][], y: number) {
  const right = x.W - x.M;
  let px = x.M;
  text(x, label, px, y, 8.5, { weight: 600 });
  px += width(x, label, 8.5, 600) + 8 * x.s;
  const lh = 15 * x.s;
  for (const [l, on] of boxes) {
    const need = 8.5 * x.s + 4 * x.s + width(x, l, 8.5);
    if (px + need > right && px > x.M + 20 * x.s) { y += lh; px = x.M + 10 * x.s; }
    px += checkbox(x, l, on, px, y);
  }
  return y + lh + 4 * x.s;
}

function wrapLines(x: Ctx, str: string, maxW: number, size: number, weight = 400) {
  font(x, size, weight);
  const out: string[] = [];
  let line = '';
  for (const w of str.split(/\s+/).filter(Boolean)) {
    const t = line ? line + ' ' + w : w;
    if (x.c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function tint(hex: string, k: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}

/** Draws the form and returns its height in points. */
function draw(x: Ctx, d: QuickData, logo: HTMLImageElement | null, rows: number, minH: number, number?: string): number {
  const { c, s, W, M } = x;
  const narrow = W < 260;
  const inner = W - 2 * M;
  const v = (str: string) => (d.blank ? '' : str);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, Math.max(minH, 3000));
  let y = M;

  // header
  const logoSize = (narrow ? 34 : 46) * s;
  let textX = M, align: CanvasTextAlign = 'left', textW = inner;
  if (logo) {
    const k = Math.min(logoSize / logo.width, logoSize / logo.height);
    if (narrow) {
      c.drawImage(logo, W / 2 - (logo.width * k) / 2, y, logo.width * k, logo.height * k);
      y += logo.height * k + 6 * s;
    } else {
      c.drawImage(logo, M, y, logo.width * k, logo.height * k);
      textX = M + logoSize + 10 * s;
      textW = inner - logoSize - 10 * s;
    }
  }
  if (narrow) { textX = W / 2; align = 'center'; }
  const top = y;
  let hy = y + 14 * s;
  for (const l of wrapLines(x, d.business.name, textW, 14, 800)) { text(x, l, textX, hy, 14, { weight: 800, align }); hy += 16 * s; }
  if (d.business.tagline) { text(x, d.business.tagline, textX, hy, 8, { weight: 600, color: x.accent, align, max: textW }); hy += 11 * s; }
  for (const part of [d.business.address, d.business.phone].filter(Boolean)) {
    for (const l of wrapLines(x, part, textW, 7.5)) { text(x, l, textX, hy, 7.5, { color: '#4b5563', align }); hy += 10 * s; }
  }
  y = Math.max(hy, logo && !narrow ? top + logoSize + 4 * s : 0) + 6 * s;

  // title band
  const bandH = 20 * s;
  c.fillStyle = x.accent;
  c.fillRect(M, y, inner, bandH);
  text(x, d.title || 'RECEIPT', M + 8 * s, y + bandH * 0.68, 11, { weight: 800, color: '#fff' });
  const no = number ?? v(d.receiptNo);
  const noLabel = 'No.';
  const noW = Math.max(60 * s, width(x, no, 11, 800) + 10 * s);
  text(x, noLabel, W - M - 8 * s - noW, y + bandH * 0.68, 9, { weight: 600, color: '#fff', align: 'right' });
  c.fillStyle = '#fff';
  c.fillRect(W - M - 4 * s - noW, y + 3 * s, noW, bandH - 6 * s);
  if (no) text(x, no, W - M - 4 * s - noW / 2, y + bandH * 0.7, 10.5, { weight: 800, color: '#c1121f', align: 'center' });
  y += bandH + 18 * s;

  const lh = 19 * s;
  const half = (inner - 12 * s) / 2;
  const pair = (l1: string, v1: string, l2: string, v2: string) => {
    if (narrow) {
      field(x, l1, v1, M, y, inner); y += lh;
      field(x, l2, v2, M, y, inner); y += lh;
    } else {
      field(x, l1, v1, M, y, half);
      field(x, l2, v2, M + half + 12 * s, y, half);
      y += lh;
    }
  };

  pair('Date:', v(d.date), 'Phone:', v(d.phone));
  field(x, 'Received from:', v(d.customer), M, y, inner); y += lh;
  y += 2 * s;
  y = tickRow(x, 'Service:', [['Airport taxi', !d.blank && d.taxi], ['Hotel', !d.blank && d.hotel]], y);
  y = tickRow(x, 'Terminal:', [['International', !d.blank && d.international], ['Local (domestic)', !d.blank && d.local]], y);
  pair('Pick-up:', v(d.pickup), 'Drop-off:', v(d.dropoff));
  pair('Flight no.:', v(d.flight), 'Room no.:', v(d.room));
  pair('Check-in:', v(d.checkIn), 'Check-out:', v(d.checkOut));
  y += 4 * s;

  // items table
  const amtW = Math.max(inner * 0.32, 62 * s);
  const rowH = 17 * s;
  const headH = 16 * s;
  c.fillStyle = tint(x.accent, 0.85);
  c.fillRect(M, y, inner, headH);
  text(x, 'Description', M + 6 * s, y + headH * 0.7, 8.5, { weight: 700 });
  text(x, `Amount (${d.currency.trim()})`, W - M - 6 * s, y + headH * 0.7, 8.5, { weight: 700, align: 'right' });
  const tableTop = y;
  y += headH;
  const items = d.blank ? [] : d.items.filter((i) => i.desc || i.amount);
  const n = Math.max(rows, items.length);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (it) {
      text(x, it.desc, M + 6 * s, y + rowH * 0.68, 9, { weight: 600, color: FILL, max: inner - amtW - 12 * s });
      if (it.amount) text(x, money(Number(it.amount), ''), W - M - 6 * s, y + rowH * 0.68, 9, { weight: 600, color: FILL, align: 'right' });
    }
    y += rowH;
    rule(x, M, W - M, y, '#9ca3af', 0.5);
  }
  // total
  const totH = 20 * s;
  c.fillStyle = tint(x.accent, 0.92);
  c.fillRect(M, y, inner, totH);
  text(x, 'TOTAL', W - M - amtW - 6 * s, y + totH * 0.68, 10, { weight: 800, align: 'right' });
  if (!d.blank) text(x, money(quickTotal(d), d.currency), W - M - 6 * s, y + totH * 0.68, 10.5, { weight: 800, color: FILL, align: 'right' });
  y += totH;
  c.save();
  c.strokeStyle = INK; c.lineWidth = 0.8 * Math.max(0.7, s);
  c.strokeRect(M, tableTop, inner, y - tableTop);
  c.beginPath(); c.moveTo(W - M - amtW, tableTop); c.lineTo(W - M - amtW, y); c.stroke();
  c.restore();
  y += 18 * s;

  // amount in words: two lines to write on
  const words = d.blank ? '' : amountInWords(quickTotal(d), d.currency);
  const label = 'Amount in words:';
  const lw = width(x, label, 8.5, 600);
  text(x, label, M, y, 8.5, { weight: 600 });
  rule(x, M + lw + 5 * s, W - M, y + 2 * s);
  const wl = words ? wrapLines(x, words, inner - lw - 10 * s, 9, 600) : [];
  if (wl[0]) text(x, wl[0], M + lw + 7 * s, y - s, 9, { weight: 600, color: FILL });
  y += lh;
  rule(x, M, W - M, y + 2 * s);
  if (wl.length > 1) text(x, wl.slice(1).join(' '), M + 2 * s, y - s, 9, { weight: 600, color: FILL, max: inner - 4 * s });
  y += lh;

  y = tickRow(x, 'Paid by:', [['Cash', !d.blank && d.payment === 'cash'], ['POS / Card', !d.blank && d.payment === 'pos'], ['Transfer', !d.blank && d.payment === 'transfer']], y);
  y += 16 * s;

  // signatures
  const sig = (lbl: string, sx: number, sw: number) => {
    rule(x, sx, sx + sw, y, INK, 0.7);
    text(x, lbl, sx + sw / 2, y + 10 * s, 7.5, { color: '#4b5563', align: 'center' });
  };
  if (narrow) {
    sig('Cashier signature', M, inner); y += 30 * s;
    sig('Customer signature', M, inner); y += 14 * s;
  } else {
    sig('Cashier signature', M, half);
    sig('Customer signature', M + half + 12 * s, half);
    y += 14 * s;
  }

  // footer, pinned to the bottom on fixed-size paper
  if (d.footer) {
    const fy = Math.max(y + 18 * s, minH - M);
    text(x, d.footer, W / 2, fy, 8, { color: x.accent, weight: 600, align: 'center', max: inner });
    y = fy;
  }
  return Math.max(y + M * 0.6, minH);
}

/** Renders one receipt. `number` overrides the receipt number (for numbered books). */
export function renderQuick(d: QuickData, logo: HTMLImageElement | null, scale = 2, number?: string) {
  const paper = QUICK_PAPER[d.paper];
  const W = paper.w;
  const s = Math.max(0.5, Math.min(1.3, W / 420));
  const M = Math.max(9, 24 * s);
  const ctxFor = (c: CanvasRenderingContext2D): Ctx => ({ c, s, W, M, accent: d.accent });
  const rowH = 17 * s;
  const baseRows = W < 260 ? 4 : 5;
  const probe = makeCanvas(W, 10).getContext('2d')!;
  let rows = baseRows;
  if (paper.h) {
    // grow the table so the form fills the page instead of leaving a gap
    const natural = draw(ctxFor(probe), d, logo, baseRows, 0, number);
    rows = Math.min(30, baseRows + Math.max(0, Math.floor((paper.h - natural - 6 * s) / rowH)));
  }
  const minH = paper.h ?? 0;
  const drawn = draw(ctxFor(probe), d, logo, rows, minH, number);
  // keep fixed paper exactly its real size (e.g. A5 = 419.53 × 595.28 pt)
  const H = paper.h && drawn <= paper.h + 0.5 ? paper.h : Math.ceil(drawn);
  const canvas = makeCanvas(W * scale, H * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  draw(ctxFor(ctx), d, logo, rows, minH, number);
  return { canvas, widthPt: W, heightPt: H };
}

/** How copies of a w×h receipt tile onto an A4 sheet (picks portrait or landscape). */
export function sheetLayout(w: number, h: number) {
  const A4 = [595.28, 841.89];
  const fit = (sw: number, sh: number) => ({ cols: Math.floor((sw + 0.5) / w), rows: Math.floor((sh + 0.5) / h), sw, sh });
  const p = fit(A4[0], A4[1]), l = fit(A4[1], A4[0]);
  const best = p.cols * p.rows >= l.cols * l.rows ? p : l;
  return { ...best, perSheet: best.cols * best.rows };
}
