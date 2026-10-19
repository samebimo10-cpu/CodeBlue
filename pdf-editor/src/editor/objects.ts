import { FabricObject, Path, Point, util, type Canvas } from 'fabric';
import { isHandwritingFamily } from '../handwriting/styles';

/** What a placed object counts as for the smart erasers. */
export type InkKind = 'handwritten' | 'typed' | 'other';

export function inkKindOf(o: FabricObject): InkKind {
  const kind = (o as any).data?.kind as string | undefined;
  if (kind === 'ink' || kind === 'handwriting' || kind === 'signature') return 'handwritten';
  if (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text') {
    return isHandwritingFamily(String((o as any).fontFamily ?? '')) ? 'handwritten' : 'typed';
  }
  return 'other';
}

/** Does point p (scene coords) touch object o, within radius r? Paths are tested along the stroke. */
export function touches(o: FabricObject, p: Point, r: number): boolean {
  if (o instanceof Path) {
    const m = o.calcTransformMatrix();
    const off = o.pathOffset;
    const tol = r + (o.strokeWidth ?? 1) / 2;
    let prev: Point | null = null;
    for (const cmd of o.path as any[]) {
      if (cmd.length < 3) continue;
      const pt = util.transformPoint(new Point(cmd[cmd.length - 2] - off.x, cmd[cmd.length - 1] - off.y), m);
      if (prev ? distToSeg(p, prev, pt) <= tol : pt.distanceFrom(p) <= tol) return true;
      prev = pt;
    }
    return false;
  }
  const b = o.getBoundingRect();
  return p.x >= b.left - r && p.x <= b.left + b.width + r && p.y >= b.top - r && p.y <= b.top + b.height + r;
}

function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  let t = len ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const BLEND_MODES: [GlobalCompositeOperation, string][] = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiply (ink on paper)'],
  ['screen', 'Screen'],
  ['overlay', 'Overlay'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
  ['color-dodge', 'Colour dodge'],
  ['color-burn', 'Colour burn'],
  ['hard-light', 'Hard light'],
  ['soft-light', 'Soft light'],
  ['difference', 'Difference'],
  ['exclusion', 'Exclusion'],
];

export const SERIAL_PROPS = ['data', 'selectable', 'evented', 'lockMovementX', 'lockMovementY'];

export function objectsOf(c: Canvas) {
  return c.getObjects();
}
