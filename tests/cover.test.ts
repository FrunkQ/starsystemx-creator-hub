// The generated cover: a real PNG, drawn the same way twice, from a real save.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { unzlibSync } from 'fflate';
import { renderCover, COVER_W, COVER_H, fnv } from '../src/lib/cover/generate';
import { encodePng, crc32 } from '../src/lib/cover/png';
import { GLYPHS, GLYPH_H, fold, wrapLines, textWidth } from '../src/lib/cover/font';
import { readZip } from '../src/lib/bundle/read';
import { normalise } from '../src/lib/bundle/normalise';
import { computeFacets } from '../src/lib/bundle/facets';
import { coverNodeFrom } from '../src/lib/server/cover';

const fixture = () => {
  const zip = readZip(new Uint8Array(readFileSync('tests/fixtures/creator-hub-bundle.sse.zip')));
  const docName = Object.keys(zip).find((n) => n.endsWith('starmap.json'))!;
  return JSON.parse(new TextDecoder().decode(zip[docName]));
};

function factsFor(doc: any, title = 'The Hystrine Reach') {
  const shaped = normalise(doc);
  const f = computeFacets(doc);
  return {
    title, creator: 'frunk', label: 'explorers.starsystemx.com', url: null, kind: 'starmap' as const,
    systems: f.systemCount, bodies: f.bodyCount, constructs: f.constructCount,
    nodes: [...shaped.bodies, ...shaped.constructs].map(coverNodeFrom)
  };
}

/** Walk the chunks and hand back IHDR and the concatenated IDAT. */
function parsePng(png: Uint8Array) {
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset);
  let at = 8;
  let width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    // Every chunk's CRC covers type + data. A bad one is a PNG nothing will open.
    expect(view.getUint32(at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)));
    if (type === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); }
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
    if (type === 'IEND') break;
  }
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) { all.set(d, o); o += d.length; }
  return { width, height, raw: unzlibSync(all) };
}

describe('the PNG encoder', () => {
  it('writes a file whose chunks check out and whose scanlines round-trip', () => {
    const rgb = new Uint8Array(4 * 3 * 3);
    rgb.fill(200);
    const png = encodePng(4, 3, rgb);
    const p = parsePng(png);
    expect(p.width).toBe(4);
    expect(p.height).toBe(3);
    // One filter byte per row, then the row.
    expect(p.raw.length).toBe((4 * 3 + 1) * 3);
    expect(p.raw[0]).toBe(0);
    expect(p.raw[1]).toBe(200);
  });

  it('refuses a buffer of the wrong size rather than writing a corrupt file', () => {
    expect(() => encodePng(2, 2, new Uint8Array(5))).toThrow();
  });
});

describe('the bitmap font', () => {
  it('has every glyph seven rows tall and consistently wide', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, ch).toHaveLength(GLYPH_H);
      const w = rows[0].length;
      for (const row of rows) expect(row.length, ch).toBe(w);
    }
  });

  it('folds anything onto the alphabet it has', () => {
    expect(fold('Épsilon Eridani – “Ran”')).toBe('EPSILON ERIDANI - RAN');
    expect(fold('40 Eridani (Keid)')).toBe('40 ERIDANI (KEID)');
    expect(textWidth(fold('AB'), 2)).toBe((6 + 5) * 2);
  });

  it('wraps a long title and cuts the last line honestly', () => {
    expect(wrapLines('LOCAL NEIGHBOURHOOD', 30, 2)).toEqual(['LOCAL NEIGHBOURHOOD']);
    expect(wrapLines('THE LONG AND WINDING ROAD TO THE HYSTRINE REACH', 20, 2)).toEqual(['THE LONG AND WINDING', 'ROAD TO THE...']);
    expect(wrapLines('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 10, 1)).toEqual(['SUPERCA...']);
  });
});

describe('a generated cover', () => {
  const doc = fixture();

  it('is a 1200x630 PNG drawn from the real fixture', () => {
    const png = renderCover(factsFor(doc));
    const p = parsePng(png);
    expect(p.width).toBe(COVER_W);
    expect(p.height).toBe(COVER_H);
    expect(p.raw.length).toBe((COVER_W * 3 + 1) * COVER_H);
    // Small enough to be an Open Graph image nobody notices loading.
    expect(png.length).toBeLessThan(250 * 1024);
    // Kept for a human to look at: tests/out/cover.png.
    mkdirSync('tests/out', { recursive: true });
    writeFileSync('tests/out/cover.png', png);
  });

  it('draws the same bytes twice, so a re-upload reuses the asset', () => {
    const a = renderCover(factsFor(doc));
    const b = renderCover(factsFor(doc));
    expect(a).toEqual(b);
  });

  it('draws something different for a different map', () => {
    const a = renderCover(factsFor(doc));
    const b = renderCover(factsFor(doc, 'Another Map Entirely'));
    expect(a).not.toEqual(b);
  });

  it('copes with a map that has no nodes at all', () => {
    const png = renderCover({ title: 'Empty', creator: null, label: 'x', url: null, kind: 'system', systems: 0, bodies: 0, constructs: 0, nodes: [] });
    expect(parsePng(png).width).toBe(COVER_W);
  });

  it('hashes stably', () => {
    expect(fnv('sol')).toBe(fnv('sol'));
    expect(fnv('sol')).not.toBe(fnv('sirius'));
  });
});
