import { PAPER_PT, computeTotals, lineAmount, money, type ReceiptData } from './model';
import { hexToRgb, makeCanvas } from '../lib/util';

const FONTS = {
  sans: 'Inter, Helvetica, Arial, sans-serif',
  serif: 'Merriweather, Georgia, "Times New Roman", serif',
  mono: '"Courier Prime", "Courier New", Courier, monospace',
};

interface Pen {
  ctx: CanvasRenderingContext2D;
  family: string;
  W: number;
}

function font(p: Pen, size: number, weight = 400, family = p.family) {
  p.ctx.font = `${weight} ${size}px ${family}`;
}

function text(p: Pen, s: string, x: number, y: number, o: { size?: number; weight?: number; align?: CanvasTextAlign; color?: string; max?: number; family?: string; spacing?: number } = {}) {
  const ctx = p.ctx;
  font(p, o.size ?? 9, o.weight ?? 400, o.family);
  ctx.fillStyle = o.color ?? '#1d2433';
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  if (o.spacing) (ctx as any).letterSpacing = o.spacing + 'px';
  ctx.fillText(s, x, y, o.max);
  if (o.spacing) (ctx as any).letterSpacing = '0px';
}

/** Word-wraps text; returns the y after the last line. */
function wrap(p: Pen, s: string, x: number, y: number, width: number, lh: number, o: Parameters<typeof text>[4] = {}) {
  font(p, o.size ?? 9, o.weight ?? 400, o.family);
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (p.ctx.measureText(test).width > width && line) {
        text(p, line, x, y, o);
        y += lh;
        line = word;
      } else line = test;
    }
    text(p, line, x, y, o);
    y += lh;
  }
  return y;
}

function lines(p: Pen, s: string, width: number, size: number, weight = 400) {
  font(p, size, weight);
  let n = 0;
  for (const para of s.split('\n')) {
    let line = '';
    n++;
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (p.ctx.measureText(test).width > width && line) { n++; line = word; } else line = test;
    }
  }
  return n;
}

function tint(hex: string, k: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}

function hr(p: Pen, x1: number, x2: number, y: number, color = '#d5dbe7', w = 0.7, dash: number[] = []) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = color; c.lineWidth = w; c.setLineDash(dash);
  c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
  c.restore();
}

function drawLogo(p: Pen, logo: HTMLImageElement | null, x: number, y: number, maxW: number, maxH: number, align: 'left' | 'center' = 'left') {
  if (!logo) return 0;
  const k = Math.min(maxW / logo.width, maxH / logo.height);
  const w = logo.width * k, hh = logo.height * k;
  p.ctx.drawImage(logo, align === 'center' ? x - w / 2 : x, y, w, hh);
  return hh;
}

function stamp(p: Pen, label: string, x: number, y: number, color: string) {
  if (!label) return;
  const c = p.ctx;
  c.save();
  c.translate(x, y);
  c.rotate(-0.22);
  font(p, 22, 800, FONTS.sans);
  const w = c.measureText(label).width + 26;
  c.globalAlpha = 0.78;
  c.strokeStyle = color; c.lineWidth = 2.4;
  c.beginPath(); c.roundRect(-w / 2, -20, w, 34, 6); c.stroke();
  c.lineWidth = 0.8;
  c.beginPath(); c.roundRect(-w / 2 + 3, -17, w - 6, 28, 4); c.stroke();
  c.fillStyle = color; c.textAlign = 'center';
  c.fillText(label, 0, 5);
  c.restore();
}

const stampColour = (s: ReceiptData['stamp']) => (s === 'PAID' ? '#15803d' : s === 'UNPAID' ? '#b91c1c' : s === 'PART PAID' ? '#c2410c' : '#475569');

// ─────────────────────────────── A4 / A5 / Letter ───────────────────────────────

function drawPage(p: Pen, d: ReceiptData, logo: HTMLImageElement | null, minH: number): number {
  const { ctx, W } = p;
  const compact = d.layout === 'compact';
  const folio = d.layout === 'folio';
  const k = compact ? 0.82 : W < 500 ? 0.86 : 1;
  const M = (compact ? 28 : 40) * (W / 595);
  const accent = d.accent;
  const t = computeTotals(d);
  let y = 0;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, Math.max(minH, 2000));

  if (folio) {
    // elegant centred header
    y = 34;
    const lh = drawLogo(p, logo, W / 2, y, 90 * k, 64 * k, 'center');
    y += lh + (lh ? 14 : 0);
    text(p, d.business.name, W / 2, y + 14 * k, { size: 21 * k, weight: 700, align: 'center', color: '#1a1a1a' });
    y += 22 * k;
    if (d.business.tagline) { text(p, d.business.tagline, W / 2, y + 10 * k, { size: 8.5 * k, align: 'center', color: accent, spacing: 1.2 }); y += 13 * k; }
    const contact = [d.business.address, d.business.phone, d.business.email, d.business.website].filter(Boolean).join('  •  ');
    y = wrap(p, contact, W / 2, y + 12 * k, W - 2 * M, 11 * k, { size: 7.6 * k, align: 'center', color: '#5b6474' }) - 2;
    hr(p, M, W - M, y + 6, accent, 1.2);
    hr(p, M, W - M, y + 9, accent, 0.4);
    y += 30 * k;
    text(p, d.title, W / 2, y, { size: 15 * k, weight: 700, align: 'center', color: '#1a1a1a', spacing: 3 });
    y += 10;
    const meta = d.meta.map((m) => `${m.label}: ${m.value}`).join('     ');
    text(p, meta, W / 2, y + 12, { size: 8 * k, align: 'center', color: '#5b6474' });
    y += 26;
  } else {
    // accent band + logo left, title right
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, compact ? 6 : 8);
    y = (compact ? 22 : 30);
    const logoW = drawLogo(p, logo, M, y, 64 * k, 64 * k) ? 64 * k + 12 : 0;
    const nameX = M + logoW;
    const rightW = W * 0.36;
    text(p, d.business.name, nameX, y + 17 * k, { size: (compact ? 15 : 19) * k, weight: 800, color: '#111827', max: W - nameX - rightW - M });
    let yy = y + 30 * k;
    if (d.business.tagline) { text(p, d.business.tagline, nameX, yy, { size: 8.5 * k, color: accent, weight: 600 }); yy += 12 * k; }
    for (const l of [d.business.address, [d.business.phone, d.business.email].filter(Boolean).join('  •  '), d.business.website, d.business.regNo].filter(Boolean)) {
      text(p, l, nameX, yy, { size: 7.6 * k, color: '#5b6474', max: W - nameX - rightW - M });
      yy += 10.5 * k;
    }
    // title + meta on the right
    text(p, d.title, W - M, y + 17 * k, { size: (compact ? 13 : 17) * k, weight: 800, color: accent, align: 'right', spacing: 0.6 });
    let my = y + 34 * k;
    for (const m of d.meta) {
      text(p, m.label, W - M - rightW * 0.52, my, { size: 7.8 * k, color: '#6b7280', align: 'right' });
      text(p, m.value, W - M, my, { size: 8 * k, weight: 600, align: 'right', color: '#111827', max: rightW * 0.5 });
      my += 11.5 * k;
    }
    y = Math.max(yy, my, y + 70 * k) + 10;
  }

  // party block
  if (d.party.fields.length) {
    const cols = W > 450 ? 2 : 1;
    const rows = Math.ceil(d.party.fields.length / cols);
    const bh = 20 + rows * 13 * k;
    ctx.fillStyle = tint(accent, 0.92);
    ctx.beginPath(); ctx.roundRect(M, y, W - 2 * M, bh, 6); ctx.fill();
    text(p, d.party.heading.toUpperCase(), M + 10, y + 13, { size: 7.4 * k, weight: 700, color: accent, spacing: 0.8 });
    const colW = (W - 2 * M - 20) / cols;
    d.party.fields.forEach((f, i) => {
      const cx = M + 10 + (i % cols) * colW, cy = y + 26 + Math.floor(i / cols) * 13 * k;
      text(p, f.label + ':', cx, cy, { size: 8 * k, color: '#6b7280' });
      font(p, 8 * k);
      const lw = Math.max(62 * k, ctx.measureText(f.label + ':  ').width);
      text(p, f.value, cx + lw, cy, { size: 8.2 * k, weight: 600, color: '#111827', max: colW - lw - 8 });
    });
    y += bh + 14;
  }

  // items table
  const cols: { key: string; label: string; w: number; align: CanvasTextAlign }[] = [];
  const tw = W - 2 * M;
  if (d.showExtra) cols.push({ key: 'extra', label: d.columns.extra, w: tw * 0.17, align: 'left' });
  cols.push({ key: 'desc', label: d.columns.desc, w: 0, align: 'left' });
  cols.push({ key: 'qty', label: d.columns.qty, w: tw * 0.08, align: 'right' });
  cols.push({ key: 'price', label: d.columns.price, w: tw * 0.16, align: 'right' });
  cols.push({ key: 'amount', label: d.columns.amount, w: tw * 0.17, align: 'right' });
  cols.find((c) => c.key === 'desc')!.w = tw - cols.reduce((s, c) => s + c.w, 0);
  const rowH = 17 * k;
  ctx.fillStyle = folio ? '#1f2937' : accent;
  ctx.fillRect(M, y, tw, rowH + 2);
  let cx = M;
  for (const c of cols) {
    const tx = c.align === 'right' ? cx + c.w - 6 : cx + 6;
    text(p, c.label, tx, y + rowH * 0.68, { size: 7.8 * k, weight: 700, color: '#fff', align: c.align });
    cx += c.w;
  }
  y += rowH + 2;
  d.items.forEach((it, i) => {
    const descW = cols.find((c) => c.key === 'desc')!.w - 12;
    const n = lines(p, it.desc, descW, 8.4 * k);
    const hh = Math.max(rowH, n * 11 * k + 7);
    if (i % 2 === 1) { ctx.fillStyle = tint(accent, 0.955); ctx.fillRect(M, y, tw, hh); }
    let x = M;
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.w - 6 : x + 6;
      const base = y + 12 * k;
      if (c.key === 'desc') wrap(p, it.desc, tx, base, c.w - 12, 11 * k, { size: 8.4 * k, color: '#111827' });
      else {
        const v = c.key === 'extra' ? it.extra : c.key === 'qty' ? String(it.qty) : c.key === 'price' ? money(it.price, d.currency) : money(lineAmount(it), d.currency);
        text(p, v, tx, base, { size: 8.4 * k, color: '#111827', align: c.align, weight: c.key === 'amount' ? 600 : 400, max: c.w - 10 });
      }
      x += c.w;
    }
    y += hh;
    hr(p, M, W - M, y, '#e5e7eb', 0.6);
  });
  y += 12;

  // totals (right) + payment/notes (left)
  const tx0 = W - M - tw * 0.42;
  let ty = y;
  const trow = (label: string, val: string, bold = false, color = '#111827') => {
    text(p, label, tx0, ty + 9 * k, { size: (bold ? 9.5 : 8.4) * k, weight: bold ? 800 : 400, color: bold ? color : '#4b5563' });
    text(p, val, W - M - 6, ty + 9 * k, { size: (bold ? 10 : 8.6) * k, weight: bold ? 800 : 600, color, align: 'right' });
    ty += (bold ? 18 : 14) * k;
  };
  trow('Subtotal', money(t.subtotal, d.currency));
  if (t.discount) trow('Discount', '-' + money(t.discount, d.currency));
  for (const c of t.charges) trow(`${c.label}${c.rate ? ` (${c.rate}%)` : ''}`, money(c.amount, d.currency));
  ty += 2;
  ctx.fillStyle = tint(accent, 0.9);
  ctx.fillRect(tx0 - 8, ty - 3, W - M - tx0 + 8, 22 * k);
  trow('TOTAL', money(t.total, d.currency), true, accent);
  ty += 3;
  trow('Amount paid', money(t.paid, d.currency));
  if (t.balance !== 0) trow(t.balance > 0 ? 'Balance due' : 'Change', money(Math.abs(t.balance), d.currency), false, t.balance > 0 ? '#b91c1c' : '#111827');

  let ly = y + 9 * k;
  const lw = tx0 - M - 24;
  if (d.paymentMethod) {
    text(p, 'PAYMENT METHOD', M, ly, { size: 7 * k, weight: 700, color: accent, spacing: 0.6 });
    text(p, d.paymentMethod, M, ly + 12 * k, { size: 8.6 * k, weight: 600, color: '#111827', max: lw });
    ly += 30 * k;
  }
  if (d.notes) {
    text(p, 'NOTES', M, ly, { size: 7 * k, weight: 700, color: accent, spacing: 0.6 });
    ly = wrap(p, d.notes, M, ly + 12 * k, lw, 11 * k, { size: 8 * k, color: '#4b5563' });
  }
  if (d.stamp) stamp(p, d.stamp, M + lw * 0.62, Math.max(ly, y + 40) + 18, stampColour(d.stamp));
  y = Math.max(ty, ly + 34) + 18;

  // signatures
  if (d.signatures.length) {
    y += 26;
    const n = d.signatures.length;
    const sw = Math.min(170, (tw - (n - 1) * 30) / n);
    d.signatures.forEach((s, i) => {
      const sx = n === 1 ? W - M - sw : M + i * ((tw - sw) / Math.max(1, n - 1));
      hr(p, sx, sx + sw, y, '#6b7280', 0.8);
      text(p, s, sx + sw / 2, y + 11, { size: 7.8 * k, color: '#6b7280', align: 'center' });
    });
    y += 28;
  }

  // footer pinned to the bottom of fixed-size paper
  const footerLines = d.footer ? lines(p, d.footer, tw, 8 * k) : 0;
  const footerH = footerLines * 11 * k + 26;
  let fy = Math.max(y + 10, minH - footerH);
  if (d.footer) {
    hr(p, M, W - M, fy, folio ? accent : '#e5e7eb', 0.7);
    wrap(p, d.footer, W / 2, fy + 15, tw, 11 * k, { size: 8 * k, align: 'center', color: folio ? accent : '#4b5563', weight: folio ? 400 : 500 });
    fy += footerH;
  }
  if (!folio) { ctx.fillStyle = accent; ctx.fillRect(0, Math.max(fy, minH) - 4, W, 4); }
  return Math.max(fy, minH);
}

// ─────────────────────────────── thermal roll ───────────────────────────────

function drawThermal(p: Pen, d: ReceiptData, logo: HTMLImageElement | null): number {
  const { ctx, W } = p;
  const narrow = W < 200;
  const M = narrow ? 8 : 12;
  const fs = narrow ? 7 : 8.2;
  const lh = fs * 1.38;
  const t = computeTotals(d);
  const ink = '#111';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, 6000);
  let y = 14;
  const lH = drawLogo(p, logo, W / 2, y, W * 0.32, 46, 'center');
  y += lH ? lH + 8 : 0;
  y = wrap(p, d.business.name, W / 2, y + fs * 1.4, W - 2 * M, fs * 1.6, { size: fs * 1.35, weight: 700, align: 'center', color: ink });
  for (const l of [d.business.tagline, d.business.address, d.business.phone, d.business.email, d.business.regNo].filter(Boolean)) {
    y = wrap(p, l, W / 2, y, W - 2 * M, lh, { size: fs * 0.92, align: 'center', color: ink });
  }
  const dash = () => { y += 3; hr(p, M, W - M, y, ink, 0.8, [2.5, 2]); y += lh; };
  dash();
  text(p, d.title, W / 2, y, { size: fs * 1.15, weight: 700, align: 'center', color: ink, spacing: 1 });
  y += lh * 1.2;
  const lr = (l: string, r: string, o: { size?: number; weight?: number } = {}) => {
    text(p, l, M, y, { size: o.size ?? fs, weight: o.weight, color: ink, max: (W - 2 * M) * 0.55 });
    text(p, r, W - M, y, { size: o.size ?? fs, weight: o.weight, color: ink, align: 'right', max: (W - 2 * M) * 0.6 });
    y += (o.size ?? fs) * 1.38;
  };
  for (const m of d.meta) lr(m.label, m.value);
  for (const f of d.party.fields) if (f.value && f.value !== '—') lr(f.label, f.value);
  dash();
  // items: description line then qty x price ..... amount
  for (const it of d.items) {
    y = wrap(p, it.desc + (d.showExtra && it.extra ? ` [${it.extra}]` : ''), M, y, W - 2 * M, lh, { size: fs, color: ink, weight: 700 });
    y -= lh * 0.1;
    lr(`  ${it.qty} x ${money(it.price, d.currency)}`, money(lineAmount(it), d.currency));
  }
  dash();
  lr('Subtotal', money(t.subtotal, d.currency));
  if (t.discount) lr('Discount', '-' + money(t.discount, d.currency));
  for (const c of t.charges) lr(`${c.label}${c.rate ? ` ${c.rate}%` : ''}`, money(c.amount, d.currency));
  y += 2;
  hr(p, M, W - M, y - fs, ink, 1);
  y += 4;
  lr('TOTAL', money(t.total, d.currency), { size: fs * 1.35, weight: 700 });
  hr(p, M, W - M, y - fs * 0.6, ink, 1);
  y += 4;
  if (d.paymentMethod) lr(d.paymentMethod, money(t.paid, d.currency));
  if (t.balance < 0) lr('Change', money(-t.balance, d.currency), { weight: 700 });
  if (t.balance > 0) lr('Balance due', money(t.balance, d.currency), { weight: 700 });
  const qty = d.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  lr('Items', String(qty));
  if (d.stamp) { y += 22; stamp(p, d.stamp, W / 2, y, stampColour(d.stamp)); y += 18; }
  dash();
  if (d.notes) y = wrap(p, d.notes, W / 2, y, W - 2 * M, lh, { size: fs * 0.92, align: 'center', color: ink });
  if (d.footer) y = wrap(p, d.footer, W / 2, y + 2, W - 2 * M, lh, { size: fs, align: 'center', color: ink, weight: 700 });
  for (const s of d.signatures) {
    y += lh * 2.2;
    hr(p, M + 10, W - M - 10, y, ink, 0.7);
    y += lh;
    text(p, s, W / 2, y, { size: fs * 0.9, align: 'center', color: ink });
  }
  // decorative barcode-style receipt number strip
  const num = d.meta[0]?.value ?? '';
  if (num) {
    y += lh * 1.4;
    let bx = M + 14;
    const seed = Array.from(num).reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
    for (let i = 0; bx < W - M - 14; i++) {
      const bw = ((seed >> (i % 24)) & 3) * 0.55 + 0.6;
      if (i % 2 === 0) { ctx.fillStyle = ink; ctx.fillRect(bx, y, bw, 22); }
      bx += bw + 0.7;
    }
    y += 32;
    text(p, num, W / 2, y, { size: fs * 0.9, align: 'center', color: ink });
  }
  return y + 18;
}

export async function loadLogo(url: string | null) {
  if (!url) return null;
  return new Promise<HTMLImageElement | null>((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

/** Renders a receipt; returns the canvas and its size in points. */
export function renderReceipt(d: ReceiptData, logo: HTMLImageElement | null, scale = 2) {
  const paper = PAPER_PT[d.paper];
  const W = paper.w;
  const family = FONTS[d.font];
  const draw = (ctx: CanvasRenderingContext2D) => {
    const p: Pen = { ctx, family, W };
    return d.layout === 'thermal' || paper.h === null ? drawThermal(p, d, logo) : drawPage(p, d, logo, paper.h);
  };
  // measure pass, then real pass at the right height
  const probe = makeCanvas(W, 10).getContext('2d')!;
  const H = Math.ceil(draw(probe));
  const c = makeCanvas(W * scale, H * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  draw(ctx);
  return { canvas: c, widthPt: W, heightPt: H };
}
