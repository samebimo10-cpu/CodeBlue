import { Canvas, FabricImage } from 'fabric';
import { classify, paintLabels, type Classification } from './classify';
import { MASK_SCALE, displaySize, type PageModel, type SourceDoc } from './model';
import { getTextBoxes, renderPage, type TextBox } from '../lib/pdfjs';
import { h, makeCanvas } from '../lib/util';

export interface ClassifySettings {
  sensitivity: number;
  colouredIsHandwriting: boolean;
}

/** On-screen view of one page: rendered PDF, erase layer, detection preview and the object canvas. */
export class PageView {
  readonly root: HTMLDivElement;
  readonly base: HTMLCanvasElement;
  readonly detect: HTMLCanvasElement;
  readonly fc: Canvas;
  readonly cursor: HTMLDivElement;
  private renderToken = 0;
  private renderedAt = 0;
  private textBoxCache: TextBox[] | null = null;
  cls: Classification | null = null;
  clsRaster: ImageData | null = null;
  private clsKey = '';
  private clsPromise: Promise<Classification> | null = null;
  zoom = 1;
  /** Page bitmap (PDF render + erase layer) drawn as the object canvas background, so
   *  blend modes like Multiply preview against the real page. */
  private readonly comp = document.createElement('canvas');
  private bgImg: FabricImage | null = null;

  constructor(readonly page: PageModel, private docs: Map<string, SourceDoc>) {
    const { width, height } = displaySize(page);
    this.base = h('canvas', { class: 'layer base' });
    this.detect = h('canvas', { class: 'layer detect' });
    const fabricEl = h('canvas');
    this.cursor = h('div', { class: 'eraser-cursor' });
    this.root = h('div', { class: 'page' }, this.base, this.ensureMask(), h('div', { class: 'layer objects' }, fabricEl), this.detect, this.cursor);
    this.fc = new Canvas(fabricEl, {
      width, height, preserveObjectStacking: true, enableRetinaScaling: true,
      selectionColor: 'rgba(31,79,209,0.12)', selectionBorderColor: '#1f4fd1', stopContextMenu: true,
    });
    this.fc.wrapperEl.classList.add('fabric-wrap');
  }

  get size() {
    return displaySize(this.page);
  }

  ensureMask(): HTMLCanvasElement {
    const { width, height } = displaySize(this.page);
    if (!this.page.mask) {
      this.page.mask = makeCanvas(width * MASK_SCALE, height * MASK_SCALE);
    }
    this.page.mask.classList.add('layer', 'mask');
    return this.page.mask;
  }

  /** Size the layers for a zoom level (CSS px per point). Re-renders the PDF if needed. */
  setZoom(zoom: number, renderNow = true) {
    this.zoom = zoom;
    const { width, height } = this.size;
    const W = Math.round(width * zoom), H = Math.round(height * zoom);
    this.root.style.width = W + 'px';
    this.root.style.height = H + 'px';
    for (const el of [this.base, this.page.mask!, this.detect]) {
      el.style.width = W + 'px';
      el.style.height = H + 'px';
    }
    this.fc.setDimensions({ width: W, height: H });
    this.fc.setZoom(zoom);
    if (renderNow) void this.renderBase();
  }

  async renderBase(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const scale = this.zoom * dpr;
    if (!force && Math.abs(scale - this.renderedAt) < 0.01) return;
    const token = ++this.renderToken;
    const { width, height } = this.size;
    const src = this.page.src;
    let canvas: HTMLCanvasElement;
    if (src.kind === 'pdf') {
      const doc = this.docs.get(src.doc)!;
      const pg = await doc.pdf.getPage(src.index + 1);
      if (token !== this.renderToken) return;
      // iOS limits canvas memory; 16 MP is safe on current devices.
      canvas = (await renderPage(pg, scale, this.page.rotation, 16_000_000)).canvas;
    } else {
      canvas = makeCanvas(width * scale, height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (token !== this.renderToken) return;
    this.base.width = canvas.width;
    this.base.height = canvas.height;
    this.base.getContext('2d')!.drawImage(canvas, 0, 0);
    this.renderedAt = scale;
    this.refreshComposite();
  }

  /** Recompose base + erase layer (optionally only a dirty rect given in mask pixels). */
  refreshComposite(maskRect?: { x: number; y: number; w: number; h: number }) {
    if (this.base.width <= 1 || !this.page.mask) return;
    const s = this.base.width / this.size.width;
    const k = s / MASK_SCALE;
    const full = this.comp.width !== this.base.width || this.comp.height !== this.base.height;
    if (full) {
      this.comp.width = this.base.width;
      this.comp.height = this.base.height;
    }
    const ctx = this.comp.getContext('2d')!;
    let x = 0, y = 0, w = this.comp.width, hh = this.comp.height;
    if (maskRect && !full) {
      x = Math.max(0, Math.floor(maskRect.x * k) - 2);
      y = Math.max(0, Math.floor(maskRect.y * k) - 2);
      w = Math.min(this.comp.width - x, Math.ceil(maskRect.w * k) + 4);
      hh = Math.min(this.comp.height - y, Math.ceil(maskRect.h * k) + 4);
      if (w <= 0 || hh <= 0) return;
    }
    ctx.drawImage(this.base, x, y, w, hh, x, y, w, hh);
    ctx.drawImage(this.page.mask, x / k, y / k, w / k, hh / k, x, y, w, hh);
    if (!this.bgImg || full || this.fc.backgroundImage !== this.bgImg) {
      this.bgImg = new FabricImage(this.comp, { left: 0, top: 0, originX: 'left', originY: 'top', objectCaching: false, selectable: false, evented: false });
      this.fc.backgroundImage = this.bgImg;
    }
    this.bgImg.set({ scaleX: 1 / s, scaleY: 1 / s });
    this.fc.requestRenderAll();
  }

  /** Run fn with the page background removed (for exporting objects only). */
  withoutBackground<T>(fn: () => T): T {
    const bg = this.fc.backgroundImage;
    this.fc.backgroundImage = undefined;
    try {
      return fn();
    } finally {
      this.fc.backgroundImage = bg;
    }
  }

  /** Free the big bitmap while the page is off-screen. */
  releaseBase() {
    this.base.width = this.base.height = 1;
    this.renderedAt = 0;
    this.renderToken++;
  }

  resetClassification() {
    this.cls = null;
    this.clsRaster = null;
    this.clsKey = '';
    this.clsPromise = null;
  }

  replaceMask(m: HTMLCanvasElement) {
    const old = this.root.querySelector('canvas.mask');
    this.page.mask = m;
    this.ensureMask();
    if (old) old.replaceWith(m);
    else this.base.after(m);
    this.comp.width = 0; // force a full recomposite
  }

  invalidate() {
    this.textBoxCache = null;
    this.cls = null;
    this.clsRaster = null;
    this.clsKey = '';
    this.clsPromise = null;
    this.detect.width = this.detect.height = 1;
    this.renderedAt = 0;
  }

  /** Real text runs on the page, in displayed points. */
  async textBoxes(): Promise<TextBox[]> {
    if (this.textBoxCache) return this.textBoxCache;
    const src = this.page.src;
    if (src.kind !== 'pdf') return (this.textBoxCache = []);
    const pg = await this.docs.get(src.doc)!.pdf.getPage(src.index + 1);
    this.textBoxCache = await getTextBoxes(pg, this.page.rotation);
    return this.textBoxCache;
  }

  /** Classify every ink pixel of the original page (cached per settings). */
  classification(s: ClassifySettings): Promise<Classification> {
    const key = `${s.sensitivity.toFixed(2)}|${s.colouredIsHandwriting}`;
    if (this.cls && this.clsKey === key) return Promise.resolve(this.cls);
    if (this.clsPromise && this.clsKey === key) return this.clsPromise;
    this.clsKey = key;
    this.clsPromise = (async () => {
      const { width, height } = this.size;
      let raster: HTMLCanvasElement;
      const src = this.page.src;
      if (src.kind === 'pdf') {
        const pg = await this.docs.get(src.doc)!.pdf.getPage(src.index + 1);
        raster = (await renderPage(pg, MASK_SCALE, this.page.rotation, 40_000_000)).canvas;
      } else {
        raster = makeCanvas(width * MASK_SCALE, height * MASK_SCALE);
        const ctx = raster.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, raster.width, raster.height);
      }
      // the mask is exactly MASK_SCALE px per point; make sure the raster matches it
      const mask = this.ensureMask();
      if (raster.width !== mask.width || raster.height !== mask.height) {
        const fixed = makeCanvas(mask.width, mask.height);
        fixed.getContext('2d')!.drawImage(raster, 0, 0, mask.width, mask.height);
        raster = fixed;
      }
      const img = raster.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, raster.width, raster.height);
      const boxes = (await this.textBoxes()).map((b) => ({
        x: b.x * MASK_SCALE, y: b.y * MASK_SCALE, w: b.w * MASK_SCALE, h: b.h * MASK_SCALE,
      }));
      await new Promise((r) => setTimeout(r, 0)); // let the spinner paint
      const cls = classify(img, boxes, s);
      if (this.clsKey === key) {
        this.cls = cls;
        this.clsRaster = img;
      }
      return cls;
    })();
    return this.clsPromise;
  }

  showDetection(on: boolean) {
    if (!on || !this.cls) {
      this.detect.width = this.detect.height = 1;
      this.detect.style.display = 'none';
      return;
    }
    this.detect.width = this.cls.width;
    this.detect.height = this.cls.height;
    const ctx = this.detect.getContext('2d')!;
    const img = ctx.createImageData(this.cls.width, this.cls.height);
    paintLabels(this.cls, img);
    ctx.putImageData(img, 0, 0);
    this.detect.style.display = 'block';
  }

  destroy() {
    this.fc.dispose();
    this.root.remove();
  }
}
