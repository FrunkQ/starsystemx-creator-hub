// "How far out": the one number the tree sorts on, and what the covers draw from.
import { describe, it, expect } from 'vitest';
import { normalise } from '../src/lib/bundle/normalise';
import { orderRoles } from '../src/lib/components/roleIcons';
import { tolerantWriteMany } from '../src/lib/server/tolerant';
import { renderCover, coverOptionsFrom, DEFAULT_COVER_OPTIONS, type CoverFacts } from '../src/lib/cover/generate';
import { coverNodeFrom } from '../src/lib/server/cover';

const star = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, parentId: null, name: id.toUpperCase(), kind: 'body', roleHint: 'star', classes: ['star/G2V'], ...extra });
const planet = (id: string, parent: string, au: number, extra: Record<string, unknown> = {}) =>
  ({ id, parentId: parent, name: id, kind: 'body', roleHint: 'planet', orbit: { elements: { a_AU: au } }, ...extra });

const starmap = () => ({
  bundleFormat: 1,
  systems: [
    { id: 'a', name: 'Alpha', position: { x: 100, y: 100, z: 0 }, system: { nodes: [star('a-star'), planet('a-1', 'a-star', 1.0), planet('a-2', 'a-star', 0.4)] } },
    { id: 'b', name: 'Beta', position: { x: 110, y: 100, z: 0 }, system: { nodes: [star('b-star', { classes: ['star/M4V'] })] } },
    { id: 'c', name: 'Gamma', position: { x: 100, y: 105, z: 0 }, system: { nodes: [star('c-star', { classes: ['star/K1V'] })] } },
    { id: 'd', name: 'Delta', position: { x: 96, y: 97, z: 0 }, system: { nodes: [star('d-star')] } }
  ]
});

describe('distance from the origin star, at the top of a starmap', () => {
  it('picks the system nearest the centre of the map as the origin', () => {
    const n = normalise(starmap());
    const byId = Object.fromEntries(n.bodies.map((b) => [b.node_id, b]));
    // Centroid is (101.5, 100.5): Alpha at (100,100) is nearest.
    expect(byId['a-star'].distance).toBe(0);
    expect(byId['a-star'].map_x).toBe(0);
    expect(byId['b-star'].distance).toBe(10);
    expect(byId['b-star'].map_x).toBe(10);
    expect(byId['c-star'].distance).toBe(5);
    expect(byId['c-star'].map_y).toBe(5);
    expect(byId['d-star'].distance).toBe(5);
  });

  it('honours an explicit origin when the engine ever writes one', () => {
    const n = normalise({ ...starmap(), originSystemId: 'b' });
    const byId = Object.fromEntries(n.bodies.map((b) => [b.node_id, b]));
    expect(byId['b-star'].distance).toBe(0);
    expect(byId['a-star'].distance).toBe(10);
  });

  it('is the orbit, in AU, inside a system', () => {
    const n = normalise(starmap());
    const byId = Object.fromEntries(n.bodies.map((b) => [b.node_id, b]));
    expect(byId['a-1'].distance).toBe(1.0);
    expect(byId['a-2'].distance).toBe(0.4);
    expect(byId['a-1'].map_x).toBeNull();
  });

  it('is null when the file says nothing - never zero', () => {
    const n = normalise({ nodes: [star('s'), { id: 'p', parentId: 's', name: 'p', kind: 'body' }] });
    expect(n.bodies[0].distance).toBeNull();
    expect(n.bodies[1].distance).toBeNull();
    // A lone starmap entry has nothing to be measured from.
    const one = normalise({ systems: [{ id: 'x', name: 'X', position: { x: 1, y: 1 }, system: { nodes: [star('x-star')] } }] });
    expect(one.bodies[0].distance).toBeNull();
  });
});

describe('the order roles are listed in', () => {
  it('is planets, moons, rings, belts, then the built things, then the rest', () => {
    const out = orderRoles({ station: 9, moon: 22, planet: 11, ship: 2, belt: 2, ring: 4, zebra: 1, star: 0 });
    expect(out.map(([r]) => r)).toEqual(['planet', 'moon', 'ring', 'belt', 'station', 'ship', 'zebra']);
  });
});

describe('a tolerant bulk insert', () => {
  it('drops the named column from every row and retries', async () => {
    const seen: unknown[][] = [];
    const r = await tolerantWriteMany([{ id: 1, distance: 2 }, { id: 2, distance: 3 }], async (rows) => {
      seen.push(rows);
      return { error: 'distance' in rows[0] ? { code: 'PGRST204', message: "Could not find the 'distance' column of 'bodies' in the schema cache" } : null };
    });
    expect(r.dropped).toEqual(['distance']);
    expect(seen[1]).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('is a no-op for no rows', async () => {
    let called = false;
    const r = await tolerantWriteMany([], async () => { called = true; return { error: null }; });
    expect(called).toBe(false);
    expect(r.error).toBeNull();
  });
});

describe('the designed cover', () => {
  const facts = (): CoverFacts => {
    const n = normalise(starmap());
    return {
      title: 'The Neighbourhood', creator: 'frunk', label: 'explorers.starsystemx.com',
      url: 'https://explorers.starsystemx.com/s/the-neighbourhood', kind: 'starmap',
      systems: 4, bodies: n.bodies.length, constructs: 0, nodes: n.bodies.map(coverNodeFrom)
    };
  };

  it('parses options from a form (on/off) and from JSON, falling back on junk', () => {
    expect(coverOptionsFrom({ base: 'starmap', palette: 'amber', title: 'off', qr: 'on' }))
      .toEqual({ ...DEFAULT_COVER_OPTIONS, base: 'starmap', palette: 'amber', title: false, qr: true });
    expect(coverOptionsFrom({ base: 'nope', palette: 42, title: false })).toEqual({ ...DEFAULT_COVER_OPTIONS, title: false });
    expect(coverOptionsFrom(null)).toEqual(DEFAULT_COVER_OPTIONS);
  });

  it('draws a different picture for the constellation, the orbits and the plain field', () => {
    const f = facts();
    const a = renderCover(f, { ...DEFAULT_COVER_OPTIONS, base: 'starmap' });
    const b = renderCover(f, { ...DEFAULT_COVER_OPTIONS, base: 'system' });
    const c = renderCover(f, { ...DEFAULT_COVER_OPTIONS, base: 'plain' });
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    // "auto" on a starmap IS the constellation.
    expect(renderCover(f, DEFAULT_COVER_OPTIONS)).toEqual(a);
  });

  it('adds a QR code only when asked and only when there is a url', () => {
    const f = facts();
    const without = renderCover(f, { ...DEFAULT_COVER_OPTIONS, qr: false });
    const withQr = renderCover(f, { ...DEFAULT_COVER_OPTIONS, qr: true });
    expect(withQr).not.toEqual(without);
    expect(renderCover({ ...f, url: null }, { ...DEFAULT_COVER_OPTIONS, qr: true })).toEqual(without);
  });

  it('reads the physical facts out of a stored row', () => {
    const n = coverNodeFrom({
      node_id: 'e', parent_id: 's', name: 'Earth', kind: 'body', role_hint: 'planet',
      snippet: { radiusKm: 6371, massKg: 5.972e24, hydrosphere: { oceans: true }, classes: [] }, distance: 1
    });
    expect(n.radius_km).toBe(6371);
    expect(n.has_hydrosphere).toBe(true);
    expect(n.star_class).toBeNull();
    expect(coverNodeFrom({ node_id: 's', parent_id: null, name: 'Sol', kind: 'body', role_hint: 'star', snippet: { classes: ['star/G2V'] } }).star_class).toBe('G2V');
  });

  it('falls back to the orbits when a starmap has no positions', () => {
    const f = facts();
    const flat = { ...f, nodes: f.nodes.map((n) => ({ ...n, map_x: null, map_y: null })) };
    expect(renderCover(flat, { ...DEFAULT_COVER_OPTIONS, base: 'starmap' }))
      .toEqual(renderCover(flat, { ...DEFAULT_COVER_OPTIONS, base: 'system' }));
  });
});
