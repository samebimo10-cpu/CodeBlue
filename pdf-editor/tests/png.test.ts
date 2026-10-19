import { describe, expect, it } from 'vitest';
import { bleed } from '../src/lib/png';

describe('colour bleed', () => {
  it('copies neighbour colour into transparent pixels without changing alpha', () => {
    // 3x1: white opaque, transparent, transparent
    const d = new Uint8ClampedArray([250, 240, 200, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    bleed(d, 3, 1, 3);
    expect(Array.from(d.slice(4, 8))).toEqual([250, 240, 200, 0]);
    expect(Array.from(d.slice(8, 12))).toEqual([250, 240, 200, 0]);
  });
});
