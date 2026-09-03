// A PROBE, not a gate: draws the cover for a real, busy starmap when one is on this machine, so a
// person can look at tests/out/cover-local.png. Skips quietly anywhere the file is absent.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderCover } from '../src/lib/cover/generate';
import { normalise } from '../src/lib/bundle/normalise';
import { computeFacets } from '../src/lib/bundle/facets';

const REAL = 'C:/Development/star-system-explorer-v2/Local_Neighbourhood-Starmap.json';

describe.skipIf(!existsSync(REAL))('a cover for a real forty-system starmap', () => {
  it('renders, and is kept for a human to look at', () => {
    const doc = JSON.parse(readFileSync(REAL, 'utf8'));
    const shaped = normalise(doc);
    const f = computeFacets(doc);
    const png = renderCover({
      title: shaped.title, creator: 'frunk', site: 'StarSystemX Explorers',
      systems: f.systemCount, bodies: f.bodyCount, constructs: f.constructCount,
      nodes: [...shaped.bodies, ...shaped.constructs]
    });
    mkdirSync('tests/out', { recursive: true });
    writeFileSync('tests/out/cover-local.png', png);
    expect(png.length).toBeGreaterThan(1000);
  });
});
