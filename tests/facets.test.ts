// Derived facets. These are FACTS the hub computed, not claims - so the tests care most about them
// staying honest under odd input.
import { describe, it, expect } from 'vitest';
import { computeFacets, deriveTags, formatBytes } from '../src/lib/bundle/facets';

const campaign = (systems: number, nodes: any[]) => ({
  systems: Array.from({ length: systems }, (_, i) => ({
    name: 'S' + i, system: { nodes: i === 0 ? nodes : [] }
  }))
});

describe('counting what is in a map', () => {
  it('counts by roleHint, which is the axis that distinguishes maps', () => {
    // 27 bodies / 54 constructs (Uggi) vs 8 bodies / 0 (TRAPPIST-1) is the real case this exists
    // for: identical `kind` spread, completely different things to play in.
    const f = computeFacets({
      nodes: [
        { kind: 'body', roleHint: 'star' },
        { kind: 'body', roleHint: 'planet' },
        { kind: 'body', roleHint: 'planet' },
        { kind: 'construct', roleHint: 'station' },
        { kind: 'barycenter' }
      ]
    });
    expect(f.bodyCount).toBe(3);
    expect(f.constructCount).toBe(1);
    expect(f.roleCounts).toEqual({ star: 1, planet: 2, station: 1 });
  });

  it('does not count a barycentre as an object anyone came to look at', () => {
    const f = computeFacets({ nodes: [{ kind: 'barycenter' }, { kind: 'barycenter' }] });
    expect(f.bodyCount).toBe(0);
    expect(f.constructCount).toBe(0);
  });

  it('separates CARRIED assets from app-shipped ones (C-06)', () => {
    const f = computeFacets({
      nodes: [
        { kind: 'body', image: { url: 'assets/images/n1.jpg' } },   // the hub stores this
        { kind: 'body', image: { url: '/images/star_types/M.webp' } }, // ships with SSE
        { kind: 'body', image: { url: 'https://example.com/x.jpg' } }, // someone else's hosting
        { kind: 'construct', model: { hash: 'a'.repeat(64) } },      // GM upload: has a hash
        { kind: 'construct', model: { url: '/models/nasa/iss.glb' } } // starter: no hash
      ]
    });
    expect(f.carriedImages).toBe(1);
    expect(f.appArtwork).toBe(1);
    expect(f.carriedModels).toBe(1);
  });

  it('walks a campaign', () => {
    const f = computeFacets(campaign(42, [{ kind: 'body', roleHint: 'star' }]));
    expect(f.systemCount).toBe(42);
    expect(f.bodyCount).toBe(1);
  });

  it('never throws on hostile input', () => {
    for (const doc of [null, undefined, 42, [], {}, { nodes: null }, { systems: 'x' }]) {
      expect(() => computeFacets(doc)).not.toThrow();
    }
  });
});

describe('the pills', () => {
  const base = computeFacets({ nodes: [{ kind: 'body', roleHint: 'planet' }] });

  it('says what shape the thing is first', () => {
    expect(deriveTags(computeFacets(campaign(42, [])), { hasGmContent: false })).toContain('campaign');
    expect(deriveTags(computeFacets(campaign(42, [])), { hasGmContent: false })).toContain('large-campaign');
    expect(deriveTags(base, { hasGmContent: false })).toContain('single-system');
  });

  it('marks player-safe only when nothing was detected', () => {
    expect(deriveTags(base, { hasGmContent: false })).toContain('player-safe');
    expect(deriveTags(base, { hasGmContent: true })).toContain('gm-notes');
    expect(deriveTags(base, { hasGmContent: true })).not.toContain('player-safe');
  });

  it('flags a built-up system', () => {
    const f = computeFacets({ nodes: Array.from({ length: 25 }, () => ({ kind: 'construct', roleHint: 'station' })) });
    expect(deriveTags(f, { hasGmContent: false })).toContain('built-up');
    expect(deriveTags(base, { hasGmContent: false })).not.toContain('built-up');
  });

  it('drops structural tag namespaces, which are on everything and distinguish nothing', () => {
    const f = computeFacets({
      nodes: Array.from({ length: 20 }, () => ({
        kind: 'body',
        tags: [{ key: 'orbit/eccentric' }, { key: 'spin/fast' }, { key: 'intrigue/smuggling' }]
      }))
    });
    const tags = deriveTags(f, { hasGmContent: false });
    expect(tags).toContain('intrigue');
    expect(tags).not.toContain('orbit');
    expect(tags).not.toContain('spin');
  });

  it('does not emit a pill for roles every map has', () => {
    // Measured: every real example save has stars and planets, so those filter nothing.
    const f = computeFacets({ nodes: [
      { kind: 'body', roleHint: 'star' }, { kind: 'body', roleHint: 'planet' },
      { kind: 'construct', roleHint: 'station' }
    ] });
    const tags = deriveTags(f, { hasGmContent: false });
    expect(tags).not.toContain('stars');
    expect(tags).not.toContain('planets');
    expect(tags).toContain('stations');
    // ...but they are still COUNTED, because the page shows them.
    expect(f.roleCounts.star).toBe(1);
  });

  it('never repeats a pill', () => {
    const tags = deriveTags(computeFacets(campaign(42, [{ kind: 'body', roleHint: 'star' }])), { hasGmContent: false });
    expect(tags.length).toBe(new Set(tags).size);
  });
});

describe('sizes', () => {
  it('reads as a human would say it', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB');
  });
});
