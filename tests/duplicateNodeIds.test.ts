// TWO COPIES OF ONE SYSTEM ON ONE MAP (D-86).
//
// A real map carried the engine's two bundled Sols, both with every node id the same. The hub's
// `bodies` table is unique on (map, node id), the batch insert failed, the error was discarded, and
// the map went public with no bodies. The engine's own fix (A107) re-ids the SYSTEM only, so this
// shape keeps arriving. These are synthetic - real user files are never committed.
import { describe, it, expect } from 'vitest';
import { normalise } from '../src/lib/bundle/normalise';
import { buildClip } from '../src/lib/bundle/clip';
import { writeNodeRows } from '../src/lib/server/ingest';

/** One Sol, as both bundled examples write it: the same ids every time. */
const sol = (systemId: string, name: string) => ({
  id: systemId, name, position: { x: 0, y: 0 },
  system: {
    id: systemId, name,
    nodes: [
      { id: 'sun', parentId: null, name: 'Sol', kind: 'body', roleHint: 'star' },
      { id: 'earth', parentId: 'sun', name: 'Earth', kind: 'body', roleHint: 'planet', orbit: { hostId: 'sun', elements: { a_AU: 1 } } },
      { id: 'luna', parentId: 'earth', name: 'Luna', kind: 'body', roleHint: 'moon', orbit: { hostId: 'earth', elements: { a_AU: 0.0026 } } },
      // A reference far from the orbit - the engine's paste rewrites these too, so the hub must.
      { id: 'station', parentId: 'earth', name: name + ' Station', kind: 'construct', roleHint: 'station',
        autopilot: { legs: [{ placeId: 'luna' }], avoid: ['sun'] } }
    ]
  }
});

const map = () => ({ name: 'My Starmap', systems: [sol('solar-system', 'Sol'), sol('solar-system-2', 'Sol (Expanse)')] });
const all = (shaped: ReturnType<typeof normalise>) => [...shaped.bodies, ...shaped.constructs];
const snip = (n: { snippet: unknown }) => n.snippet as Record<string, any>;

describe('two copies of one system on one map', () => {
  it('stores every object under an id of its own', () => {
    const ids = all(normalise(map())).map((n) => n.node_id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  it('leaves the first copy exactly as the file wrote it', () => {
    const first = all(normalise(map())).filter((n) => !n.node_id.endsWith('-2'));
    expect(first.map((n) => n.node_id).sort()).toEqual(['earth', 'luna', 'station', 'sun']);
    expect(first.find((n) => n.node_id === 'earth')?.parent_id).toBe('sun');
  });

  it('renames the second copy THROUGHOUT - rows, snippet ids, orbits and buried references', () => {
    const second = new Map(all(normalise(map())).filter((n) => n.node_id.endsWith('-2')).map((n) => [n.node_id, n]));
    expect([...second.keys()].sort()).toEqual(['earth-2', 'luna-2', 'station-2', 'sun-2']);

    const earth = second.get('earth-2')!;
    expect(earth.parent_id).toBe('sun-2');
    expect(snip(earth)).toMatchObject({ id: 'earth-2', parentId: 'sun-2', orbit: { hostId: 'sun-2' } });

    // The one that proves the walk is deep: a leg and an avoid-list, nowhere near parentId.
    expect(snip(second.get('station-2')!).autopilot).toEqual({ legs: [{ placeId: 'luna-2' }], avoid: ['sun-2'] });
    // Names are prose, not references, and are left alone.
    expect(earth.name).toBe('Earth');
  });

  it('a copy taken from the second Sol pastes as ITS OWN system, wired to itself', () => {
    const rows = all(normalise(map())).map((n) => ({ node_id: n.node_id, parent_id: n.parent_id, snippet: n.snippet, tags: n.tags }));
    const clip = buildClip(rows, 'sun-2', { site: 'hub', url: 'https://example.test/s/my-starmap', title: 'My Starmap' })!;
    expect(clip.root).toBe('sun-2');
    const inClip = new Set(clip.nodes.map((n) => n.id));
    expect(inClip).toEqual(new Set(['sun-2', 'earth-2', 'luna-2', 'station-2']));
    // The engine refuses a clip whose non-root parent is not inside it (io/hubClip.ts). Before the
    // snippets were renamed with the rows, `root` named an id no snippet carried.
    for (const n of clip.nodes) if (n.id !== clip.root) expect(inClip.has(n.parentId as string), String(n.id)).toBe(true);
  });

  it('does not touch the document it was given', () => {
    // The same object goes on to be credited and packed for download; the rename is the hub's
    // storage concern and must not leak into the file anybody takes away.
    const doc = map();
    normalise(doc);
    expect(doc.systems[1].system.nodes[1]).toMatchObject({ id: 'earth', parentId: 'sun', orbit: { hostId: 'sun' } });
  });

  it('never renames onto an id the second system already uses', () => {
    const doc = map();
    // The second copy has a genuine `earth-2` of its own, so its clashing `earth` must become `earth-3`.
    doc.systems[1].system.nodes.push({ id: 'earth-2', parentId: 'sun', name: 'Counter-Earth', kind: 'body', roleHint: 'planet' } as never);
    const byName = new Map(all(normalise(doc)).map((n) => [n.name + '|' + n.node_id, n]));
    expect(byName.has('Counter-Earth|earth-2')).toBe(true);
    expect(byName.has('Earth|earth-3')).toBe(true);
    const ids = all(normalise(doc)).map((n) => n.node_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a map with no clash comes out exactly as before', () => {
    const shaped = normalise({ systems: [sol('solar-system', 'Sol')] });
    expect(all(shaped).map((n) => n.node_id).sort()).toEqual(['earth', 'luna', 'station', 'sun']);
  });

  it('the same id twice inside ONE system still stores, the later one renamed', () => {
    const shaped = normalise({ nodes: [
      { id: 'x', parentId: null, name: 'First', kind: 'body', roleHint: 'star' },
      { id: 'x', parentId: 'x', name: 'Second', kind: 'body', roleHint: 'planet' }
    ] });
    expect(shaped.bodies.map((n) => n.node_id)).toEqual(['x', 'x-2']);
    expect(snip(shaped.bodies[1]).id).toBe('x-2');
  });
});

describe('a node write that fails is a failure (D-86)', () => {
  it('throws instead of publishing a map with no bodies', async () => {
    // The fault was never the clash alone - it was that the returned error was thrown away.
    const sb = {
      from: () => ({ insert: async () => ({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) })
    } as never;
    const shaped = normalise({ systems: [sol('solar-system', 'Sol')] });
    await expect(writeNodeRows(sb, 'map-id', shaped, new Map())).rejects.toThrow(/could not save the bodies/);
  });
});
