import { describe, expect, it } from 'vitest';
import { placeOnRotatedPage } from '../src/editor/export';
import { parseRange } from '../src/editor/editor';

const box = { x: 0, y: 0, width: 600, height: 800 };
describe('placing overlays on rotated pages', () => {
  it('unrotated: flips the y axis', () => {
    expect(placeOnRotatedPage(0, box, 10, 20, 30)).toEqual({ x: 10, y: 750, rotate: 0 });
  });
  it('90°: display x runs along user y', () => {
    // displayed page is 800 x 600; image bottom-left at display (10, 50)
    expect(placeOnRotatedPage(90, box, 10, 20, 30)).toEqual({ x: 50, y: 10, rotate: 90 });
  });
  it('180° and 270°', () => {
    expect(placeOnRotatedPage(180, box, 10, 20, 30)).toEqual({ x: 590, y: 50, rotate: 180 });
    expect(placeOnRotatedPage(270, box, 10, 20, 30)).toEqual({ x: 550, y: 790, rotate: 270 });
  });
});

describe('page ranges', () => {
  it('parses lists and ranges', () => {
    expect(parseRange('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parseRange('', 3)).toEqual([0, 1, 2]);
    expect(parseRange('8-20', 9)).toEqual([7, 8]);
  });
});
