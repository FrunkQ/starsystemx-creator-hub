// The two new alphabets (D-46). Rules that catch the faults these actually had.
//
// BOTH FAULTS THIS FILE PINS WERE REAL, and both were found by rendering a card and reading it:
// NARROW's `N` was indistinguishable from `K` at three columns, so "FRUNK" came out "FRUKK"; and
// ROUND's `U` was byte-for-byte its `V`, so "NEIGHBOURHOOD" came out "NEIGHBOVRHOOD". A glyph set
// is data, and data can be checked.
import { describe, it, expect } from 'vitest';
import { ROUND, NARROW } from '../src/lib/cover/families';
import { GLYPHS, GLYPH_H, fold, textWidth, drawText } from '../src/lib/cover/font';
import { Raster } from '../src/lib/cover/raster';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const families: [string, Record<string, string[]>][] = [['round', ROUND], ['narrow', NARROW]];

describe.each(families)('the %s alphabet', (name, family) => {
  it('has every letter and every digit - a missing one silently falls back and looks wrong', () => {
    for (const ch of [...LETTERS, ...DIGITS]) expect(family[ch], name + ' ' + ch).toBeDefined();
  });

  it('is seven rows tall and rectangular, like every other glyph', () => {
    for (const [ch, rows] of Object.entries(family)) {
      expect(rows, ch).toHaveLength(GLYPH_H);
      const w = rows[0].length;
      for (const row of rows) expect(row.length, ch).toBe(w);
    }
  });

  it('uses only ink and space', () => {
    for (const [ch, rows] of Object.entries(family)) {
      for (const row of rows) expect(row, ch).toMatch(/^[#.]+$/);
    }
  });

  // THE ONE THAT MATTERS. Two letters drawn the same are two letters a reader cannot tell apart.
  it('never draws two different characters identically', () => {
    const seen = new Map<string, string>();
    for (const [ch, rows] of Object.entries(family)) {
      if (ch === ' ') continue;
      const key = rows.join('/');
      expect(seen.has(key), name + ': ' + ch + ' is drawn exactly like ' + seen.get(key)).toBe(false);
      seen.set(key, ch);
    }
  });

  it('draws something for every letter, rather than an empty box', () => {
    for (const ch of LETTERS) expect(family[ch].join('').includes('#'), ch).toBe(true);
  });
});

describe('the families are actually different from the base', () => {
  it('or there was no point adding them', () => {
    // A family whose letters all match the base is the complaint that started this: a font control
    // that changes nothing. Well over half of each alphabet has to differ.
    for (const [name, family] of families) {
      const changed = LETTERS.filter((ch) => family[ch].join('/') !== GLYPHS[ch].join('/'));
      expect(changed.length, name).toBeGreaterThan(13);
    }
  });

  it('and narrow really is narrower - it fits more on a line', () => {
    const word = fold('LOCAL NEIGHBOURHOOD');
    expect(textWidth(word, 6, 'narrow')).toBeLessThan(textWidth(word, 6, 'pixel') * 0.75);
  });
});

describe('the renderer takes a family', () => {
  it('draws the family glyph rather than the base one', () => {
    // ROUND's O is a diamond: its top-left corner is empty where the base O's is ink.
    const base = new Raster(30, 20);
    const round = new Raster(30, 20);
    drawText(base, 2, 2, 'O', 2, [255, 255, 255], 1, 'pixel');
    drawText(round, 2, 2, 'O', 2, [255, 255, 255], 1, 'round');
    const px = (r: Raster, x: number, y: number) => r.data[(y * r.width + x) * 3];
    expect(px(base, 4, 2)).toBeGreaterThan(200);
    expect(px(round, 4, 2)).toBeLessThan(60);
  });

  it('falls back to the base set for punctuation nobody redrew', () => {
    const r = new Raster(30, 20);
    expect(() => drawText(r, 2, 2, fold('A-B'), 2, [255, 255, 255], 1, 'narrow')).not.toThrow();
    expect(textWidth(fold('-'), 3, 'narrow')).toBe(textWidth(fold('-'), 3, 'pixel'));
  });
});
