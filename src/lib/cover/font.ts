// A 5x7 bitmap font: capitals, digits, and the punctuation a title or a byline can carry.
//
// WHY A BITMAP FONT. There is no font renderer on a Worker, and shipping outline glyphs plus a
// rasteriser for them is a project. Five-by-seven pixels scaled up is honest, legible at the sizes
// a card uses, and reads as deliberate rather than as a failed attempt at Helvetica. Titles are
// set in capitals because that is the alphabet this font has.
//
// Each glyph is seven rows of five characters; `#` is ink. Space is three columns wide.
import type { Raster, RGB } from './raster';

const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  "'": ['.##..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '&': ['.##..', '#..#.', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ' ': ['...', '...', '...', '...', '...', '...', '...']
};

export const GLYPHS = G;
export const GLYPH_H = 7;

/** Fold a string onto the alphabet: capitals, accents stripped, anything unknown becomes a space. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[–—]/g, '-')
    .split('')
    .map((ch) => (G[ch] ? ch : ' '))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const advance = (ch: string) => (G[ch]?.[0].length ?? 3) + 1;

/**
 * FOUR FACES FROM ONE SET OF GLYPHS (owner, 2026-09-04: "choose a different font"). There is one
 * glyph set; the faces are ways of drawing it. `pixel` is the glyph as it is; `bold` paints it
 * twice with a horizontal offset; `outline` paints a halo in the shadow colour first; `wide`
 * stretches every column half as much again. A second glyph set would be data, not code.
 */
export type FontStyle = 'pixel' | 'bold' | 'outline' | 'wide';
const stretch = (style: FontStyle) => (style === 'wide' ? 1.5 : 1);

/** Pixel width of a folded string at `scale`. */
export function textWidth(folded: string, scale: number, style: FontStyle = 'pixel'): number {
  let w = 0;
  for (const ch of folded) w += advance(ch);
  return Math.max(0, w - 1) * scale * stretch(style);
}

export function drawText(
  r: Raster, x: number, y: number, folded: string, scale: number, c: RGB, alpha = 1,
  style: FontStyle = 'pixel', shadow?: RGB
): void {
  const sx = scale * stretch(style);
  const paint = (dx: number, dy: number, colour: RGB, a: number) => {
    let cx = x;
    for (const ch of folded) {
      const rows = G[ch] ?? G[' '];
      for (let row = 0; row < GLYPH_H; row++) {
        for (let col = 0; col < rows[row].length; col++) {
          if (rows[row][col] === '#') r.rect(cx + col * sx + dx, y + row * scale + dy, sx, scale, colour, a);
        }
      }
      cx += advance(ch) * sx;
    }
  };
  // The halo: the glyph in the shadow colour at eight offsets, so words read over anything.
  if (shadow) {
    const d = Math.max(1, scale * 0.45);
    for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]]) paint(ox, oy, shadow, alpha);
  }
  if (style === 'bold') paint(Math.max(1, scale * 0.35), 0, c, alpha);
  paint(0, 0, c, alpha);
}

/** Word-wrap to at most `maxChars` per line and `maxLines` lines; the last line is cut with '...'. */
export function wrapLines(folded: string, maxChars: number, maxLines: number): string[] {
  const words = folded.trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length <= maxChars) { line = candidate; continue; }
    if (line) lines.push(line);
    line = word.length > maxChars ? word.slice(0, maxChars) : word;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines || (lines.length === maxLines && words.join(' ').length > lines.join(' ').length)) {
    lines.length = maxLines;
    // Cut at a word boundary where one exists; a single long word is sliced.
    let last = lines[maxLines - 1];
    while (last.length > maxChars - 3 && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    if (last.length > maxChars - 3) last = last.slice(0, Math.max(0, maxChars - 3));
    lines[maxLines - 1] = last.trimEnd() + '...';
  }
  return lines;
}
