import { BlendMode, PDFDocument, degrees, type PDFPage } from 'pdf-lib';
import { StaticCanvas, type Canvas, type FabricObject } from 'fabric';
import { MASK_SCALE, displaySize, type PageModel, type SourceDoc } from './model';
import { renderPage } from '../lib/pdfjs';
import { canvasToBlob, makeCanvas } from '../lib/util';
import { canvasToPng } from '../lib/png';
import { SERIAL_PROPS } from './objects';

const BLEND: Record<string, BlendMode> = {
  'source-over': BlendMode.Normal,
  multiply: BlendMode.Multiply,
  screen: BlendMode.Screen,
  overlay: BlendMode.Overlay,
  darken: BlendMode.Darken,
  lighten: BlendMode.Lighten,
  'color-dodge': BlendMode.ColorDodge,
  'color-burn': BlendMode.ColorBurn,
  'hard-light': BlendMode.HardLight,
  'soft-light': BlendMode.SoftLight,
  difference: BlendMode.Difference,
  exclusion: BlendMode.Exclusion,
};

export interface ExportInput {
  pages: PageModel[];
  docs: Map<string, SourceDoc>;
  /** Live object canvas for a page if one exists. */
  canvasFor(page: PageModel): Canvas | null;
  /** Wraps work on a live canvas so its page background is left out of the export. */
  withoutBackground?<T>(page: PageModel, fn: () => T): T;
  /** pixels per point used for added objects (3 ≈ 216 dpi) */
  quality: number;
  onProgress?: (done: number, total: number) => void;
}

export interface Placement {
  x: number;
  y: number;
  rotate: number;
}

/**
 * Where to draw an image so it lands on the displayed rectangle (dx,dy,dw,dh – top-left
 * origin, points) of a page whose crop box is (x0,y0,w,h) and which viewers rotate by R.
 */
export function placeOnRotatedPage(R: number, box: { x: number; y: number; width: number; height: number }, dx: number, dy: number, dh: number): Placement {
  const X = dx, Y = dy + dh; // the image's bottom-left corner in display space
  const { x: x0, y: y0, width: w, height: hgt } = box;
  switch (((R % 360) + 360) % 360) {
    case 90: return { x: x0 + Y, y: y0 + X, rotate: 90 };
    case 180: return { x: x0 + w - X, y: y0 + Y, rotate: 180 };
    case 270: return { x: x0 + w - Y, y: y0 + hgt - X, rotate: 270 };
    default: return { x: x0 + X, y: y0 + hgt - Y, rotate: 0 };
  }
}

const pngBytes = canvasToPng;

/** Bounding box of non-transparent pixels. */
function alphaBox(c: HTMLCanvasElement) {
  const { data, width: W, height: H } = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (data[row + x * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function objectCanvas(page: PageModel, input: ExportInput): Promise<{ c: Canvas | StaticCanvas; temp: boolean } | null> {
  const live = input.canvasFor(page);
  if (live) {
    live.discardActiveObject();
    return { c: live, temp: false };
  }
  if (!page.pendingObjects) return null;
  const { width, height } = displaySize(page);
  const sc = new StaticCanvas(makeCanvas(width, height), { width, height, renderOnAddRemove: false });
  await sc.loadFromJSON(page.pendingObjects);
  return { c: sc, temp: true };
}

/** Draws the erase layer and every added object on top of an output page. */
async function drawOverlays(out: PDFDocument, pdfPage: PDFPage, page: PageModel, R: number, input: ExportInput) {
  const box = pdfPage.getCropBox();
  const { width: W, height: H } = displaySize(page);
  const draw = async (canvas: HTMLCanvasElement, dx: number, dy: number, dw: number, dh: number, blend: BlendMode) => {
    const img = await out.embedPng(await pngBytes(canvas));
    const p = placeOnRotatedPage(R, box, dx, dy, dh);
    pdfPage.drawImage(img, { x: p.x, y: p.y, width: dw, height: dh, rotate: degrees(p.rotate), blendMode: blend });
  };

  // 1. erase / whiteout layer
  if (page.mask && page.maskDirty) {
    const b = alphaBox(page.mask);
    if (b) {
      const crop = makeCanvas(b.w, b.h);
      crop.getContext('2d')!.drawImage(page.mask, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      await draw(crop, b.x / MASK_SCALE, b.y / MASK_SCALE, b.w / MASK_SCALE, b.h / MASK_SCALE, BlendMode.Normal);
    }
  }

  // 2. objects, batched into layers that share a blend mode (keeps z-order)
  const oc = await objectCanvas(page, input);
  if (!oc) return;
  const objs = oc.c.getObjects().filter((o) => o.visible !== false);
  const layers: { blend: string; objs: FabricObject[] }[] = [];
  for (const o of objs) {
    const blend = o.globalCompositeOperation in BLEND ? o.globalCompositeOperation : 'source-over';
    const last = layers[layers.length - 1];
    if (last && last.blend === blend) last.objs.push(o);
    else layers.push({ blend, objs: [o] });
  }
  const zoom = oc.c.getZoom();
  const q = input.quality;
  for (const layer of layers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of layer.objs) {
      o.setCoords();
      const b = o.getBoundingRect();
      x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top);
      x1 = Math.max(x1, b.left + b.width); y1 = Math.max(y1, b.top + b.height);
    }
    x0 = Math.max(0, Math.floor(x0 - 2)); y0 = Math.max(0, Math.floor(y0 - 2));
    x1 = Math.min(W, Math.ceil(x1 + 2)); y1 = Math.min(H, Math.ceil(y1 + 2));
    if (x1 <= x0 || y1 <= y0) continue;
    const set = new Set(layer.objs);
    // keep each layer image under ~24 MP
    const qq = Math.min(q, Math.sqrt(24e6 / ((x1 - x0) * (y1 - y0))));
    const render = () => oc.c.toCanvasElement(qq / zoom, {
      left: x0 * zoom, top: y0 * zoom, width: (x1 - x0) * zoom, height: (y1 - y0) * zoom,
      filter: (o: FabricObject) => set.has(o),
    } as any);
    const c = !oc.temp && input.withoutBackground ? input.withoutBackground(page, render) : render();
    await draw(c, x0, y0, x1 - x0, y1 - y0, BLEND[layer.blend] ?? BlendMode.Normal);
  }
  if (oc.temp) oc.c.dispose();
}

export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer('InkDesk PDF');
  out.setCreator('InkDesk PDF');
  const libDocs = new Map<string, PDFDocument | null>();
  const getLib = async (key: string) => {
    if (!libDocs.has(key)) {
      try {
        const d = await PDFDocument.load(input.docs.get(key)!.bytes, { ignoreEncryption: false, updateMetadata: false });
        libDocs.set(key, d);
      } catch {
        libDocs.set(key, null); // encrypted or damaged: fall back to a high-res image of the page
      }
    }
    return libDocs.get(key)!;
  };

  let i = 0;
  for (const page of input.pages) {
    input.onProgress?.(i++, input.pages.length);
    let pdfPage: PDFPage;
    let R: number;
    const src = page.src;
    const lib = src.kind === 'pdf' ? await getLib(src.doc) : null;
    if (src.kind === 'pdf' && lib) {
      [pdfPage] = await out.copyPages(lib, [src.index]);
      out.addPage(pdfPage);
      R = (((pdfPage.getRotation().angle + page.rotation) % 360) + 360) % 360;
      pdfPage.setRotation(degrees(R));
    } else if (src.kind === 'pdf') {
      const { width, height } = displaySize(page);
      const pg = await input.docs.get(src.doc)!.pdf.getPage(src.index + 1);
      const { canvas } = await renderPage(pg, 2.5, page.rotation);
      const jpg = await out.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer()));
      pdfPage = out.addPage([width, height]);
      pdfPage.drawImage(jpg, { x: 0, y: 0, width, height });
      R = 0;
    } else {
      pdfPage = out.addPage([src.width, src.height]);
      R = ((page.rotation % 360) + 360) % 360;
      if (R) pdfPage.setRotation(degrees(R));
    }
    await drawOverlays(out, pdfPage, page, R, input);
  }
  input.onProgress?.(input.pages.length, input.pages.length);
  return out.save();
}

/** Serialise a page's objects (used when duplicating pages). */
export function serializeObjects(c: Canvas | StaticCanvas) {
  const bg = c.backgroundImage;
  c.backgroundImage = undefined;
  try {
    return c.toObject(SERIAL_PROPS);
  } finally {
    c.backgroundImage = bg;
  }
}
