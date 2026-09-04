// The designer's new knobs: a picture as the base, four faces, the green screen.
import { describe, it, expect } from 'vitest';
import { renderCover, coverOptionsFrom, DEFAULT_COVER_OPTIONS, COVER_W, COVER_H, type CoverFacts } from '../src/lib/cover/generate';
import { Raster } from '../src/lib/cover/raster';
import { drawText, textWidth, fold } from '../src/lib/cover/font';

const facts = (extra: Partial<CoverFacts> = {}): CoverFacts => ({
  title: 'The Reach', creator: 'frunk', label: 'explorers.starsystemx.com', url: 'https://x/s/the-reach',
  kind: 'system', systems: 1, bodies: 3, constructs: 0,
  nodes: [
    { node_id: 's', parent_id: null, name: 'Sun', kind: 'body', role_hint: 'star' },
    { node_id: 'p', parent_id: 's', name: 'P', kind: 'body', role_hint: 'planet', distance: 1 }
  ],
  ...extra
});

const picture = (w = COVER_W, h = COVER_H) => {
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 200; rgb[i * 3 + 1] = 40 + ((i % w) * 100) / w; rgb[i * 3 + 2] = 90; }
  return { width: w, height: h, rgb };
};

describe('options', () => {
  it('parse the font, the green palette and a picture hash, and refuse a bad hash', () => {
    const o = coverOptionsFrom({ font: 'wide', palette: 'green', base: 'image', baseImage: 'a'.repeat(64) });
    expect(o.font).toBe('wide');
    expect(o.palette).toBe('green');
    expect(o.base).toBe('image');
    expect(o.baseImage).toBe('a'.repeat(64));
    expect(coverOptionsFrom({ font: 'comic', baseImage: 'nope' })).toEqual(DEFAULT_COVER_OPTIONS);
  });
});

describe('a picture as the base', () => {
  it('is drawn under the words when it fits the card, and the card is used when it does not', () => {
    const plain = renderCover(facts(), { ...DEFAULT_COVER_OPTIONS, base: 'image' });
    const withPicture = renderCover(facts({ baseImage: picture() }), { ...DEFAULT_COVER_OPTIONS, base: 'image' });
    const wrongSize = renderCover(facts({ baseImage: picture(100, 50) }), { ...DEFAULT_COVER_OPTIONS, base: 'image' });
    expect(withPicture).not.toEqual(plain);
    // No picture, or one the wrong size: exactly the auto card, not a blank.
    expect(plain).toEqual(renderCover(facts(), DEFAULT_COVER_OPTIONS));
    expect(wrongSize).toEqual(plain);
  });
});

describe('the four faces', () => {
  it('draw differently, and the wide one measures wider', () => {
    const t = fold('Hello');
    expect(textWidth(t, 2, 'wide')).toBe(textWidth(t, 2, 'pixel') * 1.5);
    const seen = new Set<string>();
    for (const font of ['pixel', 'bold', 'outline', 'wide'] as const) {
      const r = new Raster(120, 30);
      r.gradient([0, 0, 0], [0, 0, 0]);
      drawText(r, 2, 2, t, 2, [255, 255, 255], 1, font, font === 'outline' ? [80, 80, 80] : undefined);
      seen.add(Array.from(r.data).join(','));
    }
    expect(seen.size).toBe(4);
  });

  it('give every palette a different card', () => {
    const cards = (['night', 'amber', 'mono', 'green'] as const).map((palette) =>
      renderCover(facts(), { ...DEFAULT_COVER_OPTIONS, palette }).join(','));
    expect(new Set(cards).size).toBe(4);
  });
});

describe('shading a photograph', () => {
  it('darkens the edges more than the middle', () => {
    const r = new Raster(4, 9);
    r.gradient([200, 200, 200], [200, 200, 200]);
    r.shade(0.5, 1);
    expect(r.data[0]).toBeLessThan(r.data[4 * 4 * 3]);           // top row darker than the middle row
    expect(r.data[4 * 8 * 3]).toBeLessThan(r.data[4 * 4 * 3]);   // bottom row too
  });
});
