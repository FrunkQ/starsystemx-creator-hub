// Badges: the rules in src/lib/badges.ts, and the art every one of them must have.
import { describe, it, expect } from 'vitest';
import { CATALOGUE, BADGE_IDS, deriveBadgeSet, THRESHOLDS, type BadgeFacts } from '../src/lib/badges';

const none: BadgeFacts = { maps: [], usedIn: 0, comments: 0, joinedRank: null, admin: false };
const map = (over: Partial<BadgeFacts['maps'][number]> = {}) => ({
  kind: 'system', stars: 0, downloads: 0, images: 0, models: 0, objects: 3, credits: 0, density: 0, ...over
});
const withMap = (over: Partial<BadgeFacts['maps'][number]> = {}) => deriveBadgeSet({ ...none, maps: [map(over)] });

describe('what earns a badge', () => {
  it('nothing earns nothing', () => {
    expect(deriveBadgeSet(none)).toEqual([]);
  });

  it('one public map is a cartographer; a starmap is a constellation as well', () => {
    expect(withMap()).toEqual(['cartographer']);
    expect(withMap({ kind: 'starmap' })).toEqual(['cartographer', 'constellation']);
  });

  it('the thresholds are the catalogue numbers, exactly', () => {
    expect(withMap({ stars: THRESHOLDS.featured - 1 })).not.toContain('featured');
    expect(withMap({ stars: THRESHOLDS.featured })).toContain('featured');
    expect(withMap({ downloads: THRESHOLDS.popular })).toContain('popular');
    expect(withMap({ downloads: THRESHOLDS.popular })).not.toContain('legend');
    expect(withMap({ downloads: THRESHOLDS.legend })).toContain('legend');
    expect(withMap({ objects: THRESHOLDS.worldbuilder - 1 })).not.toContain('worldbuilder');
    expect(withMap({ objects: THRESHOLDS.worldbuilder })).toContain('worldbuilder');
    expect(deriveBadgeSet({ ...none, maps: Array.from({ length: THRESHOLDS.prolific }, () => map()) })).toContain('prolific');
    expect(deriveBadgeSet({ ...none, maps: Array.from({ length: THRESHOLDS.prolific - 1 }, () => map()) })).not.toContain('prolific');
    expect(deriveBadgeSet({ ...none, comments: THRESHOLDS.voice })).toEqual(['voice']);
    expect(deriveBadgeSet({ ...none, joinedRank: THRESHOLDS.pioneer })).toEqual(['pioneer']);
    expect(deriveBadgeSet({ ...none, joinedRank: THRESHOLDS.pioneer + 1 })).toEqual([]);
  });

  it('credit runs both ways', () => {
    expect(deriveBadgeSet({ ...none, usedIn: 1 })).toEqual(['wellspring']);
    expect(withMap({ credits: 2 })).toContain('crew');
  });

  it('pictures and models', () => {
    expect(withMap({ images: 1 })).toContain('artist');
    expect(withMap({ models: 1 })).toContain('modeller');
  });

  it('a chronicler wrote up most of a map; a keeper runs the place', () => {
    expect(withMap({ density: THRESHOLDS.chronicler - 0.01 })).not.toContain('chronicler');
    expect(withMap({ density: THRESHOLDS.chronicler })).toContain('chronicler');
    expect(deriveBadgeSet({ ...none, admin: true })).toEqual(['keeper']);
  });

  it('comes out in catalogue order, whatever the facts', () => {
    const all = deriveBadgeSet({
      maps: Array.from({ length: 5 }, () => map({ kind: 'starmap', stars: 100, downloads: 5000, images: 2, models: 1, objects: 300, credits: 1, density: 1 })),
      usedIn: 3, comments: 40, joinedRank: 1, admin: true
    });
    expect(all).toEqual(BADGE_IDS);
  });
});

describe('the art', () => {
  it('is twelve by twelve of the five characters, for every badge', () => {
    for (const id of BADGE_IDS) {
      const art = CATALOGUE[id].art;
      expect(art, id).toHaveLength(12);
      for (const row of art) {
        expect(row, id).toHaveLength(12);
        expect(row, id).toMatch(/^[.#+\-o]+$/);
      }
      expect(art.some((r) => r.includes('#')), id).toBe(true);
    }
  });

  it('has a name and a plain sentence on how, for every badge', () => {
    for (const id of BADGE_IDS) {
      expect(CATALOGUE[id].name.length, id).toBeGreaterThan(2);
      expect(CATALOGUE[id].how.endsWith('.'), id).toBe(true);
    }
  });
});
