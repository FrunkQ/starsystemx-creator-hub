// The pixel helpers behind the wordmark, the card labels and the badge art (src/lib/pixel.ts).
import { describe, it, expect } from 'vitest';
import { runs, textRows, gridWidth } from '../src/lib/pixel';

describe('pixels', () => {
  it('merges each row into runs of one character, skipping blanks', () => {
    expect(runs(['##.#', '.o..'])).toEqual([
      { x: 0, y: 0, w: 2, c: '#' },
      { x: 3, y: 0, w: 1, c: '#' },
      { x: 1, y: 1, w: 1, c: 'o' }
    ]);
  });

  it('sets text in the cover font, one blank column between glyphs', () => {
    const rows = textRows('HI');
    expect(rows).toHaveLength(7);
    expect(gridWidth(rows)).toBe(5 + 1 + 5);
    expect(rows[0]).toBe('#...#..###.');
  });

  it('folds onto the alphabet the font has', () => {
    expect(textRows('hi')).toEqual(textRows('HI'));
  });
});
