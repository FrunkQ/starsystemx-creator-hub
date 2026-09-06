// WHAT A WORKER CAN AFFORD TO DECODE (D-53).
//
// The owner picked an uploaded picture as a cover background and Cloudflare killed the request:
// "Error 1102 - Worker exceeded resource limits". Measured on the real files afterwards, a 4.9
// megapixel PNG costs 168ms to decode and 25ms to fit, against a free plan's 10ms of CPU - so this
// was never going to work by being asked nicely, and the guesses in the old guards (40 megapixels)
// were an order of magnitude out.
//
// The size therefore has to be read from the HEADER, before anything expensive happens. These tests
// are about that: reading a size without decoding, and refusing what cannot be afforded.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { imageSize, withinDecodeBudget, coverCrop, coverFit, MAX_DECODE_PIXELS, MAX_DECODE_BYTES } from '../src/lib/cover/image';
import { encodePng } from '../src/lib/cover/png';

const png = (w: number, h: number) => encodePng(w, h, new Uint8Array(w * h * 3));

describe('reading a size without decoding', () => {
  it('reads a PNG from its IHDR', () => {
    expect(imageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(png(7, 3))).toEqual({ width: 7, height: 3 });
  });

  it('reads a JPEG from its first frame header', () => {
    // A minimal JPEG: SOI, an APP0 segment to skip over, then SOF0 carrying 480x640.
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 });
  });

  it('says nothing rather than guessing, for anything else', () => {
    for (const junk of [new Uint8Array(), new Uint8Array([1, 2, 3]), new Uint8Array(40)]) {
      expect(imageSize(junk)).toBeNull();
    }
  });
});

describe('what may be decoded', () => {
  it('allows a picture a person would actually upload', () => {
    expect(withinDecodeBudget(png(1920, 1080))).toBe(true);
  });

  it('refuses one too big to decode inside a request', () => {
    // Not decoded to find out - the header says so, which is the whole point.
    const huge = png(1200, 630);
    const view = new DataView(huge.buffer, huge.byteOffset);
    view.setUint32(16, 8000);
    view.setUint32(20, 6000); // 48 megapixels
    expect(8000 * 6000).toBeGreaterThan(MAX_DECODE_PIXELS);
    expect(withinDecodeBudget(huge)).toBe(false);
  });

  it('refuses on bytes as well, since a small canvas can still be a huge file', () => {
    const big = new Uint8Array(MAX_DECODE_BYTES + 1);
    big.set(png(8, 8).subarray(0, 32));
    expect(withinDecodeBudget(big)).toBe(false);
  });

  // FAIL CLOSED. A file whose header cannot be read is not one to hand to a decoder and hope.
  it('refuses what it cannot measure', () => {
    expect(withinDecodeBudget(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(withinDecodeBudget(new Uint8Array(100))).toBe(false);
  });
});

describe('against real files, when they are here', () => {
  it('measures rather than assumes', () => {
    const path = 'C:/Development/gridmismatch.png';
    if (!existsSync(path)) return;
    const bytes = new Uint8Array(readFileSync(path));
    // 3795x1302: within the ceiling, and the one that cost 168ms to decode - which is why the
    // fitted pixels are cached rather than the decode being repeated per preview.
    expect(imageSize(bytes)).toEqual({ width: 3795, height: 1302 });
    expect(withinDecodeBudget(bytes)).toBe(true);
  });
});

describe('where the crop sits (D-54)', () => {
  // A 2:1 picture into a 16:9 card: too wide, so it slides sideways and not vertically.
  const wide = () => coverCrop(2000, 1000, 1200, 630);

  it('centres by default, which is what it always did', () => {
    const c = wide();
    expect(c.sy).toBe(0);
    expect(c.sx).toBeCloseTo((2000 - c.sw) / 2, 5);
  });

  it('slides to the left edge and the right edge', () => {
    expect(coverCrop(2000, 1000, 1200, 630, 0).sx).toBe(0);
    const right = coverCrop(2000, 1000, 1200, 630, 1);
    expect(right.sx).toBeCloseTo(2000 - right.sw, 5);
  });

  it('only has slack on ONE axis, which is why the page offers one slider', () => {
    // Sliding the axis that has no room does nothing at all - it cannot move off the picture.
    const a = coverCrop(2000, 1000, 1200, 630, 0.5, 0);
    const b = coverCrop(2000, 1000, 1200, 630, 0.5, 1);
    expect(a.sy).toBe(0);
    expect(b.sy).toBe(0);
  });

  it('slides the other way for a tall picture', () => {
    const top = coverCrop(1000, 2000, 1200, 630, 0.5, 0);
    const bottom = coverCrop(1000, 2000, 1200, 630, 0.5, 1);
    expect(top.sy).toBe(0);
    expect(bottom.sy).toBeGreaterThan(0);
    expect(top.sx).toBe(0);
  });

  it('never crops off the edge, whatever it is given', () => {
    for (const f of [-5, 0, 0.5, 1, 5, NaN, Infinity]) {
      const c = coverCrop(2000, 1000, 1200, 630, f, f);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.sw).toBeLessThanOrEqual(2000 + 1e-9);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sy + c.sh).toBeLessThanOrEqual(1000 + 1e-9);
    }
  });

  // THE TWO FITTERS MUST AGREE: the browser crops with these numbers and the rasteriser crops with
  // the same ones, or a picture jumps when it is prepared again.
  it('is the same maths the server fitter uses', () => {
    // A SQUARE source into a wide card has slack on Y, not X - which this test got wrong first
    // time, and the assertion caught. Sliding the axis with no room is correctly a no-op.
    const img = { width: 40, height: 40, rgb: new Uint8Array(40 * 40 * 3) };
    for (let i = 0; i < img.rgb.length; i++) img.rgb[i] = i % 256;
    expect(Array.from(coverFit(img, 12, 6, 0, 0).rgb)).not.toEqual(Array.from(coverFit(img, 12, 6, 0, 1).rgb));
    expect(Array.from(coverFit(img, 12, 6, 0, 0.5).rgb)).toEqual(Array.from(coverFit(img, 12, 6, 1, 0.5).rgb));
  });
});
