import { makeCanvas } from '../lib/util';

export type LogoShape = 'circle' | 'rounded' | 'square' | 'shield' | 'hexagon' | 'none';
export type LogoIcon = 'cross' | 'pill' | 'flask' | 'heart' | 'staff' | 'mortar' | 'crown' | 'cutlery' | 'bed' | 'star' | 'leaf' | 'none';

export interface LogoSpec {
  preset: string;
  shape: LogoShape;
  bg: string;
  fg: string;
  icon: LogoIcon;
  /** letters drawn in the mark (initials) */
  text: string;
  ring: boolean;
  layout: 'icon' | 'wide';
  /** wide layout: business name + slogan next to the mark */
  brand: string;
  slogan: string;
  brandColor: string;
  font: 'sans' | 'serif';
}

export const defaultLogo = (): LogoSpec => ({
  preset: 'custom', shape: 'circle', bg: '#1f4fd1', fg: '#ffffff', icon: 'cross', text: '', ring: false,
  layout: 'icon', brand: 'Your Business', slogan: 'Your slogan here', brandColor: '#14213d', font: 'sans',
});

export const LOGO_PRESETS: { name: string; spec: Partial<LogoSpec> }[] = [
  { name: 'Hospital', spec: { preset: 'hospital', shape: 'circle', bg: '#0b6e99', fg: '#ffffff', icon: 'cross', text: '', ring: true, brand: 'Your Hospital', slogan: 'Caring for life' } },
  { name: 'Clinic', spec: { preset: 'clinic', shape: 'rounded', bg: '#e11d48', fg: '#ffffff', icon: 'heart', text: '', ring: false, brand: 'Your Clinic', slogan: 'Family health centre' } },
  { name: 'Medical', spec: { preset: 'medical', shape: 'hexagon', bg: '#0f766e', fg: '#ffffff', icon: 'staff', text: '', ring: false, brand: 'Your Medical Centre', slogan: 'Specialist care' } },
  { name: 'Laboratory', spec: { preset: 'lab', shape: 'rounded', bg: '#6d28d9', fg: '#ffffff', icon: 'flask', text: '', ring: false, brand: 'Your Diagnostics', slogan: 'Accurate results' } },
  { name: 'Pharmacy', spec: { preset: 'pharmacy', shape: 'square', bg: '#16794a', fg: '#ffffff', icon: 'cross', text: '', ring: false, brand: 'Your Pharmacy', slogan: 'Your health, our priority' } },
  { name: 'Drug store', spec: { preset: 'drugstore', shape: 'circle', bg: '#ffffff', fg: '#16794a', icon: 'mortar', text: '', ring: true, brand: 'Your Chemist', slogan: 'Licensed pharmacy' } },
  { name: 'Pharmacy pill', spec: { preset: 'pill', shape: 'rounded', bg: '#0ea5e9', fg: '#ffffff', icon: 'pill', text: '', ring: false, brand: 'Your Pharmacy', slogan: 'Wholesale & retail' } },
  { name: 'Hotel crest', spec: { preset: 'hotel', shape: 'shield', bg: '#1f2937', fg: '#d4a24c', icon: 'crown', text: 'H', ring: false, brand: 'Your Hotel & Suites', slogan: 'Comfort • Class', font: 'serif' } },
  { name: 'Hotel stars', spec: { preset: 'hotel2', shape: 'circle', bg: '#9a6b1f', fg: '#ffffff', icon: 'star', text: '', ring: true, brand: 'Your Hotel', slogan: 'Luxury stays', font: 'serif' } },
  { name: 'Guest house', spec: { preset: 'guesthouse', shape: 'rounded', bg: '#334155', fg: '#fbbf24', icon: 'bed', text: '', ring: false, brand: 'Your Guest House', slogan: 'Home away from home' } },
  { name: 'Restaurant', spec: { preset: 'restaurant', shape: 'circle', bg: '#b45309', fg: '#ffffff', icon: 'cutlery', text: '', ring: false, brand: 'Your Restaurant', slogan: 'Good food, good mood' } },
  { name: 'Initials', spec: { preset: 'initials', shape: 'circle', bg: '#14213d', fg: '#fca311', icon: 'none', text: 'YB', ring: true, brand: 'Your Business', slogan: 'Since 2024' } },
];

const fontFor = (f: LogoSpec['font']) => (f === 'serif' ? 'Merriweather, Georgia, serif' : 'Inter, Helvetica, Arial, sans-serif');

function shapePath(ctx: CanvasRenderingContext2D, shape: LogoShape, s: number) {
  ctx.beginPath();
  const m = s * 0.04;
  switch (shape) {
    case 'circle': ctx.arc(s / 2, s / 2, s / 2 - m, 0, Math.PI * 2); break;
    case 'rounded': ctx.roundRect(m, m, s - 2 * m, s - 2 * m, s * 0.22); break;
    case 'square': ctx.rect(m, m, s - 2 * m, s - 2 * m); break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = s / 2 + (s / 2 - m) * Math.cos(a), y = s / 2 + (s / 2 - m) * Math.sin(a);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      break;
    case 'shield':
      ctx.moveTo(s * 0.5, m);
      ctx.lineTo(s - m * 2, s * 0.16);
      ctx.bezierCurveTo(s - m * 2, s * 0.62, s * 0.78, s * 0.84, s * 0.5, s - m);
      ctx.bezierCurveTo(s * 0.22, s * 0.84, m * 2, s * 0.62, m * 2, s * 0.16);
      ctx.closePath();
      break;
    case 'none': break;
  }
}

/** Draws an icon inside a 100×100 box (already transformed). */
function drawIcon(ctx: CanvasRenderingContext2D, icon: LogoIcon, fg: string, bg: string) {
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const fillPath = (d: string) => ctx.fill(new Path2D(d));
  switch (icon) {
    case 'cross':
      fillPath('M37 12h26v25h25v26H63v25H37V63H12V37h25z');
      break;
    case 'pill': {
      ctx.save();
      ctx.translate(50, 50);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath(); ctx.roundRect(-38, -16, 76, 32, 16); ctx.fill();
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.roundRect(1, -11, 32, 22, [0, 11, 11, 0]); ctx.fill();
      ctx.restore();
      break;
    }
    case 'flask':
      fillPath('M39 10h22v7h-4v21l22 37c3.5 6.5-0.5 13-8 13H27c-7.5 0-11.5-6.5-8-13l22-37V17h-4z');
      ctx.fillStyle = bg;
      fillPath('M33 62h34l7 12c1.5 3 0 5-3 5H29c-3 0-4.5-2-3-5z');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(45, 70, 3, 0, Math.PI * 2); ctx.arc(56, 66, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'heart':
      fillPath('M50 86C20 64 10 50 10 34 10 21 20 12 32 12c8 0 14 4 18 10 4-6 10-10 18-10 12 0 22 9 22 22 0 16-10 30-40 52z');
      ctx.strokeStyle = bg; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(18, 46); ctx.lineTo(36, 46); ctx.lineTo(43, 33); ctx.lineTo(53, 60); ctx.lineTo(60, 46); ctx.lineTo(82, 46); ctx.stroke();
      break;
    case 'staff':
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, 92); ctx.stroke();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(40, 22); ctx.bezierCurveTo(70, 26, 70, 40, 50, 44); ctx.bezierCurveTo(30, 48, 30, 62, 50, 64);
      ctx.bezierCurveTo(68, 66, 66, 78, 52, 82);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(37, 21, 5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'mortar':
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(56, 48); ctx.lineTo(80, 12); ctx.stroke();
      fillPath('M14 46h72c0 18-12 30-26 33v7H40v-7C26 76 14 64 14 46z');
      break;
    case 'crown':
      fillPath('M14 70 18 26l18 20 14-26 14 26 18-20 4 44z');
      ctx.fillRect(14, 74, 72, 9);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(50, 52, 5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'cutlery':
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(30, 12); ctx.lineTo(30, 34); ctx.moveTo(40, 12); ctx.lineTo(40, 34); ctx.moveTo(20, 12); ctx.lineTo(20, 34);
      ctx.moveTo(20, 34); ctx.quadraticCurveTo(30, 46, 40, 34); ctx.moveTo(30, 42); ctx.lineTo(30, 90);
      ctx.stroke();
      fillPath('M66 10c12 6 16 24 12 42h-8v38h-9V12c0-2 3-3 5-2z');
      break;
    case 'bed':
      ctx.fillRect(12, 30, 9, 56);
      ctx.fillRect(12, 60, 76, 12);
      ctx.fillRect(79, 60, 9, 26);
      ctx.beginPath(); ctx.roundRect(26, 46, 18, 12, 5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(48, 44, 40, 14, [10, 4, 0, 0]); ctx.fill();
      break;
    case 'star': {
      const star = (cx: number, cy: number, r: number) => {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
          i ? ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)) : ctx.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
        }
        ctx.closePath(); ctx.fill();
      };
      star(50, 44, 30);
      star(22, 80, 10); star(50, 84, 10); star(78, 80, 10);
      break;
    }
    case 'leaf':
      fillPath('M84 14C40 14 16 34 16 62c0 10 4 18 10 24 4-20 16-36 36-46-16 14-26 30-28 50 34 4 50-30 50-76z');
      break;
    case 'none':
      break;
  }
}

function drawMark(ctx: CanvasRenderingContext2D, spec: LogoSpec, s: number) {
  const hasShape = spec.shape !== 'none';
  if (hasShape) {
    shapePath(ctx, spec.shape, s);
    ctx.fillStyle = spec.bg;
    ctx.fill();
    if (spec.ring) {
      ctx.save();
      ctx.translate(s * 0.07, s * 0.07);
      ctx.scale(0.86, 0.86);
      shapePath(ctx, spec.shape, s);
      ctx.restore();
      ctx.strokeStyle = spec.fg;
      ctx.lineWidth = s * 0.025;
      ctx.stroke();
    }
  }
  const text = spec.text.trim();
  const iconBox = hasShape ? 0.56 : 0.9;
  const withText = text && spec.icon !== 'none';
  ctx.save();
  if (spec.icon !== 'none') {
    const box = s * (withText ? iconBox * 0.62 : iconBox);
    const top = withText ? s * 0.17 : (s - box) / 2;
    ctx.translate((s - box) / 2, top);
    ctx.scale(box / 100, box / 100);
    drawIcon(ctx, spec.icon, spec.fg, hasShape ? spec.bg : '#ffffff');
  }
  ctx.restore();
  if (text) {
    ctx.fillStyle = spec.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = withText ? s * 0.26 : s * (text.length > 2 ? 0.3 : 0.42);
    ctx.font = `800 ${size}px ${fontFor(spec.font)}`;
    ctx.fillText(text, s / 2, withText ? s * 0.7 : s * 0.53, s * 0.8);
  }
}

/** Renders a logo to a transparent canvas. `size` is the height in px. */
export function renderLogo(spec: LogoSpec, size = 512): HTMLCanvasElement {
  if (spec.layout === 'icon') {
    const c = makeCanvas(size, size);
    drawMark(c.getContext('2d')!, spec, size);
    return c;
  }
  const font = fontFor(spec.font);
  const measure = makeCanvas(2, 2).getContext('2d')!;
  measure.font = `800 ${size * 0.34}px ${font}`;
  const w1 = measure.measureText(spec.brand).width;
  measure.font = `400 ${size * 0.16}px ${font}`;
  const w2 = measure.measureText(spec.slogan).width;
  const c = makeCanvas(size * 1.18 + Math.max(w1, w2) + size * 0.1, size);
  const ctx = c.getContext('2d')!;
  drawMark(ctx, spec, size);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = spec.brandColor;
  ctx.font = `800 ${size * 0.34}px ${font}`;
  ctx.fillText(spec.brand, size * 1.14, size * (spec.slogan ? 0.56 : 0.62));
  if (spec.slogan) {
    ctx.globalAlpha = 0.75;
    ctx.font = `400 ${size * 0.16}px ${font}`;
    ctx.fillText(spec.slogan, size * 1.15, size * 0.8);
  }
  return c;
}

export const ICONS: [LogoIcon, string][] = [
  ['cross', 'Medical cross'], ['heart', 'Heart pulse'], ['staff', 'Staff & serpent'], ['flask', 'Lab flask'],
  ['pill', 'Capsule'], ['mortar', 'Mortar & pestle'], ['crown', 'Crown'], ['star', 'Stars'],
  ['bed', 'Bed'], ['cutlery', 'Fork & knife'], ['leaf', 'Leaf'], ['none', 'No icon'],
];
export const SHAPES: [LogoShape, string][] = [
  ['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square'], ['shield', 'Shield'], ['hexagon', 'Hexagon'], ['none', 'No badge'],
];
