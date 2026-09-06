// The four things the owner asked the cover editor for, 2026-09-06 (D-43).
//
// Pixel-perfect assertions on a 1200x630 PNG would break on every tweak and prove nothing; these
// test the RULES instead - what a face does to a glyph, what a palette does to a colour, and what
// the defaults are - which is where each of the four faults actually lived.
import { describe, it, expect } from 'vitest';
import { Raster } from '../src/lib/cover/raster';
import { drawText, fold } from '../src/lib/cover/font';
import { tinted, PALETTE, DEFAULT_COVER_OPTIONS, coverOptionsFrom } from '../src/lib/cover/generate';

/** The colour at a pixel. */
function at(r: Raster, x: number, y: number): [number, number, number] {
  const i = (y * r.width + x) * 3;
  return [r.data[i], r.data[i + 1], r.data[i + 2]];
}

const INK: [number, number, number] = [255, 255, 255];
const BG: [number, number, number] = [0, 0, 0];

describe('the outlined face is actually outlined', () => {
  // "Outlined does nothing noticeable" - it painted a halo in the BACKGROUND colour, on the
  // background. Now the ring takes the text colour and the body takes the colour behind it.
  const draw = (style: 'pixel' | 'outline') => {
    const r = new Raster(60, 40);
    // 'L' at scale 4: a solid vertical stroke down the left of the glyph, so there is an inside.
    drawText(r, 10, 10, fold('L'), 4, INK, 1, style, BG);
    return r;
  };

  it('leaves the inside of a stroke in the colour behind, not in the ink', () => {
    const solid = draw('pixel');
    const hollow = draw('outline');
    // The middle of the glyph's vertical stroke: ink when solid, background when outlined.
    const x = 12, y = 22;
    expect(at(solid, x, y)[0]).toBeGreaterThan(200);
    expect(at(hollow, x, y)[0]).toBeLessThan(60);
  });

  it('puts ink where the solid face has none - that is the outline', () => {
    const solid = draw('pixel');
    const hollow = draw('outline');
    // Just outside the stroke's left edge.
    const x = 8, y = 22;
    expect(at(solid, x, y)[0]).toBeLessThan(60);
    expect(at(hollow, x, y)[0]).toBeGreaterThan(120);
  });

  it('is unchanged for every other face', () => {
    const r = new Raster(60, 40);
    drawText(r, 10, 10, fold('L'), 4, INK, 1, 'pixel', BG);
    expect(at(r, 12, 22)[0]).toBeGreaterThan(200);
  });
});

describe('a green screen has one colour', () => {
  // "Greenscreen should colour the elements on the map green more" - the palette used to reach the
  // words and leave the map's own blues and oranges alone.
  const green = PALETTE.green;

  it('leaves every other palette exactly as it was', () => {
    for (const name of ['night', 'amber', 'mono'] as const) {
      expect(tinted([80, 140, 220], PALETTE[name])).toEqual([80, 140, 220]);
    }
  });

  it('turns an ocean world and a K star both green', () => {
    for (const c of [[80, 140, 220], [255, 200, 140], [214, 180, 140]] as [number, number, number][]) {
      const [r, g, b] = tinted(c, green);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('keeps them TELLABLE APART, which is the point of a ramp rather than one flat green', () => {
    const bright = tinted([255, 255, 255], green)[1];
    const mid = tinted([150, 190, 230], green)[1];
    const dark = tinted([60, 60, 60], green)[1];
    expect(bright).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(dark);
  });

  it('never lets a dark element fall to black and vanish', () => {
    expect(tinted([0, 0, 0], green)[1]).toBeGreaterThan(30);
  });
});

describe('the defaults', () => {
  it('draws a QR code without being asked', () => {
    expect(DEFAULT_COVER_OPTIONS.qr).toBe(true);
    expect(coverOptionsFrom({}).qr).toBe(true);
    expect(coverOptionsFrom(null).qr).toBe(true);
  });

  it('still obeys a creator who turned it off', () => {
    // The default must not reach back and re-tick a box somebody deliberately cleared.
    expect(coverOptionsFrom({ qr: false }).qr).toBe(false);
    expect(coverOptionsFrom({ qr: 'off' }).qr).toBe(false);
  });
});
