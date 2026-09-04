// Reading a creator's picture back: the decoder against the encoder, and the fit.
import { describe, it, expect } from 'vitest';
import { encodePng } from '../src/lib/cover/png';
import { decodePng, isPng } from '../src/lib/cover/png-decode';
import { decodeImage, coverFit } from '../src/lib/cover/image';
import { openBundle } from '../src/lib/bundle/open';

function gradient(w: number, h: number): Uint8Array {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    rgb[i] = (x * 255) / (w - 1); rgb[i + 1] = (y * 255) / (h - 1); rgb[i + 2] = 128;
  }
  return rgb;
}

describe('the PNG decoder', () => {
  it('reads back exactly what the encoder wrote', () => {
    const rgb = gradient(37, 23);
    const png = encodePng(37, 23, rgb);
    expect(isPng(png)).toBe(true);
    const d = decodePng(png);
    expect(d.width).toBe(37);
    expect(d.height).toBe(23);
    expect(Array.from(d.rgb)).toEqual(Array.from(rgb));
  });

  it('refuses what it cannot read, loudly', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow('not a PNG');
    expect(decodeImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('fitting a picture to the card', () => {
  it('covers the card and crops the middle, averaging the pixels underneath', () => {
    // A 40x10 picture with the left half red and the right half blue, fitted to a 20x10 card:
    // scale is 1 (height-bound), the middle 20 columns are cropped - 10 red, 10 blue.
    const w = 40, h = 10;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { const x = i % w; rgb[i * 3] = x < 20 ? 255 : 0; rgb[i * 3 + 2] = x < 20 ? 0 : 255; }
    const out = coverFit({ width: w, height: h, rgb }, 20, 10);
    expect(out.width).toBe(20);
    expect(out.rgb[0]).toBe(255);            // first column: red
    expect(out.rgb[(19) * 3 + 2]).toBe(255); // last column: blue
  });

  it('downscales a big picture smoothly rather than by dropping pixels', () => {
    // A 100x100 checkerboard fitted to 10x10 averages to grey everywhere.
    const rgb = new Uint8Array(100 * 100 * 3);
    for (let i = 0; i < 100 * 100; i++) { const v = ((i % 100) + Math.floor(i / 100)) % 2 ? 255 : 0; rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
    const out = coverFit({ width: 100, height: 100, rgb }, 10, 10);
    for (let i = 0; i < 100; i++) expect(Math.abs(out.rgb[i * 3] - 127.5)).toBeLessThan(2);
  });
});

describe('opening a save', () => {
  it('reads a plain json document', () => {
    const o = openBundle(new TextEncoder().encode(JSON.stringify({ bundleFormat: 1, nodes: [] })));
    expect(o.ok && o.doc.bundleFormat).toBe(1);
    expect(o.ok && o.zipped).toBe(false);
  });

  it('says what is wrong with something that is not one', () => {
    const o = openBundle(new TextEncoder().encode('not json'));
    expect(o.ok).toBe(false);
    expect(!o.ok && o.code).toBe('bad-json');
  });
});
