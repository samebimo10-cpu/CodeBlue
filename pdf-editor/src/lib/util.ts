export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el as T;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Small deterministic PRNG so generated handwriting is stable for a seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  let s = hex.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function readFile(file: Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Opens the system file picker. On phones this offers camera, gallery and files. */
export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not supported');
  return ctx;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  );
}

let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms);
}

export function busy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const el = h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('span', {}, label));
  document.body.append(el);
  return fn().finally(() => el.remove());
}

/** Lightweight modal dialog. Resolves with the value passed to close(). */
export function modal<T = void>(
  title: string,
  build: (body: HTMLElement, close: (v?: T) => void) => void,
  opts: { wide?: boolean } = {},
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const body = h('div', { class: 'modal-body' });
    const backdrop = h('div', { class: 'modal-backdrop' });
    const close = (v?: T) => {
      backdrop.remove();
      resolve(v);
    };
    const box = h(
      'div',
      { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: () => close(), 'aria-label': 'Close' }, '✕')),
      body,
    );
    backdrop.append(box);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
    document.body.append(backdrop);
    build(body, close);
  });
}

export function confirmDialog(message: string, okLabel = 'OK'): Promise<boolean> {
  return modal<boolean>('Please confirm', (body, close) => {
    body.append(
      h('p', {}, message),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => close(true) }, okLabel)),
    );
  }).then((v) => !!v);
}

export function field(label: string, input: HTMLElement, cls = '') {
  return h('label', { class: 'field ' + cls }, h('span', {}, label), input);
}

export function selectEl(options: [string, string][], value: string, onchange: (v: string) => void) {
  const s = h('select', { onchange: () => onchange(s.value) });
  for (const [v, l] of options) s.append(h('option', { value: v, selected: v === value }, l));
  return s;
}
