import { HAND_STYLES } from './styles';
import { hexToRgb, makeCanvas, mulberry32 } from '../lib/util';

/** A user's own handwriting: strokes per character, normalised to a 1-unit em (baseline at y=0). */
export interface GlyphSet {
  id: string;
  name: string;
  glyphs: Record<string, Glyph[]>;
  updated: number;
}
export interface Glyph {
  /** flat [x0,y0,x1,y1,...] per stroke, em units, y down, baseline at 0 */
  strokes: number[][];
  advance: number;
}

export interface HandOptions {
  text: string;
  /** a HAND_STYLES id, or "set:<GlyphSet id>" */
  style: string;
  size: number;
  color: string;
  grain: number;
  /** degrees, positive leans right */
  slant: number;
  /** 0..1 how uneven the writing is */
  messiness: number;
  lineSpacing: number;
  /** wrap width in px at scale 1; 0 = no wrap */
  wrap: number;
  align: 'left' | 'center' | 'right';
  seed: number;
  /** pen thickness for "my handwriting" glyphs, relative */
  penWidth: number;
}

export const defaultHandOptions = (): HandOptions => ({
  text: 'Received with thanks,\nJohn A.',
  style: 'everyday',
  size: 36,
  color: '#1b3a9e',
  grain: 0,
  slant: 0,
  messiness: 0.35,
  lineSpacing: 1.25,
  wrap: 0,
  align: 'left',
  seed: 7,
  penWidth: 1,
});

interface Mark {
  kind: 'text' | 'glyph';
  str: string;
  glyph?: Glyph;
  x: number;
  y: number; // baseline
  rot: number;
  scale: number;
  alpha: number;
  width: number;
}

/** Lays out and draws handwriting. Returns a tightly-cropped transparent canvas. */
export function renderHandwriting(o: HandOptions, set: GlyphSet | null, scale = 2): HTMLCanvasElement {
  const style = HAND_STYLES.find((s) => s.id === o.style) ?? HAND_STYLES[0];
  const useSet = o.style.startsWith('set:') && set;
  const fontSize = o.size * (useSet ? 1 : style.scale);
  const rand = mulberry32(o.seed * 9973 + 17);
  const mess = Math.max(0, Math.min(1, o.messiness));
  const measure = makeCanvas(4, 4).getContext('2d')!;
  const font = (s: number) => `${s}px "${style.family}", "Caveat", cursive`;
  measure.font = font(fontSize);

  const lineH = o.size * 1.3 * o.lineSpacing;
  const marks: Mark[] = [];
  const lines: { marks: Mark[]; width: number }[] = [];

  const glyphFor = (ch: string): Glyph | undefined => {
    if (!useSet) return undefined;
    const variants = set!.glyphs[ch];
    if (!variants?.length) return undefined;
    return variants[Math.floor(rand() * variants.length) % variants.length];
  };

  // Build tokens: either single chars (loose styles / glyph sets) or words (joined scripts).
  const paragraphs = o.text.replace(/\r/g, '').split('\n');
  let y = 0;
  for (const para of paragraphs) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line: Mark[] = [];
    let x = 0;
    const drift = (rand() - 0.5) * mess * 0.05; // gentle uphill / downhill line
    const flush = () => {
      lines.push({ marks: line, width: x });
      line = [];
      x = 0;
      y += lineH * (1 + (rand() - 0.5) * mess * 0.08);
    };
    for (const word of words) {
      const isSpace = /^\s+$/.test(word);
      const spaceW = fontSize * (useSet ? 0.38 : 0.28) * (1 + (rand() - 0.5) * mess * 0.6);
      if (isSpace) {
        x += spaceW * word.length;
        continue;
      }
      // measure word to decide on wrapping
      let wordW = 0;
      const pieces: Mark[] = [];
      const chunks = style.connected && !useSet ? [word] : Array.from(word);
      for (const ch of chunks) {
        const sc = 1 + (rand() - 0.5) * mess * (style.connected ? 0.06 : 0.16);
        const g = glyphFor(ch);
        const w = g ? g.advance * fontSize * sc : measure.measureText(ch).width * sc;
        const kern = style.connected && !useSet ? 0 : (rand() - 0.5) * mess * fontSize * 0.06;
        pieces.push({
          kind: g ? 'glyph' : 'text', str: ch, glyph: g, x: wordW, y: 0,
          rot: (rand() - 0.5) * mess * (style.connected ? 0.05 : 0.14),
          scale: sc,
          alpha: o.grain > 0 ? 0.75 + rand() * 0.25 : 0.82 + rand() * 0.18 * (1 - mess * 0.3),
          width: w,
        });
        wordW += w + kern;
      }
      if (o.wrap > 0 && x > 0 && x + wordW > o.wrap) flush();
      const wordLift = (rand() - 0.5) * mess * fontSize * 0.08;
      for (const p of pieces) {
        p.x += x;
        p.y = y + wordLift + (rand() - 0.5) * mess * fontSize * (style.connected ? 0.02 : 0.07) + p.x * drift;
        line.push(p);
      }
      x += wordW;
    }
    flush();
  }

  // alignment
  const maxW = Math.max(1, ...lines.map((l) => l.width), o.wrap || 0);
  for (const l of lines) {
    const off = o.align === 'center' ? (maxW - l.width) / 2 : o.align === 'right' ? maxW - l.width : 0;
    for (const m of l.marks) {
      m.x += off;
      marks.push(m);
    }
  }

  const slant = Math.tan((o.slant * Math.PI) / 180);
  const pad = fontSize * 0.9;
  const totalH = y;
  const W = (maxW + pad * 2 + Math.abs(slant) * fontSize) * scale;
  const H = (totalH + pad * 1.4) * scale;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = o.color;
  ctx.strokeStyle = o.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const baseline0 = pad + fontSize * 0.25;

  for (const m of marks) {
    ctx.save();
    ctx.globalAlpha = m.alpha;
    ctx.translate(pad + m.x + (slant < 0 ? -slant * fontSize : 0), baseline0 + m.y);
    ctx.rotate(m.rot);
    ctx.transform(1, 0, -slant, 1, 0, 0);
    ctx.scale(m.scale, m.scale);
    if (m.kind === 'glyph' && m.glyph) {
      ctx.lineWidth = (fontSize * 0.055 * o.penWidth) / m.scale;
      for (const s of m.glyph.strokes) {
        ctx.beginPath();
        if (s.length === 2) {
          ctx.arc(s[0] * fontSize, s[1] * fontSize, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.moveTo(s[0] * fontSize, s[1] * fontSize);
        for (let i = 2; i < s.length - 2; i += 2) {
          // smooth through midpoints
          const mx = ((s[i] + s[i + 2]) / 2) * fontSize, my = ((s[i + 1] + s[i + 3]) / 2) * fontSize;
          ctx.quadraticCurveTo(s[i] * fontSize, s[i + 1] * fontSize, mx, my);
        }
        ctx.lineTo(s[s.length - 2] * fontSize, s[s.length - 1] * fontSize);
        ctx.stroke();
      }
    } else {
      ctx.font = font(fontSize);
      ctx.fillText(m.str, 0, 0);
    }
    ctx.restore();
  }

  if (o.grain > 0) applyGrain(canvas, o.grain, o.seed);
  return cropToInk(canvas, Math.round(4 * scale));
}

function applyGrain(c: HTMLCanvasElement, amount: number, seed: number) {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const rand = mulberry32(seed);
  for (let i = 3; i < img.data.length; i += 4) {
    if (!img.data[i]) continue;
    img.data[i] = img.data[i] * (1 - amount * rand());
  }
  ctx.putImageData(img, 0, 0);
}

/** Crops transparent margins (keeps `pad` px). */
export function cropToInk(c: HTMLCanvasElement, pad = 4): HTMLCanvasElement {
  const ctx = c.getContext('2d')!;
  const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return c;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Recolours every non-transparent pixel, keeping its alpha. */
export function recolor(c: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = makeCanvas(c.width, c.height);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(c, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const [r, g, b] = hexToRgb(color);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Characters offered in the "My handwriting" capture grid. */
export const CAPTURE_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'"-:;()/@&₦$#%+='.split('');
