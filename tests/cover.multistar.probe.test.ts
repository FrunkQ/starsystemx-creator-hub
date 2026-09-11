// A PROBE, not a gate: the system cover for every multi-star system in the engine's own Local
// Neighbourhood, so a person can look at tests/out/multistar-*.png. Skips where the file is absent.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderCover, DEFAULT_COVER_OPTIONS, type CoverFacts } from '../src/lib/cover/generate';
import { coverNodeFrom } from '../src/lib/server/cover';
import { normalise } from '../src/lib/bundle/normalise';
import { computeFacets } from '../src/lib/bundle/facets';

const REAL = 'C:/Development/star-system-explorer-v2/Local_Neighbourhood-Starmap.json';
const PICK = ['Sol', 'Alpha Centauri', 'Sirius', '40 Eridani', 'Epsilon Indi', 'Groombridge 34'];

describe.skipIf(!existsSync(REAL))('system covers for real multi-star systems', () => {
  it('draws each one for a human to look at', () => {
    const map = JSON.parse(readFileSync(REAL, 'utf8'));
    mkdirSync('tests/out', { recursive: true });
    for (const name of PICK) {
      const entry = map.systems.find((s: { name: string }) => s.name === name);
      if (!entry) continue;
      const doc = entry.system;
      const shaped = normalise(doc);
      const f = computeFacets(doc);
      const facts: CoverFacts = {
        title: name, creator: 'frunk', label: 'explorers.starsystemx.com', url: null, kind: 'system',
        systems: 1, bodies: f.bodyCount, constructs: f.constructCount,
        nodes: [...shaped.bodies, ...shaped.constructs].map(coverNodeFrom)
      };
      const png = renderCover(facts, { ...DEFAULT_COVER_OPTIONS, base: 'system' });
      writeFileSync('tests/out/multistar-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png', png);
      expect(png.length).toBeGreaterThan(1000);
    }
  });
});
