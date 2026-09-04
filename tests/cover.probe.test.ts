// A PROBE, not a gate: draws the cover for a real, busy starmap when one is on this machine, so a
// person can look at tests/out/cover-local.png. Skips quietly anywhere the file is absent.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderCover, DEFAULT_COVER_OPTIONS, type CoverFacts } from '../src/lib/cover/generate';
import { coverNodeFrom } from '../src/lib/server/cover';
import { normalise } from '../src/lib/bundle/normalise';
import { computeFacets } from '../src/lib/bundle/facets';

const REAL = 'C:/Development/star-system-explorer-v2/Local_Neighbourhood-Starmap.json';

describe.skipIf(!existsSync(REAL))('covers for a real forty-system starmap', () => {
  it('renders every base and palette, and keeps them for a human to look at', () => {
    const doc = JSON.parse(readFileSync(REAL, 'utf8'));
    const shaped = normalise(doc);
    const f = computeFacets(doc);
    const facts: CoverFacts = {
      title: shaped.title, creator: 'frunk', label: 'explorers.starsystemx.com',
      url: 'https://explorers.starsystemx.com/s/local-neighbourhood', kind: 'starmap',
      systems: f.systemCount, bodies: f.bodyCount, constructs: f.constructCount,
      nodes: [...shaped.bodies, ...shaped.constructs].map(coverNodeFrom)
    };
    mkdirSync('tests/out', { recursive: true });
    const constellation = renderCover(facts, { ...DEFAULT_COVER_OPTIONS, base: 'starmap', qr: true });
    writeFileSync('tests/out/cover-local-constellation.png', constellation);
    writeFileSync('tests/out/cover-local-orbits.png', renderCover(facts, { ...DEFAULT_COVER_OPTIONS, base: 'system', palette: 'amber' }));
    writeFileSync('tests/out/cover-local-plain.png', renderCover(facts, { ...DEFAULT_COVER_OPTIONS, base: 'plain', palette: 'mono', title: false, byline: false }));
    expect(constellation.length).toBeGreaterThan(1000);
  });
});
