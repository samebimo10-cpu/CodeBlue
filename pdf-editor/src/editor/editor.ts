import {
  Ellipse, FabricImage, FabricObject, IText, Line, Path, PencilBrush, Point, Rect, Textbox, filters, util,
  type Canvas, type TPointerEventInfo,
} from 'fabric';
import { History } from './history';
import { PageView, type ClassifySettings } from './pageview';
import { MASK_SCALE, PAPER, displaySize, newPage, type PageModel, type SourceDoc } from './model';
import { eraseCircle, eraseRect, type EraseMode, type Classification } from './classify';
import { BLEND_MODES, SERIAL_PROPS, inkKindOf, touches } from './objects';
import { exportPdf, serializeObjects } from './export';
import { extractInk, type TakeMode } from './ink';
import { loadPdf, renderPage, type TextBox } from '../lib/pdfjs';
import { HAND_STYLES, TYPED_FONTS, isHandwritingFamily } from '../handwriting/styles';
import { icon } from '../lib/icons';
import { db } from '../lib/db';
import { saveFile } from '../lib/save';
import { ensureFont } from '../fonts';
import {
  busy, confirmDialog, field, h, loadImage, makeCanvas, modal, pickFile, readAsDataURL, rgbToHex, selectEl, toast, uid,
} from '../lib/util';

export type Tool =
  | 'select' | 'hand' | 'text' | 'edittext' | 'pen' | 'highlight'
  | 'rect' | 'ellipse' | 'line' | 'arrow' | 'eraser' | 'capture';

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: 'select' },
  { id: 'hand', label: 'Pan', icon: 'hand' },
  { id: 'edittext', label: 'Edit text', icon: 'edittext' },
  { id: 'text', label: 'Add text', icon: 'text' },
  { id: 'pen', label: 'Pen', icon: 'pen' },
  { id: 'highlight', label: 'Highlight', icon: 'highlight' },
  { id: 'eraser', label: 'Smart eraser', icon: 'eraser' },
  { id: 'rect', label: 'Box', icon: 'rect' },
  { id: 'ellipse', label: 'Circle', icon: 'ellipse' },
  { id: 'line', label: 'Line', icon: 'line' },
  { id: 'arrow', label: 'Arrow', icon: 'arrow' },
  { id: 'capture', label: 'Take ink', icon: 'capture' },
];

const ERASE_MODES: { id: EraseMode; label: string; hint: string }[] = [
  { id: 'handwritten', label: 'Handwriting', hint: 'Removes pen, pencil, signatures and handwritten notes. Typed text stays.' },
  { id: 'typed', label: 'Typed text', hint: 'Removes printed / typed text. Handwriting and lines stay.' },
  { id: 'ink', label: 'All writing', hint: 'Removes typed and handwritten text, keeps lines, boxes and pictures.' },
  { id: 'area', label: 'Whiteout', hint: 'Paints paper colour over everything under the brush.' },
];

const SWATCHES = ['#141414', '#1b3a9e', '#2563eb', '#c1121f', '#16794a', '#f59e0b', '#7c3aed', '#ffffff'];
const HIGHLIGHTS = ['#fff176', '#a5f3a1', '#9ad7ff', '#ffb3d9', '#ffcc80'];

interface Settings extends ClassifySettings {
  penColor: string; penWidth: number;
  hlColor: string; hlWidth: number;
  strokeColor: string; fillColor: string; strokeWidth: number; fillOn: boolean;
  font: string; fontSize: number; textColor: string;
  eraseMode: EraseMode; eraserSize: number; eraseObjects: boolean;
  showDetect: boolean;
  quality: number;
}

const snap = (o: FabricObject) => ({ o, m: o.calcTransformMatrix(), width: o.width, height: o.height });
type Snap = ReturnType<typeof snap>;

export class Editor {
  readonly el: HTMLElement;
  private stage!: HTMLDivElement;
  private scroller!: HTMLDivElement;
  private toolbar!: HTMLDivElement;
  private props!: HTMLDivElement;
  private drawer!: HTMLDivElement;
  private pageLabel!: HTMLSpanElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private empty!: HTMLDivElement;

  docs = new Map<string, SourceDoc>();
  pages: PageModel[] = [];
  private views = new Map<string, PageView>();
  current = 0;
  zoom = 1;
  private fitWidth = true;
  tool: Tool = 'select';
  fileName = 'document.pdf';
  dirty = false;
  history = new History();
  private gesture = { active: false, at: 0 };
  private thumbs = new Map<string, string>();

  s: Settings = {
    penColor: '#1b3a9e', penWidth: 2.2,
    hlColor: '#fff176', hlWidth: 14,
    strokeColor: '#c1121f', fillColor: '#ffffff', strokeWidth: 2, fillOn: false,
    font: TYPED_FONTS[0][0], fontSize: 14, textColor: '#141414',
    eraseMode: 'handwritten', eraserSize: 14, eraseObjects: true,
    sensitivity: 0.5, colouredIsHandwriting: true,
    showDetect: false,
    quality: 3,
  };

  constructor() {
    this.el = h('section', { class: 'editor' });
    this.build();
    this.history.onChange = () => this.syncHistoryButtons();
    void this.restoreSettings();
    window.addEventListener('resize', () => this.fitWidth && this.fit());
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ───────────────────────────────── UI skeleton ─────────────────────────────────

  private btn(name: string, label: string, onclick: () => void, extra = '') {
    return h('button', { class: 'tb-btn ' + extra, title: label, 'aria-label': label, onclick }, icon(name), h('span', {}, label));
  }

  private build() {
    this.undoBtn = this.btn('undo', 'Undo', () => void this.history.undo());
    this.redoBtn = this.btn('redo', 'Redo', () => void this.history.redo());
    this.pageLabel = h('span', { class: 'page-label' }, '–');
    const top = h('div', { class: 'topbar' },
      this.btn('open', 'Open', () => void this.openPicker()),
      this.btn('save', 'Save PDF', () => void this.save(), 'accent'),
      h('span', { class: 'sep' }),
      this.undoBtn, this.redoBtn,
      h('span', { class: 'sep' }),
      this.btn('pages', 'Pages', () => this.toggleDrawer()),
      this.btn('image', 'Picture', () => void this.insertImagePicker()),
      this.btn('pdfimg', 'PDF as picture', () => void this.insertPdfAsImage()),
      this.btn('sign', 'Signature', () => void this.signaturePad()),
      this.btn('library', 'My ink', () => void this.libraryDialog()),
      h('span', { class: 'grow' }),
      h('div', { class: 'pager' },
        this.btn('prev', 'Previous page', () => this.goto(this.current - 1), 'icon-only'),
        this.pageLabel,
        this.btn('next', 'Next page', () => this.goto(this.current + 1), 'icon-only')),
      h('div', { class: 'zoomer' },
        this.btn('zoomout', 'Zoom out', () => this.setZoom(this.zoom / 1.2), 'icon-only'),
        this.btn('fit', 'Fit width', () => { this.fitWidth = true; this.fit(); }, 'icon-only'),
        this.btn('zoomin', 'Zoom in', () => this.setZoom(this.zoom * 1.2), 'icon-only')),
    );
    this.toolbar = h('div', { class: 'toolbar', role: 'toolbar' });
    for (const t of TOOLS) {
      this.toolbar.append(h('button', {
        class: 'tool', 'data-tool': t.id, title: t.label, 'aria-label': t.label, onclick: () => this.setTool(t.id),
      }, icon(t.icon), h('span', {}, t.label)));
    }
    this.props = h('div', { class: 'props' });
    this.stage = h('div', { class: 'stage' });
    this.empty = h('div', { class: 'empty' },
      h('div', { class: 'empty-card' },
        icon('editor', 48),
        h('h2', {}, 'Open a PDF to start editing'),
        h('p', {}, 'Everything happens on this device — no internet needed, nothing is uploaded.'),
        h('div', { class: 'row center' },
          h('button', { class: 'btn primary', onclick: () => void this.openPicker() }, icon('open'), 'Open PDF'),
          h('button', { class: 'btn', onclick: () => this.newBlank() }, icon('blank'), 'Blank page'),
          h('button', { class: 'btn', onclick: () => void this.imagesToPdf() }, icon('image'), 'Photos → PDF'))));
    this.scroller = h('div', { class: 'scroller' }, this.stage, this.empty);
    this.drawer = h('div', { class: 'drawer' });
    this.el.append(top, this.toolbar, this.props, h('div', { class: 'workspace' }, this.drawer, this.scroller));
    this.setupGestures();
    this.setupDrop();
    this.setTool('select');
    this.syncHistoryButtons();
  }

  private syncHistoryButtons() {
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    if (this.history.canUndo) this.dirty = true;
  }

  private async restoreSettings() {
    const saved = await db.get<Partial<Settings>>('settings', 'editor').catch(() => undefined);
    if (saved) Object.assign(this.s, saved);
    this.renderProps();
  }
  private persistSettings() {
    void db.put('settings', 'editor', { ...this.s }).catch(() => {});
  }

  // ───────────────────────────────── documents ─────────────────────────────────

  get view(): PageView | null {
    const p = this.pages[this.current];
    return p ? this.viewFor(p) : null;
  }

  private viewFor(p: PageModel): PageView {
    let v = this.views.get(p.id);
    if (!v) {
      v = new PageView(p, this.docs);
      this.wireCanvas(v);
      if (p.pendingObjects) {
        const data = p.pendingObjects;
        p.pendingObjects = null;
        // loadFromJSON clears the canvas background, so put the page back afterwards
        void v.fc.loadFromJSON(data).then(() => { this.applyTool(); v!.refreshComposite(); });
      }
      this.views.set(p.id, v);
    }
    return v;
  }

  async openPicker() {
    const [file] = await pickFile('application/pdf,.pdf');
    if (file) await this.openFile(file);
  }

  async openFile(file: File) {
    if (this.pages.length && this.dirty && !(await confirmDialog('Discard the changes to the current document?', 'Open new'))) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await this.loadSource(bytes, file.name, false);
    if (!doc) return;
    this.reset();
    this.docs.set(doc.key, doc);
    this.fileName = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    await this.appendDocPages(doc, null, 0);
    this.history.clear();
    this.dirty = false;
    this.goto(0);
  }

  private async loadSource(bytes: Uint8Array, name: string, register = true): Promise<SourceDoc | null> {
    let password: string | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const pdf = await busy('Opening ' + name, () => loadPdf(bytes, password));
        const doc: SourceDoc = { key: uid(), name, bytes, pdf };
        if (register) this.docs.set(doc.key, doc);
        return doc;
      } catch (e: any) {
        if (e?.name === 'PasswordException') {
          const pw = await this.askText('This PDF is password protected', 'Password', '', 'password');
          if (pw === undefined) return null;
          password = pw;
          continue;
        }
        toast('Could not open this file: ' + (e?.message ?? e));
        return null;
      }
    }
    return null;
  }

  private async appendDocPages(doc: SourceDoc, indices: number[] | null, at: number) {
    const list = indices ?? Array.from({ length: doc.pdf.numPages }, (_, i) => i);
    const added: PageModel[] = [];
    for (const i of list) {
      const pg = await doc.pdf.getPage(i + 1);
      const [x0, y0, x1, y1] = pg.view;
      added.push(newPage({ kind: 'pdf', doc: doc.key, index: i }, x1 - x0, y1 - y0, pg.rotate));
    }
    this.pages.splice(at, 0, ...added);
    return added;
  }

  newBlank(size: keyof typeof PAPER = 'A4') {
    this.reset();
    const [w, hgt] = PAPER[size];
    this.pages.push(newPage({ kind: 'blank', width: w, height: hgt }, w, hgt));
    this.fileName = 'new-document.pdf';
    this.goto(0);
  }

  /** Make sure there is a page to put things on (used by the other tabs). */
  ensureDocument() {
    if (!this.pages.length) this.newBlank();
  }

  private reset() {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.pages = [];
    this.thumbs.clear();
    for (const d of this.docs.values()) void d.pdf.destroy();
    this.docs.clear();
    this.current = 0;
    this.history.clear();
  }

  async imagesToPdf() {
    const files = await pickFile('image/*', true);
    if (!files.length) return;
    if (!this.pages.length) {
      this.reset();
      this.fileName = 'photos.pdf';
    }
    let first = -1;
    for (const f of files) {
      const url = await readAsDataURL(f);
      const img = await loadImage(url);
      const [w, hgt] = img.width > img.height ? [PAPER.A4[1], PAPER.A4[0]] : PAPER.A4;
      const page = newPage({ kind: 'blank', width: w, height: hgt }, w, hgt);
      this.pages.push(page);
      if (first < 0) first = this.pages.length - 1;
      const v = this.viewFor(page);
      const fi = new FabricImage(img, { data: { kind: 'image' } } as any);
      const sc = Math.min((w - 20) / img.width, (hgt - 20) / img.height);
      fi.scale(sc);
      fi.set({ left: (w - img.width * sc) / 2, top: (hgt - img.height * sc) / 2 });
      v.fc.add(fi);
    }
    this.dirty = true;
    this.goto(first);
  }

  /** Append a new page that holds a single picture filling it (receipts, scans). */
  async addImagePage(url: string, widthPt: number, heightPt: number) {
    if (!this.pages.length) {
      this.reset();
      this.fileName = 'receipt.pdf';
    }
    const page = newPage({ kind: 'blank', width: widthPt, height: heightPt }, widthPt, heightPt);
    const at = this.pages.length;
    this.pages.push(page);
    const v = this.viewFor(page);
    const img = await FabricImage.fromURL(url);
    img.scale(widthPt / img.width);
    img.set({ left: 0, top: 0, data: { kind: 'image' } } as any);
    v.fc.add(img);
    this.dirty = true;
    this.goto(at);
  }

  // ───────────────────────────────── navigation & zoom ─────────────────────────────────

  goto(i: number) {
    if (!this.pages.length) {
      this.stage.replaceChildren();
      this.empty.style.display = '';
      this.pageLabel.textContent = '–';
      this.renderDrawer();
      return;
    }
    i = Math.max(0, Math.min(this.pages.length - 1, i));
    const prev = this.view;
    if (prev && this.pages[i] !== prev.page) {
      prev.fc.discardActiveObject();
      prev.releaseBase();
    }
    this.current = i;
    this.empty.style.display = 'none';
    const v = this.view!;
    this.stage.replaceChildren(v.root);
    this.pageLabel.textContent = `${i + 1} / ${this.pages.length}`;
    if (this.fitWidth) this.fit();
    else v.setZoom(this.zoom);
    void v.renderBase(true);
    this.applyTool();
    this.renderDrawer();
    if (this.s.showDetect) void this.refreshDetection();
  }

  private fit() {
    const v = this.view;
    if (!v) return;
    const avail = this.scroller.clientWidth - (matchMedia('(max-width: 720px)').matches ? 12 : 48);
    // fill the width on phones; on big screens stop at a comfortable reading size
    this.zoom = Math.max(0.2, Math.min(1.6, avail / v.size.width));
    v.setZoom(this.zoom);
  }

  setZoom(z: number, renderNow = true) {
    this.fitWidth = false;
    this.zoom = Math.max(0.2, Math.min(6, z));
    this.view?.setZoom(this.zoom, renderNow);
  }

  private setupGestures() {
    // two-finger pinch-zoom and pan, even while a drawing tool is active
    let start: { d: number; z: number; cx: number; cy: number; sl: number; st: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    this.scroller.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.gesture = { active: true, at: Date.now() };
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        start = { d: dist(e.touches), z: this.zoom, cx, cy, sl: this.scroller.scrollLeft, st: this.scroller.scrollTop };
        const fc = this.view?.fc;
        if (fc?.isDrawingMode) {
          // abandon the half-drawn stroke the first finger started
          (fc as any)._isCurrentlyDrawing = false;
          fc.clearContext(fc.contextTop);
        }
      }
    }, { passive: true, capture: true });
    this.scroller.addEventListener('touchmove', (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = dist(e.touches) / start.d;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const nz = Math.max(0.2, Math.min(6, start.z * ratio));
      const k = nz / start.z;
      const rect = this.scroller.getBoundingClientRect();
      this.setZoom(nz, false);
      this.scroller.scrollLeft = (start.sl + start.cx - rect.left) * k - (cx - rect.left);
      this.scroller.scrollTop = (start.st + start.cy - rect.top) * k - (cy - rect.top);
    }, { passive: false, capture: true });
    const end = (e: TouchEvent) => {
      if (start && e.touches.length < 2) {
        start = null;
        this.gesture = { active: false, at: Date.now() };
        void this.view?.renderBase();
      }
    };
    this.scroller.addEventListener('touchend', end, { capture: true });
    this.scroller.addEventListener('touchcancel', end, { capture: true });
    this.scroller.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });
  }

  private setupDrop() {
    this.el.addEventListener('dragover', (e) => e.preventDefault());
    this.el.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) void this.openFile(f);
      else if (f.type.startsWith('image/')) void readAsDataURL(f).then((u) => this.placeImage(u, 'image'));
    });
  }

  // ───────────────────────────────── tools ─────────────────────────────────

  setTool(t: Tool) {
    this.tool = t;
    for (const b of this.toolbar.querySelectorAll<HTMLElement>('.tool')) b.classList.toggle('active', b.dataset.tool === t);
    this.applyTool();
    this.renderProps();
    if (t === 'eraser' && this.view) void this.prepareClassification();
  }

  private applyTool() {
    const v = this.view;
    if (!v) return;
    const fc = v.fc;
    const t = this.tool;
    fc.isDrawingMode = t === 'pen' || t === 'highlight';
    if (fc.isDrawingMode) {
      const brush = new PencilBrush(fc);
      brush.color = t === 'pen' ? this.s.penColor : this.s.hlColor;
      brush.width = t === 'pen' ? this.s.penWidth : this.s.hlWidth;
      brush.decimate = 0.6;
      if (t === 'highlight') brush.strokeLineCap = 'square';
      fc.freeDrawingBrush = brush;
    }
    fc.selection = t === 'select';
    const textTool = t === 'text' || t === 'edittext';
    for (const o of fc.getObjects()) {
      const isText = o instanceof IText;
      o.selectable = t === 'select' || (textTool && isText);
      o.evented = t === 'select' || (textTool && isText);
    }
    if (t !== 'select' && !textTool) fc.discardActiveObject();
    fc.defaultCursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
    fc.hoverCursor = t === 'select' ? 'move' : fc.defaultCursor;
    fc.wrapperEl.style.pointerEvents = t === 'hand' ? 'none' : '';
    this.scroller.classList.toggle('panning', t === 'hand');
    v.cursor.style.display = 'none';
    fc.requestRenderAll();
  }

  private wireCanvas(v: PageView) {
    const fc = v.fc;
    let before: Snap[] = [];
    let editingText = '';
    let drag: { start: Point; obj?: FabricObject } | null = null;

    fc.on('path:created', (e: any) => {
      const path = e.path as Path;
      if (this.gesture.active || Date.now() - this.gesture.at < 120) {
        fc.remove(path);
        return;
      }
      const hl = this.tool === 'highlight';
      path.set({ data: { kind: hl ? 'highlight' : 'ink' }, selectable: false, evented: false } as any);
      if (hl) path.set({ globalCompositeOperation: 'multiply', opacity: 0.85 });
      this.recordAdd(fc, [path]);
    });
    fc.on('before:transform', (e: any) => {
      const t = e.transform?.target as FabricObject | undefined;
      if (!t) return;
      const objs = t.type === 'activeselection' ? (t as any).getObjects() : [t];
      before = objs.map(snap);
    });
    fc.on('object:modified', () => {
      if (!before.length) return;
      const b = before;
      const a = b.map((s) => snap(s.o));
      before = [];
      this.history.push({
        label: 'Move',
        undo: () => this.restoreSnaps(fc, b),
        redo: () => this.restoreSnaps(fc, a),
      });
    });
    fc.on('text:editing:entered', (e: any) => {
      editingText = (e.target as IText).text ?? '';
    });
    fc.on('text:editing:exited', (e: any) => {
      const t = e.target as IText;
      const now = t.text ?? '';
      if (!now.trim()) {
        this.removeObjects(fc, [t]);
        return;
      }
      if (now !== editingText) {
        const was = editingText;
        this.history.push({
          label: 'Edit text',
          undo: () => { t.set({ text: was }); fc.requestRenderAll(); },
          redo: () => { t.set({ text: now }); fc.requestRenderAll(); },
        });
      }
    });
    fc.on('selection:created', () => this.renderProps());
    fc.on('selection:updated', () => this.renderProps());
    fc.on('selection:cleared', () => this.renderProps());

    fc.on('mouse:down', (e: TPointerEventInfo) => {
      if (this.gesture.active) return;
      const p = e.scenePoint;
      switch (this.tool) {
        case 'text':
          if (e.target instanceof IText) return;
          void this.addTextAt(fc, p);
          break;
        case 'edittext':
          if (e.target instanceof IText) return;
          void this.editExistingText(v, p);
          break;
        case 'rect': case 'ellipse': case 'line': case 'arrow': case 'capture':
          drag = { start: p, obj: this.dragPreview(this.tool, p) };
          if (drag.obj) fc.add(drag.obj);
          break;
        case 'eraser':
          void this.eraseStart(v, p);
          break;
      }
    });
    fc.on('mouse:move', (e: TPointerEventInfo) => {
      const p = e.scenePoint;
      if (this.tool === 'eraser') {
        this.moveCursor(v, p);
        if (this.erasing) this.eraseMove(v, p);
        return;
      }
      if (!drag?.obj) return;
      this.updateDragPreview(drag.obj, drag.start, p);
      fc.requestRenderAll();
    });
    fc.on('mouse:up', (e: TPointerEventInfo) => {
      if (this.tool === 'eraser') {
        this.eraseEnd(v);
        return;
      }
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.obj) fc.remove(d.obj);
      void this.finishDrag(v, d.start, e.scenePoint);
    });
  }

  private restoreSnaps(fc: Canvas, snaps: Snap[]) {
    fc.discardActiveObject();
    for (const s of snaps) {
      s.o.set({ width: s.width, height: s.height });
      util.applyTransformToObject(s.o, s.m);
      s.o.setCoords();
    }
    fc.requestRenderAll();
  }

  recordAdd(fc: Canvas, objs: FabricObject[]) {
    this.dirty = true;
    this.history.push({
      label: 'Add',
      undo: () => { fc.remove(...objs); fc.discardActiveObject(); fc.requestRenderAll(); },
      redo: () => { fc.add(...objs); fc.requestRenderAll(); },
    });
  }

  addObject(fc: Canvas, o: FabricObject, select = true) {
    fc.add(o);
    this.recordAdd(fc, [o]);
    if (select) {
      if (this.tool !== 'select' && !(o instanceof IText)) this.setTool('select');
      fc.setActiveObject(o);
    }
    fc.requestRenderAll();
  }

  removeObjects(fc: Canvas, objs: FabricObject[]) {
    if (!objs.length) return;
    const all = fc.getObjects();
    const idx = objs.map((o) => all.indexOf(o));
    fc.discardActiveObject();
    fc.remove(...objs);
    fc.requestRenderAll();
    this.dirty = true;
    this.history.push({
      label: 'Delete',
      undo: () => {
        objs.forEach((o, k) => fc.insertAt(Math.max(0, idx[k]), o));
        fc.requestRenderAll();
      },
      redo: () => { fc.remove(...objs); fc.requestRenderAll(); },
    });
  }

  private setProps(objs: FabricObject[], props: Record<string, any>) {
    const fc = this.view?.fc;
    if (!fc || !objs.length) return;
    const before = objs.map((o) => Object.fromEntries(Object.keys(props).map((k) => [k, (o as any)[k]])));
    const apply = (vals: Record<string, any>[]) => {
      objs.forEach((o, i) => {
        o.set(vals[i]);
        if (o instanceof FabricImage && 'filters' in vals[i]) o.applyFilters();
        o.setCoords();
      });
      fc.requestRenderAll();
    };
    const after = objs.map(() => props);
    apply(after);
    this.history.push({ label: 'Change', undo: () => apply(before), redo: () => apply(after) });
  }

  private selected(): FabricObject[] {
    const fc = this.view?.fc;
    if (!fc) return [];
    return fc.getActiveObjects();
  }

  // text ────────────────────────────────────────────────

  private async addTextAt(fc: Canvas, p: Point) {
    await ensureFont(this.s.font.replace(/"/g, '').split(',')[0]);
    const t = new Textbox('Type here', {
      left: p.x, top: p.y - this.s.fontSize * 0.6, width: Math.max(120, this.s.fontSize * 12),
      fontFamily: this.s.font, fontSize: this.s.fontSize, fill: this.s.textColor,
      data: { kind: isHandwritingFamily(this.s.font) ? 'handwriting-text' : 'text' },
    } as any);
    fc.add(t);
    this.recordAdd(fc, [t]);
    fc.setActiveObject(t);
    t.enterEditing();
    t.selectAll();
    fc.requestRenderAll();
  }

  /** Replace a run of the PDF's own text with an editable copy, matched in size, style and colour. */
  private async editExistingText(v: PageView, p: Point) {
    const boxes = await v.textBoxes();
    const hit = boxes
      .filter((b) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!hit) {
      toast(boxes.length ? 'Tap directly on a line of text' : 'No editable text here (scanned page?). Use the eraser + Add text instead.');
      return;
    }
    const cls = await busy('Reading page…', () => v.classification(this.s));
    const color = this.sampleTextColour(v, cls, hit);
    const before = this.maskSnapshot(v);
    const ctx = v.page.mask!.getContext('2d', { willReadFrequently: true })!;
    const mask = ctx.getImageData(0, 0, v.page.mask!.width, v.page.mask!.height);
    const pad = 1;
    eraseRect(cls, mask, {
      x: (hit.x - pad) * MASK_SCALE, y: (hit.y - pad) * MASK_SCALE, w: (hit.w + pad * 2) * MASK_SCALE, h: (hit.h + pad * 2) * MASK_SCALE,
    }, 'typed');
    ctx.putImageData(mask, 0, 0);
    v.refreshComposite();
    v.page.maskDirty = true;
    const after = this.maskSnapshot(v);

    const family = hit.family === 'serif' ? TYPED_FONTS[2][0] : hit.family === 'monospace' ? TYPED_FONTS[4][0] : TYPED_FONTS[0][0];
    const fontSize = Math.max(4, Math.round(hit.fontSize * 10) / 10);
    // IText grows with the words instead of wrapping, like editing a line in place
    const t = new IText(hit.str, {
      left: hit.x, top: hit.y + (hit.h - fontSize * 1.13) / 2, fontSize, fontFamily: family,
      fill: color, fontWeight: hit.bold ? 'bold' : 'normal', fontStyle: hit.italic ? 'italic' : 'normal',
      data: { kind: 'text', replaced: true },
    } as any);
    const fc = v.fc;
    fc.add(t);
    this.dirty = true;
    this.history.push({
      label: 'Edit text',
      undo: () => { fc.remove(t); this.putMask(v, before); fc.requestRenderAll(); },
      redo: () => { this.putMask(v, after); fc.add(t); fc.requestRenderAll(); },
    });
    fc.setActiveObject(t);
    t.enterEditing();
    t.selectAll();
    fc.requestRenderAll();
  }

  private sampleTextColour(v: PageView, cls: Classification, b: TextBox) {
    const img = v.clsRaster;
    if (!img) return '#141414';
    let best = 765, col = [20, 20, 20];
    const x0 = Math.floor(b.x * MASK_SCALE), x1 = Math.ceil((b.x + b.w) * MASK_SCALE);
    const y0 = Math.floor(b.y * MASK_SCALE), y1 = Math.ceil((b.y + b.h) * MASK_SCALE);
    for (let y = Math.max(0, y0); y < Math.min(cls.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(cls.width, x1); x++) {
      const i = (y * cls.width + x) * 4;
      const s = img.data[i] + img.data[i + 1] + img.data[i + 2];
      if (s < best) { best = s; col = [img.data[i], img.data[i + 1], img.data[i + 2]]; }
    }
    return rgbToHex(col[0], col[1], col[2]);
  }

  // shapes ────────────────────────────────────────────────

  private dragPreview(t: Tool, p: Point): FabricObject | undefined {
    const common = { left: p.x, top: p.y, stroke: this.s.strokeColor, strokeWidth: this.s.strokeWidth, selectable: false, evented: false, strokeUniform: true } as any;
    if (t === 'rect') return new Rect({ ...common, width: 1, height: 1, fill: this.s.fillOn ? this.s.fillColor : 'transparent' });
    if (t === 'ellipse') return new Ellipse({ ...common, rx: 1, ry: 1, fill: this.s.fillOn ? this.s.fillColor : 'transparent' });
    if (t === 'line' || t === 'arrow') return new Line([p.x, p.y, p.x, p.y], common);
    if (t === 'capture') return new Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(31,79,209,0.08)', stroke: '#1f4fd1', strokeDashArray: [5, 4], strokeWidth: 1, selectable: false, evented: false, strokeUniform: true });
    return undefined;
  }

  private updateDragPreview(o: FabricObject, a: Point, b: Point) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), hh = Math.abs(a.y - b.y);
    if (o instanceof Line) o.set({ x2: b.x, y2: b.y });
    else if (o instanceof Ellipse) o.set({ left: x, top: y, rx: w / 2, ry: hh / 2 });
    else o.set({ left: x, top: y, width: w, height: hh });
    o.setCoords();
  }

  private async finishDrag(v: PageView, a: Point, b: Point) {
    const fc = v.fc;
    const tiny = Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4;
    if (this.tool === 'capture') {
      if (tiny) return toast('Drag a box around the writing you want to take');
      await this.captureFromPage(v, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
      return;
    }
    if (tiny) b = new Point(a.x + 120, a.y + (this.tool === 'line' || this.tool === 'arrow' ? 0 : 70));
    const common = { stroke: this.s.strokeColor, strokeWidth: this.s.strokeWidth, strokeUniform: true, data: { kind: 'shape' } } as any;
    const fill = this.s.fillOn ? this.s.fillColor : 'transparent';
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), hh = Math.abs(a.y - b.y);
    let o: FabricObject;
    if (this.tool === 'rect') o = new Rect({ ...common, left: x, top: y, width: w, height: hh, fill });
    else if (this.tool === 'ellipse') o = new Ellipse({ ...common, left: x, top: y, rx: w / 2, ry: hh / 2, fill });
    else if (this.tool === 'line') o = new Line([a.x, a.y, b.x, b.y], { ...common, strokeLineCap: 'round' });
    else {
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.max(8, this.s.strokeWidth * 5);
      const l = (d: number) => `${b.x - len * Math.cos(ang + d)} ${b.y - len * Math.sin(ang + d)}`;
      o = new Path(`M ${a.x} ${a.y} L ${b.x} ${b.y} M ${l(0.45)} L ${b.x} ${b.y} L ${l(-0.45)}`, {
        ...common, fill: 'transparent', strokeLineCap: 'round', strokeLineJoin: 'round',
      });
    }
    this.addObject(fc, o);
  }

  // smart eraser ────────────────────────────────────────────────

  private erasing: {
    cls: Classification | null; data: ImageData; before: ImageData; last: Point; removed: FabricObject[]; removedAt: number[];
    box: { x0: number; y0: number; x1: number; y1: number };
  } | null = null;

  private async prepareClassification() {
    const v = this.view;
    if (!v || v.page.src.kind !== 'pdf') return null;
    if (v.cls) return v.cls;
    const cls = await busy('Sorting typed text from handwriting…', () => v.classification(this.s));
    if (this.s.showDetect) v.showDetection(true);
    return cls;
  }

  private async refreshDetection() {
    const v = this.view;
    if (!v) return;
    if (this.s.showDetect) await this.prepareClassification();
    v.showDetection(this.s.showDetect);
  }

  private moveCursor(v: PageView, p: Point) {
    const r = this.s.eraserSize * v.zoom;
    Object.assign(v.cursor.style, {
      display: 'block', width: r * 2 + 'px', height: r * 2 + 'px',
      transform: `translate(${p.x * v.zoom - r}px, ${p.y * v.zoom - r}px)`,
    });
  }

  private async eraseStart(v: PageView, p: Point) {
    const mask = v.ensureMask();
    const ctx = mask.getContext('2d', { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, mask.width, mask.height);
    const needCls = this.s.eraseMode !== 'area' && v.page.src.kind === 'pdf';
    this.erasing = {
      cls: needCls ? v.cls : null, data, before: new ImageData(new Uint8ClampedArray(data.data), data.width, data.height),
      last: p, removed: [], removedAt: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    };
    if (needCls && !v.cls) {
      const cls = await this.prepareClassification();
      if (this.erasing) this.erasing.cls = cls;
    }
    if (this.s.eraseMode === 'area' && !this.erasing.cls) {
      // whiteout works on blank pages too: classify as plain paper
      this.erasing.cls = await v.classification(this.s);
    }
    this.eraseMove(v, p, true);
  }

  private eraseMove(v: PageView, p: Point, first = false) {
    const st = this.erasing;
    if (!st) return;
    const r = this.s.eraserSize;
    const steps = first ? 1 : Math.max(1, Math.ceil(st.last.distanceFrom(p) / (r * 0.4)));
    for (let k = 1; k <= steps; k++) {
      const q = first ? p : new Point(st.last.x + ((p.x - st.last.x) * k) / steps, st.last.y + ((p.y - st.last.y) * k) / steps);
      if (st.cls) {
        const b = eraseCircle(st.cls, st.data, q.x * MASK_SCALE, q.y * MASK_SCALE, r * MASK_SCALE, this.s.eraseMode);
        if (b) {
          st.box.x0 = Math.min(st.box.x0, b.x); st.box.y0 = Math.min(st.box.y0, b.y);
          st.box.x1 = Math.max(st.box.x1, b.x + b.w); st.box.y1 = Math.max(st.box.y1, b.y + b.h);
        }
      }
      if (this.s.eraseObjects && this.s.eraseMode !== 'area') {
        const fc = v.fc;
        for (const o of fc.getObjects()) {
          if (st.removed.includes(o)) continue;
          const kind = inkKindOf(o);
          const ok = this.s.eraseMode === 'ink' ? kind !== 'other' : kind === this.s.eraseMode;
          if (ok && touches(o, q, r)) {
            st.removedAt.push(fc.getObjects().indexOf(o));
            st.removed.push(o);
            fc.remove(o);
          }
        }
      }
    }
    st.last = p;
    if (st.box.x1 > st.box.x0) {
      const ctx = v.page.mask!.getContext('2d')!;
      const { x0, y0, x1, y1 } = st.box;
      ctx.putImageData(st.data, 0, 0, x0, y0, x1 - x0, y1 - y0);
      v.refreshComposite({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    v.fc.requestRenderAll();
  }

  private eraseEnd(v: PageView) {
    const st = this.erasing;
    this.erasing = null;
    if (!st) return;
    const fc = v.fc;
    const hasMask = st.box.x1 > st.box.x0;
    if (!hasMask && !st.removed.length) return;
    let before: ImageData | null = null, after: ImageData | null = null, at = { x: 0, y: 0 };
    if (hasMask) {
      const { x0, y0, x1, y1 } = st.box;
      at = { x: x0, y: y0 };
      before = cropImageData(st.before, x0, y0, x1 - x0, y1 - y0);
      after = cropImageData(st.data, x0, y0, x1 - x0, y1 - y0);
      v.page.maskDirty = true;
    }
    const removed = st.removed, removedAt = st.removedAt;
    this.dirty = true;
    this.history.push({
      label: 'Erase',
      undo: () => {
        if (before) { v.page.mask!.getContext('2d')!.putImageData(before, at.x, at.y); v.refreshComposite(); }
        for (let i = removed.length - 1; i >= 0; i--) fc.insertAt(Math.max(0, removedAt[i]), removed[i]);
        fc.requestRenderAll();
      },
      redo: () => {
        if (after) { v.page.mask!.getContext('2d')!.putImageData(after, at.x, at.y); v.refreshComposite(); }
        fc.remove(...removed);
        fc.requestRenderAll();
      },
    });
  }

  private maskSnapshot(v: PageView) {
    const m = v.ensureMask();
    return m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height);
  }
  private putMask(v: PageView, d: ImageData) {
    v.page.mask!.getContext('2d')!.putImageData(d, 0, 0);
    v.refreshComposite();
  }

  async clearPageErasures() {
    const v = this.view;
    if (!v?.page.mask) return;
    const before = this.maskSnapshot(v);
    v.page.mask.getContext('2d')!.clearRect(0, 0, v.page.mask.width, v.page.mask.height);
    v.refreshComposite();
    const after = this.maskSnapshot(v);
    this.history.push({ label: 'Restore', undo: () => this.putMask(v, before), redo: () => this.putMask(v, after) });
  }

  // images, PDFs, handwriting ────────────────────────────────────────────────

  async insertImagePicker() {
    const files = await pickFile('image/*', true);
    for (const f of files) await this.placeImage(await readAsDataURL(f), 'image');
  }

  /** Place an image (data URL) centred on the current page. */
  async placeImage(url: string, kind: string, meta: Record<string, any> = {}, maxFrac = 0.6) {
    this.ensureDocument();
    if (!this.view) this.goto(this.current);
    const v = this.view!;
    const img = await FabricImage.fromURL(url);
    const { width, height } = v.size;
    const nat = meta.naturalWidthPt as number | undefined;
    const sc = nat ? Math.min(nat / img.width, (width * 0.9) / img.width) : Math.min((width * maxFrac) / img.width, (height * maxFrac) / img.height, 1);
    img.scale(sc);
    const vis = this.visibleCenter(v);
    img.set({
      left: vis.x - (img.width * sc) / 2, top: vis.y - (img.height * sc) / 2,
      data: { kind, ...meta },
      globalCompositeOperation: kind === 'handwriting' || kind === 'signature' ? 'multiply' : 'source-over',
    } as any);
    this.setTool('select');
    this.addObject(v.fc, img);
    return img;
  }

  private visibleCenter(v: PageView) {
    const r = v.root.getBoundingClientRect(), s = this.scroller.getBoundingClientRect();
    if (!r.width || !s.width) return new Point(v.size.width / 2, v.size.height / 2); // editor hidden
    const cx = (Math.max(r.left, s.left) + Math.min(r.right, s.right)) / 2 - r.left;
    const cy = (Math.max(r.top, s.top) + Math.min(r.bottom, s.bottom)) / 2 - r.top;
    const { width, height } = v.size;
    return new Point(Math.max(0, Math.min(width, cx / v.zoom)), Math.max(0, Math.min(height, cy / v.zoom)));
  }

  async insertPdfAsImage() {
    const [file] = await pickFile('application/pdf,.pdf');
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await loadPdf(bytes).catch((e) => { toast('Could not open: ' + e.message); return null; });
    if (!pdf) return;
    let pageNo = 1;
    if (pdf.numPages > 1) {
      const pick = await this.pickPdfPage(pdf, 'Which page should be inserted as a picture?');
      if (!pick) return;
      pageNo = pick;
    }
    const url = await busy('Rendering page…', async () => {
      const pg = await pdf.getPage(pageNo);
      const { canvas } = await renderPage(pg, 3);
      return canvas.toDataURL('image/png');
    });
    void pdf.destroy();
    const img = await this.placeImage(url, 'image', { source: 'pdf', name: file.name }, 0.7);
    toast('Tip: set Blend to “Multiply” to let the page underneath show through white areas');
    return img;
  }

  private pickPdfPage(pdf: Awaited<ReturnType<typeof loadPdf>>, title: string): Promise<number | undefined> {
    return modal<number>(title, (body, close) => {
      const grid = h('div', { class: 'thumb-grid' });
      body.append(grid);
      for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
        const cell = h('button', { class: 'thumb-pick', onclick: () => close(i) }, h('span', {}, String(i)));
        grid.append(cell);
        void pdf.getPage(i).then((pg) => renderPage(pg, 0.25)).then(({ canvas }) => cell.prepend(canvas));
      }
    }, { wide: true });
  }

  async signaturePad() {
    const res = await modal<string>('Draw your signature', (body, close) => {
      const pad = makeCanvas(900, 300);
      pad.className = 'sign-pad';
      const ctx = pad.getContext('2d')!;
      let color = '#1b3a9e', width = 5, drawing = false, last: [number, number] | null = null, any = false;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pos = (e: PointerEvent): [number, number] => {
        const r = pad.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height];
      };
      pad.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); });
      pad.addEventListener('pointermove', (e) => {
        if (!drawing || !last) return;
        const p = pos(e);
        const pressure = e.pressure && e.pointerType === 'pen' ? 0.5 + e.pressure : 1;
        ctx.strokeStyle = color; ctx.lineWidth = width * pressure;
        ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
        last = p; any = true;
      });
      pad.addEventListener('pointerup', () => { drawing = false; last = null; });
      const colours = h('div', { class: 'swatches' });
      for (const c of ['#1b3a9e', '#141414', '#c1121f', '#16794a']) {
        colours.append(h('button', { class: 'swatch' + (c === color ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: (e: Event) => {
          color = c;
          colours.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
          (e.currentTarget as HTMLElement).classList.add('on');
        } }));
      }
      const widthIn = h('input', { type: 'range', min: '2', max: '12', value: String(width), oninput: () => (width = +widthIn.value) });
      const saveIt = h('input', { type: 'checkbox', checked: true });
      body.append(pad, h('div', { class: 'row wrap' }, colours, field('Thickness', widthIn), h('label', { class: 'check' }, saveIt, 'Save to My ink')),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', onclick: () => { ctx.clearRect(0, 0, pad.width, pad.height); any = false; } }, 'Clear'),
          h('button', { class: 'btn primary', onclick: async () => {
            if (!any) return toast('Sign in the box first');
            const { cropToInk } = await import('../handwriting/generate');
            const url = cropToInk(pad, 6).toDataURL('image/png');
            if (saveIt.checked) await db.put('snippets', uid(), { id: uid(), name: 'Signature', kind: 'signature', url, created: Date.now() });
            close(url);
          } }, 'Place signature')));
    }, { wide: true });
    if (res) await this.placeImage(res, 'signature', {}, 0.35);
  }

  async libraryDialog() {
    const items = await db.all<{ id: string; name: string; kind: string; url: string; created: number }>('snippets');
    await modal('My ink — saved signatures & handwriting', (body, close) => {
      if (!items.length) {
        body.append(h('p', { class: 'muted' }, 'Nothing saved yet. Use Signature, “Take ink” on a page, or the Handwriting tab to add items.'));
        return;
      }
      const grid = h('div', { class: 'snip-grid' });
      for (const it of items.sort((a, b) => b.created - a.created)) {
        const cell = h('div', { class: 'snip' },
          h('img', { src: it.url, alt: it.name }),
          h('div', { class: 'row' },
            h('button', { class: 'btn small primary', onclick: () => { close(); void this.placeImage(it.url, it.kind === 'signature' ? 'signature' : 'handwriting', {}, 0.4); } }, 'Place'),
            h('button', { class: 'btn small', onclick: async () => { await db.del('snippets', it.id); cell.remove(); } }, 'Delete')));
        grid.append(cell);
      }
      body.append(grid);
    }, { wide: true });
  }

  /** "Take ink": lift handwriting (or typed text) from a region of the page as a recolourable picture. */
  private async captureFromPage(v: PageView, r: { x: number; y: number; w: number; h: number }) {
    const cls = v.page.src.kind === 'pdf' ? await busy('Reading page…', () => v.classification(this.s)) : null;
    const raster = v.clsRaster;
    if (!cls || !raster) return toast('Nothing to take on a blank page');
    let mode = 'handwritten' as TakeMode, color = null as string | null, strength = 0.5;
    const rect = { x: r.x * MASK_SCALE, y: r.y * MASK_SCALE, w: r.w * MASK_SCALE, h: r.h * MASK_SCALE };
    const result = await modal<{ url: string; action: 'place' | 'save' | 'both'; removeOriginal: boolean }>('Take ink from the page', (body, close) => {
      const preview = h('div', { class: 'ink-preview checker' });
      let current: HTMLCanvasElement | null = null;
      const redraw = () => {
        current = extractInk(raster, { mode, color, strength }, rect, cls);
        preview.replaceChildren(current);
      };
      const colorIn = h('input', { type: 'color', value: '#1b3a9e', disabled: true, oninput: () => { color = colorIn.value; redraw(); } });
      const keep = h('input', { type: 'checkbox', checked: true, onchange: () => { colorIn.disabled = keep.checked; color = keep.checked ? null : colorIn.value; redraw(); } });
      const removeOrig = h('input', { type: 'checkbox' });
      body.append(
        preview,
        h('div', { class: 'row wrap' },
          field('Take', selectEl([['handwritten', 'Handwriting only'], ['typed', 'Typed text only'], ['ink', 'All writing']], mode, (m) => { mode = m as TakeMode; redraw(); })),
          field('Strength', h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.5', oninput: (e: Event) => { strength = +(e.target as HTMLInputElement).value; redraw(); } })),
          h('label', { class: 'check' }, keep, 'Keep original colour'),
          field('New colour', colorIn)),
        h('label', { class: 'check' }, removeOrig, 'Also erase it from its original spot (move instead of copy)'),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', onclick: () => current && close({ url: current.toDataURL('image/png'), action: 'save', removeOriginal: false }) }, 'Save to My ink'),
          h('button', { class: 'btn primary', onclick: () => current && close({ url: current.toDataURL('image/png'), action: 'both', removeOriginal: removeOrig.checked }) }, 'Place copy')));
      redraw();
    }, { wide: true });
    if (!result) return;
    await db.put('snippets', uid(), { id: uid(), name: 'Handwriting', kind: 'handwriting', url: result.url, created: Date.now() });
    if (result.action === 'save') return toast('Saved to My ink');
    if (result.removeOriginal) {
      const mask = this.maskSnapshot(v);
      const before = this.maskSnapshot(v);
      eraseRect(cls, mask, rect, mode === 'ink' ? 'ink' : mode);
      this.putMask(v, mask);
      v.page.maskDirty = true;
      this.history.push({ label: 'Move ink', undo: () => this.putMask(v, before), redo: () => this.putMask(v, mask) });
    }
    const img = await this.placeImage(result.url, mode === 'typed' ? 'image' : 'handwriting', {}, 1);
    // keep the original size: the raster is MASK_SCALE px per point
    img.scale(1 / MASK_SCALE);
    img.set({ left: r.x + 12, top: r.y + 12 });
    img.setCoords();
    v.fc.requestRenderAll();
  }

  // ───────────────────────────────── properties bar ─────────────────────────────────

  renderProps() {
    const p = this.props;
    p.replaceChildren();
    const sel = this.tool === 'select' || this.tool === 'text' || this.tool === 'edittext' ? this.selected() : [];
    if (sel.length) return this.renderObjectProps(sel);

    const swatchRow = (list: string[], value: string, set: (c: string) => void) => {
      const row = h('div', { class: 'swatches' });
      for (const c of list) row.append(h('button', {
        class: 'swatch' + (c.toLowerCase() === value.toLowerCase() ? ' on' : ''), style: { background: c }, 'aria-label': 'Colour ' + c,
        onclick: () => { set(c); this.persistSettings(); this.applyTool(); this.renderProps(); },
      }));
      const custom = h('input', { type: 'color', value, title: 'Custom colour', oninput: () => { set(custom.value); this.persistSettings(); this.applyTool(); } });
      row.append(custom);
      return row;
    };
    const range = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) =>
      field(label, h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
        oninput: (e: Event) => { set(+(e.target as HTMLInputElement).value); this.applyTool(); },
        onchange: () => this.persistSettings() }));

    switch (this.tool) {
      case 'pen':
        p.append(swatchRow(SWATCHES, this.s.penColor, (c) => (this.s.penColor = c)), range('Thickness', 0.5, 12, 0.1, this.s.penWidth, (v) => (this.s.penWidth = v)));
        break;
      case 'highlight':
        p.append(swatchRow(HIGHLIGHTS, this.s.hlColor, (c) => (this.s.hlColor = c)), range('Width', 4, 40, 1, this.s.hlWidth, (v) => (this.s.hlWidth = v)));
        break;
      case 'rect': case 'ellipse': case 'line': case 'arrow': {
        const fill = h('input', { type: 'checkbox', checked: this.s.fillOn, onchange: () => { this.s.fillOn = fill.checked; this.persistSettings(); } });
        p.append(h('span', { class: 'lbl' }, 'Outline'), swatchRow(SWATCHES, this.s.strokeColor, (c) => (this.s.strokeColor = c)),
          range('Thickness', 0.5, 12, 0.5, this.s.strokeWidth, (v) => (this.s.strokeWidth = v)));
        if (this.tool === 'rect' || this.tool === 'ellipse') {
          p.append(h('label', { class: 'check' }, fill, 'Fill'), h('input', { type: 'color', value: this.s.fillColor, oninput: (e: Event) => { this.s.fillColor = (e.target as HTMLInputElement).value; this.persistSettings(); } }));
        }
        break;
      }
      case 'text':
        p.append(this.fontSelect(this.s.font, (f) => { this.s.font = f; this.persistSettings(); }),
          field('Size', h('input', { type: 'number', min: '4', max: '200', value: String(this.s.fontSize), class: 'num', onchange: (e: Event) => { this.s.fontSize = +(e.target as HTMLInputElement).value || 14; this.persistSettings(); } })),
          swatchRow(SWATCHES, this.s.textColor, (c) => (this.s.textColor = c)),
          h('span', { class: 'hint' }, 'Tap the page where the text should go.'));
        break;
      case 'edittext':
        p.append(h('span', { class: 'hint' }, 'Tap any line of the PDF’s own text to change it. The old words are removed and an editable copy appears in the same size and colour.'));
        break;
      case 'eraser': {
        const modes = h('div', { class: 'seg' });
        for (const m of ERASE_MODES) modes.append(h('button', {
          class: m.id === this.s.eraseMode ? 'on' : '', title: m.hint,
          onclick: () => { this.s.eraseMode = m.id; this.persistSettings(); this.renderProps(); },
        }, m.label));
        const objs = h('input', { type: 'checkbox', checked: this.s.eraseObjects, onchange: () => { this.s.eraseObjects = objs.checked; this.persistSettings(); } });
        const det = h('input', { type: 'checkbox', checked: this.s.showDetect, onchange: () => { this.s.showDetect = det.checked; this.persistSettings(); void this.refreshDetection(); } });
        const col = h('input', { type: 'checkbox', checked: this.s.colouredIsHandwriting, onchange: () => { this.s.colouredIsHandwriting = col.checked; this.persistSettings(); void this.reclassify(); } });
        const sens = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(this.s.sensitivity), onchange: () => { this.s.sensitivity = +sens.value; this.persistSettings(); void this.reclassify(); } });
        p.append(modes,
          range('Size', 3, 60, 1, this.s.eraserSize, (v) => (this.s.eraserSize = v)),
          h('label', { class: 'check', title: 'Also remove added pen strokes / text boxes of the chosen kind' }, objs, 'Added items too'),
          h('label', { class: 'check' }, det, 'Show what’s what'),
          h('details', { class: 'more' }, h('summary', {}, 'Tuning'),
            h('div', { class: 'row wrap' },
              field('Sensitivity', sens),
              h('label', { class: 'check' }, col, 'Coloured ink = handwriting'),
              h('button', { class: 'btn small', onclick: () => void this.clearPageErasures() }, 'Restore page'))),
          h('div', { class: 'legend' + (this.s.showDetect ? '' : ' hidden') },
            h('span', { class: 'k typed' }, 'Typed'), h('span', { class: 'k hand' }, 'Handwritten'), h('span', { class: 'k graphic' }, 'Lines & pictures')),
          h('span', { class: 'hint' }, ERASE_MODES.find((m) => m.id === this.s.eraseMode)!.hint));
        break;
      }
      case 'capture':
        p.append(h('span', { class: 'hint' }, 'Drag a box around handwriting (or a signature) to copy it, recolour it and place it anywhere — or save it to My ink.'));
        break;
      case 'hand':
        p.append(h('span', { class: 'hint' }, 'Drag to move around the page. Pinch with two fingers to zoom.'));
        break;
      default:
        p.append(h('span', { class: 'hint' }, 'Tap an item to move, resize or style it. Use the tools above to write, draw, erase or add pictures.'));
    }
  }

  private fontSelect(value: string, onchange: (v: string) => void) {
    const opts: [string, string][] = [
      ...TYPED_FONTS,
      ...HAND_STYLES.map((s) => [`"${s.family}"`, '✍ ' + s.name] as [string, string]),
    ];
    if (!opts.some(([v]) => v === value)) opts.unshift([value, value.replace(/"/g, '').split(',')[0]]);
    return field('Font', selectEl(opts, value, async (v) => {
      await ensureFont(v.replace(/"/g, '').split(',')[0]);
      onchange(v);
    }));
  }

  private renderObjectProps(sel: FabricObject[]) {
    const p = this.props;
    const o = sel[0];
    const fc = this.view!.fc;
    const texts = sel.filter((x): x is IText => x instanceof IText);
    if (texts.length) {
      const t = texts[0];
      p.append(
        this.fontSelect(String(t.fontFamily), (f) => this.setProps(texts, { fontFamily: f, data: { ...(t as any).data, kind: isHandwritingFamily(f) ? 'handwriting-text' : 'text' } })),
        field('Size', h('input', { type: 'number', class: 'num', min: '4', max: '300', value: String(Math.round((t.fontSize ?? 14) * 10) / 10),
          onchange: (e: Event) => this.setProps(texts, { fontSize: +(e.target as HTMLInputElement).value || 14 }) })),
        h('input', { type: 'color', value: toHex(String(t.fill)), title: 'Text colour', oninput: (e: Event) => this.setProps(texts, { fill: (e.target as HTMLInputElement).value }) }),
        h('div', { class: 'seg' },
          h('button', { class: t.fontWeight === 'bold' ? 'on' : '', onclick: () => { this.setProps(texts, { fontWeight: t.fontWeight === 'bold' ? 'normal' : 'bold' }); this.renderProps(); } }, h('b', {}, 'B')),
          h('button', { class: t.fontStyle === 'italic' ? 'on' : '', onclick: () => { this.setProps(texts, { fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' }); this.renderProps(); } }, h('i', {}, 'I')),
          h('button', { class: t.underline ? 'on' : '', onclick: () => { this.setProps(texts, { underline: !t.underline }); this.renderProps(); } }, h('u', {}, 'U'))),
        selectEl([['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']], String(t.textAlign), (a) => this.setProps(texts, { textAlign: a })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.backgroundColor && t.backgroundColor !== 'transparent',
          onchange: (e: Event) => this.setProps(texts, { backgroundColor: (e.target as HTMLInputElement).checked ? '#ffffff' : '' }) }), 'White box'),
      );
    }
    const shapes = sel.filter((x) => !(x instanceof IText) && !(x instanceof FabricImage));
    if (shapes.length) {
      const s = shapes[0];
      p.append(
        h('span', { class: 'lbl' }, 'Colour'),
        h('input', { type: 'color', value: toHex(String(s.stroke ?? '#000')), oninput: (e: Event) => this.setProps(shapes, { stroke: (e.target as HTMLInputElement).value }) }),
        field('Thickness', h('input', { type: 'range', min: '0.5', max: '40', step: '0.5', value: String(s.strokeWidth ?? 1),
          onchange: (e: Event) => this.setProps(shapes, { strokeWidth: +(e.target as HTMLInputElement).value }) })),
      );
      if (s instanceof Rect || s instanceof Ellipse) {
        const filled = !!s.fill && s.fill !== 'transparent';
        p.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: filled, onchange: (e: Event) => { this.setProps(shapes, { fill: (e.target as HTMLInputElement).checked ? '#ffffff' : 'transparent' }); this.renderProps(); } }), 'Fill'),
          ...(filled ? [h('input', { type: 'color', value: toHex(String(s.fill)), oninput: (e: Event) => this.setProps(shapes, { fill: (e.target as HTMLInputElement).value }) })] : []));
      }
    }
    const imgs = sel.filter((x): x is FabricImage => x instanceof FabricImage);
    if (imgs.length) {
      const im = imgs[0];
      const hasRemove = im.filters.some((f) => f instanceof filters.RemoveColor);
      const hasGray = im.filters.some((f) => f instanceof filters.Grayscale);
      const tint = im.filters.find((f) => f instanceof filters.BlendColor) as any;
      const setFilters = (kind: 'remove' | 'gray' | 'tint', on: boolean, color?: string) => {
        const next = im.filters.filter((f) => !(kind === 'remove' ? f instanceof filters.RemoveColor : kind === 'gray' ? f instanceof filters.Grayscale : f instanceof filters.BlendColor));
        if (on) next.push(kind === 'remove' ? new filters.RemoveColor({ color: '#FFFFFF', distance: 0.12 }) : kind === 'gray' ? new filters.Grayscale() : new filters.BlendColor({ color: color ?? '#1b3a9e', mode: 'tint', alpha: 1 }));
        this.setProps([im], { filters: next });
        this.renderProps();
      };
      p.append(
        h('label', { class: 'check', title: 'Make the white paper around a picture or scanned page see-through' }, h('input', { type: 'checkbox', checked: hasRemove, onchange: (e: Event) => setFilters('remove', (e.target as HTMLInputElement).checked) }), 'Remove white'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: hasGray, onchange: (e: Event) => setFilters('gray', (e.target as HTMLInputElement).checked) }), 'Black & white'),
        h('label', { class: 'check', title: 'Recolour ink (handwriting, signatures, logos)' }, h('input', { type: 'checkbox', checked: !!tint, onchange: (e: Event) => setFilters('tint', (e.target as HTMLInputElement).checked) }), 'Recolour'),
        ...(tint ? [h('input', { type: 'color', value: toHex(tint.color), oninput: (e: Event) => setFilters('tint', true, (e.target as HTMLInputElement).value) })] : []),
      );
    }
    // common: blend, opacity, order, duplicate, delete
    p.append(
      field('Blend', selectEl(BLEND_MODES, o.globalCompositeOperation ?? 'source-over', (b) => this.setProps(sel, { globalCompositeOperation: b }))),
      field('Opacity', h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(o.opacity ?? 1),
        onchange: (e: Event) => this.setProps(sel, { opacity: +(e.target as HTMLInputElement).value }) })),
      h('div', { class: 'row tight' },
        this.btn('front', 'Bring to front', () => { sel.forEach((x) => fc.bringObjectToFront(x)); fc.requestRenderAll(); }, 'icon-only'),
        this.btn('back', 'Send to back', () => { sel.forEach((x) => fc.sendObjectToBack(x)); fc.requestRenderAll(); }, 'icon-only'),
        this.btn('copy', 'Duplicate', () => void this.duplicateSelection(), 'icon-only'),
        this.btn('trash', 'Delete', () => this.removeObjects(fc, sel), 'icon-only danger')),
    );
  }

  private async duplicateSelection() {
    const fc = this.view?.fc;
    if (!fc) return;
    const sel = fc.getActiveObjects();
    if (!sel.length) return;
    fc.discardActiveObject();
    const copies: FabricObject[] = [];
    for (const o of sel) {
      const c = await o.clone(SERIAL_PROPS);
      c.set({ left: (c.left ?? 0) + 14, top: (c.top ?? 0) + 14 });
      copies.push(c);
      fc.add(c);
    }
    this.recordAdd(fc, copies);
    fc.setActiveObject(copies[0]);
    fc.requestRenderAll();
  }

  private async reclassify() {
    for (const v of this.views.values()) v.resetClassification();
    if (this.tool === 'eraser' || this.s.showDetect) {
      await this.prepareClassification();
      this.view?.showDetection(this.s.showDetect);
    }
  }

  // ───────────────────────────────── pages drawer ─────────────────────────────────

  toggleDrawer(force?: boolean) {
    const open = force ?? !this.drawer.classList.contains('open');
    this.drawer.classList.toggle('open', open);
    if (open) this.renderDrawer();
  }

  private renderDrawer() {
    if (!this.drawer.classList.contains('open')) return;
    const d = this.drawer;
    d.replaceChildren(h('div', { class: 'drawer-head' },
      h('strong', {}, `Pages (${this.pages.length})`),
      h('button', { class: 'icon-btn', 'aria-label': 'Close pages', onclick: () => this.toggleDrawer(false) }, icon('close'))),
    h('div', { class: 'drawer-actions' },
      h('button', { class: 'btn small', onclick: () => this.insertBlank() }, icon('blank', 16), 'Blank page'),
      h('button', { class: 'btn small', onclick: () => void this.insertPdfPages() }, icon('merge', 16), 'Add PDF pages'),
      h('button', { class: 'btn small', onclick: () => void this.imagesToPdf() }, icon('image', 16), 'Photos as pages')));
    const list = h('div', { class: 'thumbs' });
    d.append(list);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const el = e.target as HTMLElement;
        io.unobserve(el);
        void this.thumb(this.pages.find((p) => p.id === el.dataset.id)!).then((url) => {
          const img = el.querySelector('img');
          if (img && url) img.src = url;
        });
      }
    }, { root: d });
    this.pages.forEach((p, i) => {
      const { width, height } = displaySize(p);
      const item = h('div', { class: 'thumb' + (i === this.current ? ' current' : ''), 'data-id': p.id },
        h('button', { class: 'thumb-img', style: { aspectRatio: `${width} / ${height}` }, onclick: () => this.goto(i), 'aria-label': 'Go to page ' + (i + 1) }, h('img', { alt: '' })),
        h('div', { class: 'thumb-bar' },
          h('span', { class: 'num' }, String(i + 1)),
          this.btn('up', 'Move up', () => this.movePage(i, -1), 'icon-only xs'),
          this.btn('down', 'Move down', () => this.movePage(i, 1), 'icon-only xs'),
          this.btn('rotate', 'Rotate', () => this.rotatePage(i), 'icon-only xs'),
          this.btn('copy', 'Duplicate', () => this.duplicatePage(i), 'icon-only xs'),
          this.btn('trash', 'Delete page', () => this.deletePage(i), 'icon-only xs danger')));
      list.append(item);
      io.observe(item);
    });
  }

  private async thumb(p: PageModel): Promise<string> {
    const key = p.id + ':' + p.rotation;
    if (this.thumbs.has(key)) return this.thumbs.get(key)!;
    let url = '';
    if (p.src.kind === 'pdf') {
      const pg = await this.docs.get(p.src.doc)!.pdf.getPage(p.src.index + 1);
      url = (await renderPage(pg, 140 / displaySize(p).width, p.rotation)).canvas.toDataURL('image/jpeg', 0.7);
    } else {
      const { width, height } = displaySize(p);
      const c = makeCanvas(140, (140 * height) / width);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      url = c.toDataURL();
    }
    this.thumbs.set(key, url);
    return url;
  }

  private pageOp(label: string, apply: () => void, revert: () => void, gotoAfter: () => number) {
    apply();
    this.dirty = true;
    this.goto(gotoAfter());
    this.history.push({
      label,
      undo: () => { revert(); this.goto(Math.min(this.current, this.pages.length - 1)); },
      redo: () => { apply(); this.goto(gotoAfter()); },
    });
  }

  movePage(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= this.pages.length) return;
    const swap = () => { [this.pages[i], this.pages[j]] = [this.pages[j], this.pages[i]]; };
    this.pageOp('Move page', swap, swap, () => j);
  }

  deletePage(i: number) {
    if (this.pages.length === 1) return toast('A document needs at least one page');
    const page = this.pages[i];
    this.pageOp('Delete page', () => this.pages.splice(i, 1), () => this.pages.splice(i, 0, page), () => Math.min(i, this.pages.length - 1));
  }

  duplicatePage(i: number) {
    const src = this.pages[i];
    const copy: PageModel = { ...src, id: uid(), mask: null, pendingObjects: null };
    if (src.mask) {
      copy.mask = makeCanvas(src.mask.width, src.mask.height);
      copy.mask.getContext('2d')!.drawImage(src.mask, 0, 0);
    }
    const v = this.views.get(src.id);
    copy.pendingObjects = v ? serializeObjects(v.fc) : src.pendingObjects;
    this.pageOp('Duplicate page', () => this.pages.splice(i + 1, 0, copy), () => this.pages.splice(i + 1, 1), () => i + 1);
  }

  insertBlank() {
    const cur = this.pages[this.current];
    const { width, height } = cur ? displaySize(cur) : { width: PAPER.A4[0], height: PAPER.A4[1] };
    const page = newPage({ kind: 'blank', width, height }, width, height);
    const at = this.pages.length ? this.current + 1 : 0;
    this.pageOp('Add page', () => this.pages.splice(at, 0, page), () => this.pages.splice(at, 1), () => at);
  }

  async insertPdfPages() {
    const [file] = await pickFile('application/pdf,.pdf');
    if (!file) return;
    const doc = await this.loadSource(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!doc) return;
    let indices: number[] | null = null;
    if (doc.pdf.numPages > 1) {
      const spec = await this.askText(`“${file.name}” has ${doc.pdf.numPages} pages`, 'Pages to add (e.g. 1-3, 5) — leave empty for all', '');
      if (spec === undefined) return;
      indices = parseRange(spec, doc.pdf.numPages);
    }
    const at = this.pages.length ? this.current + 1 : 0;
    const added = await this.appendDocPages(doc, indices, at);
    this.pages.splice(at, added.length); // re-applied by pageOp
    this.pageOp('Add pages', () => this.pages.splice(at, 0, ...added), () => this.pages.splice(at, added.length), () => at);
    toast(`Added ${added.length} page${added.length === 1 ? '' : 's'}`);
  }

  rotatePage(i: number, dir: 1 | -1 = 1) {
    const page = this.pages[i];
    const rotate = (d: 1 | -1) => {
      const old = displaySize(page);
      page.rotation = (page.rotation + (d === 1 ? 90 : 270)) % 360;
      const v = this.views.get(page.id);
      if (page.mask) {
        const m = makeCanvas(page.mask.height, page.mask.width);
        const ctx = m.getContext('2d')!;
        ctx.translate(m.width / 2, m.height / 2);
        ctx.rotate((d * Math.PI) / 2);
        ctx.drawImage(page.mask, -page.mask.width / 2, -page.mask.height / 2);
        if (v) v.replaceMask(m);
        else page.mask = m;
      }
      if (v) {
        for (const o of v.fc.getObjects()) {
          const c = o.getCenterPoint();
          const nc = d === 1 ? new Point(old.height - c.y, c.x) : new Point(c.y, old.width - c.x);
          o.rotate(((o.angle ?? 0) + d * 90 + 360) % 360);
          o.setPositionByOrigin(nc, 'center', 'center');
          o.setCoords();
        }
        v.invalidate();
      }
    };
    this.pageOp('Rotate page', () => rotate(dir), () => rotate(dir === 1 ? -1 : 1), () => i);
  }

  // ───────────────────────────────── save ─────────────────────────────────

  async buildPdf(): Promise<Uint8Array> {
    this.view?.fc.getActiveObjects().forEach((o) => o instanceof IText && o.isEditing && o.exitEditing());
    return exportPdf({
      pages: this.pages, docs: this.docs, quality: this.s.quality,
      canvasFor: (p) => this.views.get(p.id)?.fc ?? null,
      withoutBackground: (p, fn) => this.views.get(p.id)!.withoutBackground(fn),
    });
  }

  async save() {
    if (!this.pages.length) return toast('Open or create a document first');
    const name = await this.askText('Save PDF', 'File name', this.fileName);
    if (!name) return;
    this.fileName = name.toLowerCase().endsWith('.pdf') ? name : name + '.pdf';
    try {
      const bytes = await busy('Building PDF…', () => this.buildPdf());
      const msg = await saveFile(new Blob([bytes as BlobPart], { type: 'application/pdf' }), this.fileName);
      this.dirty = false;
      toast(msg);
    } catch (e: any) {
      console.error(e);
      toast('Saving failed: ' + (e?.message ?? e));
    }
  }

  askText(title: string, label: string, value: string, type = 'text'): Promise<string | undefined> {
    return modal<string>(title, (body, close) => {
      const input = h('input', { type, value, class: 'wide-input', onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && close(input.value) });
      body.append(field(label, input), h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => close(input.value) }, 'OK')));
      setTimeout(() => input.focus(), 50);
    });
  }

  /** Called when the editor tab becomes visible again. */
  onShow() {
    if (this.fitWidth) this.fit();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.el.isConnected || this.el.offsetParent === null) return;
    const tgt = e.target as HTMLElement;
    const typing = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable;
    const editingText = this.selected().some((o) => o instanceof IText && o.isEditing);
    if (typing || editingText) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); void (e.shiftKey ? this.history.redo() : this.history.undo()); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); void this.history.redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void this.save(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); void this.duplicateSelection(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.view && this.selected().length) { e.preventDefault(); this.removeObjects(this.view.fc, this.selected()); }
    else if (e.key === 'PageDown') this.goto(this.current + 1);
    else if (e.key === 'PageUp') this.goto(this.current - 1);
  }
}

function cropImageData(d: ImageData, x: number, y: number, w: number, hh: number) {
  const out = new ImageData(w, hh);
  for (let r = 0; r < hh; r++) {
    const s = ((y + r) * d.width + x) * 4;
    out.data.set(d.data.subarray(s, s + w * 4), r * w * 4);
  }
  return out;
}

function toHex(c: string) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
  const m = c.match(/\d+/g);
  return m && m.length >= 3 ? rgbToHex(+m[0], +m[1], +m[2]) : '#000000';
}

export function parseRange(spec: string, n: number): number[] {
  if (!spec.trim()) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) continue;
    const a = Math.max(1, +m[1]), b = Math.min(n, m[2] ? +m[2] : +m[1]);
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out;
}
