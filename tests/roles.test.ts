// Small objects, and the credits a map carries for other people's work.
import { describe, it, expect } from 'vitest';
import { displayRole, SMALL_OBJECT, SMALL_OBJECT_MAX_KG } from '../src/lib/bundle/roles';
import { normalise } from '../src/lib/bundle/normalise';
import { computeFacets, deriveTags } from '../src/lib/bundle/facets';
import { orderRoles } from '../src/lib/components/roleIcons';

describe('what counts as a small object', () => {
  it('is a planet or moon under the mass threshold', () => {
    expect(displayRole({ roleHint: 'planet', massKg: 8.7e19 })).toBe(SMALL_OBJECT);   // Hygiea
    expect(displayRole({ roleHint: 'moon', massKg: 1.07e16 })).toBe(SMALL_OBJECT);    // Phobos
    expect(displayRole({ roleHint: 'planet', massKg: 2.6e20 })).toBe('planet');       // Vesta stays
    expect(displayRole({ roleHint: 'planet', massKg: 9.4e20 })).toBe('planet');       // Ceres stays
    expect(displayRole({ roleHint: 'moon', massKg: 7.35e22 })).toBe('moon');          // Luna
  });

  it('falls back to the radius when the mass is missing', () => {
    expect(displayRole({ roleHint: 'moon', radiusKm: 11 })).toBe(SMALL_OBJECT);
    expect(displayRole({ roleHint: 'moon', radiusKm: 1737 })).toBe('moon');
    expect(displayRole({ roleHint: 'planet' })).toBe('planet');
  });

  it('reclassifies nothing else, however small', () => {
    expect(displayRole({ roleHint: 'star', massKg: 1 })).toBe('star');
    expect(displayRole({ roleHint: 'belt', massKg: 1 })).toBe('belt');
    expect(displayRole({ roleHint: 'station', massKg: 1 })).toBe('station');
    expect(displayRole({ massKg: 1 })).toBeNull();
    expect(displayRole(null)).toBeNull();
  });

  it('is the ONE definition: the stored role, the counts and the pills all agree', () => {
    const doc = { nodes: [
      { id: 's', name: 'S', kind: 'body', roleHint: 'star' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: 'a' + i, name: 'A' + i, kind: 'body', roleHint: 'planet', parentId: 's', massKg: SMALL_OBJECT_MAX_KG / 10 })),
      { id: 'e', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 's', massKg: 5.97e24 }
    ] };
    const n = normalise(doc);
    expect(n.bodies.filter((b) => b.role_hint === SMALL_OBJECT)).toHaveLength(6);
    const f = computeFacets(doc);
    expect(f.roleCounts[SMALL_OBJECT]).toBe(6);
    expect(f.roleCounts.planet).toBe(1);
    expect(deriveTags(f, { hasGmContent: false })).toContain('small-objects');
    expect(orderRoles(f.roleCounts).map(([r]) => r)).toEqual(['planet', SMALL_OBJECT, 'star']);
  });
});

describe('the credits a map carries for other people\'s work (R-16)', () => {
  it('reads what the engine recorded on paste, capped and de-duplicated', () => {
    const n = normalise({ nodes: [], contentCredits: [
      { title: 'Local Neighbourhood', creator: 'frunk', url: 'https://x/s/local-neighbourhood', site: 'Explorers', pastedAt: 'x', nodeIds: ['a'] },
      { title: 'Local Neighbourhood', creator: 'frunk', url: 'https://x/s/local-neighbourhood' },
      { title: 'No url', creator: '' },
      { title: '', url: 'https://x' },
      { title: 'Bad url', url: 'javascript:alert(1)' }
    ] });
    expect(n.contentCredits).toEqual([
      { title: 'Local Neighbourhood', creator: 'frunk', url: 'https://x/s/local-neighbourhood', site: 'Explorers', chain: [] },
      { title: 'No url', creator: null, url: null, site: null, chain: [] },
      { title: 'Bad url', creator: null, url: null, site: null, chain: [] }
    ]);
  });

  it('is empty, not an error, for every save that exists today', () => {
    expect(normalise({ nodes: [] }).contentCredits).toEqual([]);
    expect(normalise({ nodes: [], contentCredits: 'nope' }).contentCredits).toEqual([]);
  });
});
