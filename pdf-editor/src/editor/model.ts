import type { PDFDoc } from '../lib/pdfjs';
import { uid } from '../lib/util';

/** Mask raster resolution: pixels per PDF point used for erasing original content. */
export const MASK_SCALE = 2;

export interface SourceDoc {
  key: string;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDoc;
}

export type PageSource =
  | { kind: 'pdf'; doc: string; index: number }
  | { kind: 'blank'; width: number; height: number };

export interface PageModel {
  id: string;
  src: PageSource;
  /** The page's own /Rotate from the file (pdf pages only). */
  baseRotation: number;
  /** Extra rotation the user applied, clockwise, multiple of 90. */
  rotation: number;
  /** Size of the *unrotated* page in points (crop box). */
  rawWidth: number;
  rawHeight: number;
  /** Erase/whiteout layer for original content, MASK_SCALE px per point, displayed orientation. */
  mask: HTMLCanvasElement | null;
  maskDirty: boolean;
  /** Serialized objects for pages whose editor canvas hasn't been created yet. */
  pendingObjects: object | null;
}

export function displaySize(p: PageModel) {
  const r = (p.baseRotation + p.rotation) % 180;
  return r === 0 ? { width: p.rawWidth, height: p.rawHeight } : { width: p.rawHeight, height: p.rawWidth };
}

export function newPage(src: PageSource, rawWidth: number, rawHeight: number, baseRotation = 0): PageModel {
  return {
    id: uid(), src, baseRotation, rotation: 0, rawWidth, rawHeight,
    mask: null, maskDirty: false, pendingObjects: null,
  };
}

export const PAPER = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A5: [419.53, 595.28],
} as const;
