import { CAPTURE_CHARS, defaultHandOptions, recolor, renderHandwriting, type Glyph, type GlyphSet, type HandOptions } from './generate';
import { HAND_STYLES, INKS } from './styles';
import { extractInk, canvasRaster, type TakeMode } from '../editor/ink';
import { db } from '../lib/db';
import { icon } from '../lib/icons';
import { saveFile } from '../lib/save';
import { ensureFont } from '../fonts';
import { busy, canvasToBlob, field, h, loadImage, makeCanvas, modal, pickFile, readAsDataURL, selectEl, toast, uid } from '../lib/util';

export interface PlaceTarget {
  placeImage(url: string, kind: string, meta?: Record<string, any>, maxFrac?: number): Promise<unknown>;
}

/** The Handwriting tab: generate handwriting, build your own, lift ink from photos, keep a library. */
export class HandwritingPanel {
  readonly el: HTMLElement;
  private o: HandOptions = defaultHandOptions();
  private sets: GlyphSet[] = [];
  private preview!: HTMLDivElement;
  private styleGrid!: HTMLDivElement;
  private lastCanvas: HTMLCanvasElement | null = null;
  private library!: HTMLDivElement;

  constructor(private target: PlaceTarget, private goEditor: () => void) {
    this.el = h('section', { class: 'panel hw' });
    void this.init();
  }

  private async init() {
    await Promise.all(HAND_STYLES.map((s) => ensureFont(s.family)));
    this.sets = await db.all<GlyphSet>('handwriting');
    this.build();
    this.update();
  }

  private build() {
    const text = h('textarea', { rows: 4, value: this.o.text, placeholder: 'Type what should be written…', oninput: () => { this.o.text = text.value; this.update(); } });
    text.value = this.o.text;
    this.styleGrid = h('div', { class: 'style-grid' });
    const inkRow = h('div', { class: 'swatches' });
    for (const ink of INKS) {
      inkRow.append(h('button', {
        class: 'swatch' + (ink.color === this.o.color ? ' on' : ''), title: ink.name, 'aria-label': ink.name, style: { background: ink.color },
        onclick: (e: Event) => {
          this.o.color = ink.color; this.o.grain = ink.grain;
          inkRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
          (e.currentTarget as HTMLElement).classList.add('on');
          colorIn.value = ink.color;
          this.update();
        },
      }));
    }
    const colorIn = h('input', { type: 'color', value: this.o.color, title: 'Any colour', oninput: () => { this.o.color = colorIn.value; this.o.grain = 0; this.update(); } });
    inkRow.append(colorIn);
    const range = (label: string, key: keyof HandOptions, min: number, max: number, step: number) =>
      field(label, h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(this.o[key]),
        oninput: (e: Event) => { (this.o as any)[key] = +(e.target as HTMLInputElement).value; this.update(); } }));

    this.preview = h('div', { class: 'hw-preview checker' });
    this.library = h('div', { class: 'snip-grid' });
    this.el.append(
      h('div', { class: 'panel-grid' },
        h('div', { class: 'card' },
          h('h2', {}, icon('feather'), 'Handwriting generator'),
          field('Text', text),
          h('h4', {}, 'Style'),
          this.styleGrid,
          h('h4', {}, 'Ink'),
          inkRow,
          h('div', { class: 'row wrap' },
            range('Size', 'size', 14, 90, 1),
            range('Slant', 'slant', -20, 30, 1),
            range('Messiness', 'messiness', 0, 1, 0.05),
            range('Line spacing', 'lineSpacing', 0.8, 2.2, 0.05),
            range('Pen (own hand)', 'penWidth', 0.4, 2.5, 0.1),
            field('Wrap width', selectEl([['0', 'No wrap'], ['220', 'Narrow'], ['360', 'Medium'], ['520', 'Wide']], '0', (v) => { this.o.wrap = +v; this.update(); })),
            field('Align', selectEl([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'left', (v) => { this.o.align = v as any; this.update(); }))),
        ),
        h('div', { class: 'card' },
          h('h2', {}, 'Preview'),
          this.preview,
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn', onclick: () => { this.o.seed = Math.floor(Math.random() * 1e6); this.update(); } }, icon('rotate', 16), 'Write it again'),
            h('button', { class: 'btn primary', onclick: () => void this.place() }, icon('editor', 16), 'Place in PDF'),
            h('button', { class: 'btn', onclick: () => void this.saveSnippet() }, icon('library', 16), 'Save to My ink'),
            h('button', { class: 'btn', onclick: () => void this.download() }, icon('download', 16), 'PNG')),
          h('p', { class: 'muted small' }, 'Placed handwriting counts as handwriting for the smart eraser, and blends into the page like real ink.'),
        ),
        h('div', { class: 'card' },
          h('h2', {}, icon('hand2'), 'My handwriting'),
          h('p', { class: 'muted' }, 'Write each letter once (or a few times for natural variety). The generator then writes anything you type in your own hand, in any colour.'),
          h('div', { class: 'set-list' }, ...this.setButtons()),
          h('button', { class: 'btn', onclick: () => void this.editSet(null) }, icon('plus', 16), 'Create my handwriting'),
        ),
        h('div', { class: 'card' },
          h('h2', {}, icon('capture'), 'Take handwriting from a photo'),
          h('p', { class: 'muted' }, 'Photograph a signature, note or handwriting on paper. The paper is removed and only the ink is kept — recolour it and place it anywhere.'),
          h('button', { class: 'btn', onclick: () => void this.fromPhoto() }, icon('image', 16), 'Choose photo / camera'),
        ),
        h('div', { class: 'card span2' },
          h('h2', {}, icon('library'), 'My ink library'),
          this.library,
        ),
      ),
    );
    this.renderStyles();
    void this.renderLibrary();
  }

  private setButtons() {
    return this.sets.map((s) => h('div', { class: 'set-item' },
      h('button', { class: 'chip' + (this.o.style === 'set:' + s.id ? ' on' : ''), onclick: () => { this.o.style = 'set:' + s.id; this.renderStyles(); this.update(); } },
        `✍ ${s.name} (${Object.keys(s.glyphs).length} letters)`),
      h('button', { class: 'btn small', onclick: () => void this.editSet(s) }, 'Edit'),
      h('button', { class: 'btn small', onclick: async () => {
        await db.del('handwriting', s.id);
        this.sets = this.sets.filter((x) => x.id !== s.id);
        if (this.o.style === 'set:' + s.id) this.o.style = 'everyday';
        this.rebuild();
      } }, 'Delete')));
  }

  private rebuild() {
    this.el.replaceChildren();
    this.build();
    this.update();
  }

  private renderStyles() {
    this.styleGrid.replaceChildren();
    const all = [...HAND_STYLES.map((s) => ({ id: s.id, name: s.name })), ...this.sets.map((s) => ({ id: 'set:' + s.id, name: '✍ ' + s.name }))];
    for (const s of all) {
      const sample = renderHandwriting({ ...this.o, text: 'Handwriting', style: s.id, size: 26, wrap: 0, align: 'left', color: '#222', grain: 0 }, this.setFor(s.id), 1.5);
      sample.className = 'style-sample';
      this.styleGrid.append(h('button', {
        class: 'style-card' + (s.id === this.o.style ? ' on' : ''),
        onclick: () => { this.o.style = s.id; this.renderStyles(); this.update(); },
      }, sample, h('span', {}, s.name)));
    }
  }

  private setFor(style: string) {
    return style.startsWith('set:') ? this.sets.find((s) => 'set:' + s.id === style) ?? null : null;
  }

  private update() {
    if (!this.preview) return;
    const c = renderHandwriting(this.o, this.setFor(this.o.style), 2);
    this.lastCanvas = c;
    c.className = 'hw-canvas';
    this.preview.replaceChildren(c);
  }

  private async place() {
    if (!this.o.text.trim() || !this.lastCanvas) return toast('Type something first');
    const c = renderHandwriting(this.o, this.setFor(this.o.style), 4);
    // 4 px per point → keep the chosen size on the page
    this.goEditor();
    await this.target.placeImage(c.toDataURL('image/png'), 'handwriting', { naturalWidthPt: c.width / 4, hand: { ...this.o } });
  }

  private async saveSnippet(url?: string, name = 'Handwriting') {
    const u = url ?? renderHandwriting(this.o, this.setFor(this.o.style), 3).toDataURL('image/png');
    const id = uid();
    await db.put('snippets', id, { id, name, kind: 'handwriting', url: u, created: Date.now() });
    toast('Saved to My ink');
    void this.renderLibrary();
  }

  private async download() {
    const c = renderHandwriting(this.o, this.setFor(this.o.style), 4);
    toast(await saveFile(await canvasToBlob(c), 'handwriting.png'));
  }

  private async renderLibrary() {
    const items = await db.all<{ id: string; name: string; kind: string; url: string; created: number }>('snippets');
    this.library.replaceChildren();
    if (!items.length) {
      this.library.append(h('p', { class: 'muted' }, 'Saved signatures and handwriting appear here.'));
      return;
    }
    for (const it of items.sort((a, b) => b.created - a.created)) {
      const cell = h('div', { class: 'snip' }, h('img', { src: it.url, alt: it.name }),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: async () => { await this.target.placeImage(it.url, it.kind === 'signature' ? 'signature' : 'handwriting', {}, 0.4); this.goEditor(); } }, 'Place'),
          h('button', { class: 'btn small', onclick: async () => { const col = await pickColour(); if (col) await this.saveSnippet(recolor(await urlToCanvas(it.url), col).toDataURL('image/png'), it.name); } }, 'Recolour'),
          h('button', { class: 'btn small', onclick: async () => { await db.del('snippets', it.id); cell.remove(); } }, 'Delete')));
      this.library.append(cell);
    }
  }

  private async fromPhoto() {
    const [file] = await pickFile('image/*');
    if (!file) return;
    const img = await loadImage(await readAsDataURL(file));
    // downscale big phone photos for speed
    const k = Math.min(1, 2400 / Math.max(img.width, img.height));
    const src = makeCanvas(img.width * k, img.height * k);
    src.getContext('2d')!.drawImage(img, 0, 0, src.width, src.height);
    const raster = canvasRaster(src);
    let mode = 'ink' as TakeMode, color = null as string | null, strength = 0.5;
    const { classify } = await import('../editor/classify');
    let cls = await busy('Finding the ink…', async () => classify(raster, [], { sensitivity: 0.5 }));
    await modal('Ink from photo', (body, close) => {
      const preview = h('div', { class: 'ink-preview checker' });
      let current: HTMLCanvasElement | null = null;
      const redraw = () => {
        current = extractInk(raster, { mode, color, strength }, undefined, cls);
        preview.replaceChildren(current);
      };
      const colorIn = h('input', { type: 'color', value: '#1b3a9e', oninput: () => { color = colorIn.value; keep.checked = false; redraw(); } });
      const keep = h('input', { type: 'checkbox', checked: true, onchange: () => { color = keep.checked ? null : colorIn.value; redraw(); } });
      body.append(preview,
        h('div', { class: 'row wrap' },
          field('Keep', selectEl([['ink', 'All ink'], ['handwritten', 'Handwriting only'], ['typed', 'Printed text only']], mode, (m) => { mode = m as TakeMode; redraw(); })),
          field('Strength', h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.5', oninput: (e: Event) => { strength = +(e.target as HTMLInputElement).value; redraw(); },
            onchange: () => { cls = classify(raster, [], { sensitivity: 0.3 + strength * 0.5 }); redraw(); } })),
          h('label', { class: 'check' }, keep, 'Original colour'), field('Colour', colorIn)),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', onclick: () => { if (current) void this.saveSnippet(current.toDataURL('image/png'), 'From photo'); close(); } }, 'Save to My ink'),
          h('button', { class: 'btn primary', onclick: async () => {
            if (!current) return;
            close();
            await this.target.placeImage(current.toDataURL('image/png'), 'handwriting', {}, 0.5);
            this.goEditor();
          } }, 'Place in PDF')));
      redraw();
    }, { wide: true });
  }

  private async editSet(existing: GlyphSet | null) {
    const set: GlyphSet = existing
      ? { ...existing, glyphs: { ...existing.glyphs } }
      : { id: uid(), name: 'My handwriting', glyphs: {}, updated: Date.now() };
    await modal('My handwriting — write each character', (body, close) => {
      const nameIn = h('input', { value: set.name, class: 'wide-input', oninput: () => (set.name = nameIn.value || 'My handwriting') });
      const grid = h('div', { class: 'char-grid' });
      let currentChar = CAPTURE_CHARS.find((c) => !set.glyphs[c]) ?? CAPTURE_CHARS[0];
      const pad = makeCanvas(600, 600);
      pad.className = 'glyph-pad';
      const ctx = pad.getContext('2d')!;
      let strokes: number[][] = [];
      let drawing: number[] | null = null;
      const label = h('div', { class: 'glyph-label' });
      // guide lines: ascender 0.1, x-height 0.42, baseline 0.7, descender 0.9
      const ASC = 0.1, XH = 0.42, BASE = 0.7, DESC = 0.9, EM = BASE - ASC;
      const drawGuides = () => {
        ctx.clearRect(0, 0, 600, 600);
        ctx.lineWidth = 2;
        for (const [y, c, dash] of [[ASC, '#cfd8ea', true], [XH, '#cfd8ea', true], [BASE, '#7a8fbf', false], [DESC, '#cfd8ea', true]] as [number, string, boolean][]) {
          ctx.strokeStyle = c;
          ctx.setLineDash(dash ? [10, 10] : []);
          ctx.beginPath(); ctx.moveTo(0, y * 600); ctx.lineTo(600, y * 600); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = '300px Inter, sans-serif';
        ctx.fillStyle = 'rgba(31,79,209,0.06)';
        ctx.textAlign = 'center';
        ctx.fillText(currentChar, 300, BASE * 600);
        ctx.strokeStyle = '#1b3a9e';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const s of strokes) {
          ctx.beginPath();
          ctx.moveTo(s[0], s[1]);
          for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
          if (s.length === 2) ctx.lineTo(s[0] + 0.1, s[1]);
          ctx.stroke();
        }
      };
      const pos = (e: PointerEvent) => {
        const r = pad.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 600];
      };
      pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); drawing = pos(e); strokes.push(drawing); drawGuides(); });
      pad.addEventListener('pointermove', (e) => { if (!drawing) return; drawing.push(...pos(e)); drawGuides(); });
      pad.addEventListener('pointerup', () => (drawing = null));

      const commit = () => {
        if (!strokes.length) return;
        let minX = Infinity, maxX = -Infinity;
        for (const s of strokes) for (let i = 0; i < s.length; i += 2) { minX = Math.min(minX, s[i]); maxX = Math.max(maxX, s[i]); }
        const em = EM * 600;
        const glyph: Glyph = {
          strokes: strokes.map((s) => s.map((v, i) => Math.round(((i % 2 === 0 ? v - minX : v - BASE * 600) / em) * 1000) / 1000)),
          advance: Math.max(0.12, (maxX - minX) / em + 0.09),
        };
        set.glyphs[currentChar] = [...(set.glyphs[currentChar] ?? []), glyph].slice(-3);
        strokes = [];
      };
      const select = (c: string) => {
        currentChar = c;
        strokes = [];
        const n = set.glyphs[c]?.length ?? 0;
        label.textContent = `Write “${c}” on the line${n ? ` — ${n} saved version${n > 1 ? 's' : ''}, writing again adds variety` : ''}`;
        drawGuides();
        renderGrid();
      };
      const renderGrid = () => {
        grid.replaceChildren(...CAPTURE_CHARS.map((c) => h('button', {
          class: 'char' + (set.glyphs[c] ? ' done' : '') + (c === currentChar ? ' cur' : ''), onclick: () => { commit(); select(c); },
        }, c)));
      };
      const next = () => {
        commit();
        const i = CAPTURE_CHARS.indexOf(currentChar);
        select(CAPTURE_CHARS[(i + 1) % CAPTURE_CHARS.length]);
      };
      body.append(field('Name', nameIn),
        h('div', { class: 'glyph-wrap' },
          h('div', {}, label, pad,
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => { strokes = []; drawGuides(); } }, 'Clear'),
              h('button', { class: 'btn', onclick: () => { delete set.glyphs[currentChar]; strokes = []; select(currentChar); } }, 'Forget letter'),
              h('button', { class: 'btn primary', onclick: next }, 'Next ›'))),
          grid),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', onclick: async () => {
            commit();
            if (!Object.keys(set.glyphs).length) return toast('Write at least one letter');
            set.updated = Date.now();
            await db.put('handwriting', set.id, set);
            this.sets = [...this.sets.filter((s) => s.id !== set.id), set];
            this.o.style = 'set:' + set.id;
            close();
            this.rebuild();
            toast('Saved. Letters you skipped are filled in with the Everyday style.');
          } }, 'Save handwriting')));
      select(currentChar);
    }, { wide: true });
  }
}

async function urlToCanvas(url: string) {
  const img = await loadImage(url);
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

function pickColour(): Promise<string | undefined> {
  return modal<string>('Pick a colour', (body, close) => {
    const row = h('div', { class: 'swatches' });
    for (const ink of INKS) row.append(h('button', { class: 'swatch', title: ink.name, style: { background: ink.color }, onclick: () => close(ink.color) }));
    const any = h('input', { type: 'color', value: '#1b3a9e' });
    body.append(row, h('div', { class: 'row end' }, any, h('button', { class: 'btn primary', onclick: () => close(any.value) }, 'Use colour')));
  });
}
