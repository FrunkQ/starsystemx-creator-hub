// The rule engine. The test that matters most is the baseline one: a facet that is universally
// true is worse than no facet, because it teaches people the pills cannot be trusted.
import { describe, it, expect } from 'vitest';
import { applyFacetRules, rulesFrom, DEFAULT_FACET_RULES } from '../src/lib/bundle/facetRules';
import type { ShippedManifest } from '../src/lib/bundle/shipped';

const find = (r: any[], id: string) => r.find((x) => x.id === id);

/** What the engine's manifest said at v3.0.316, abbreviated to the lists these rules use. */
const SHIPPED: ShippedManifest = {
  appVersion: '3.0.316',
  calendars: ['Chinese Lunisolar (Simplified)', 'Earth Gregorian', 'Mayan Haab (Simplified)', 'Star Trek Stardate'],
  tagCategories: [
    'status', 'owner', 'purpose', 'resource', 'class', 'drive', 'frontier',
    'anomaly', 'universe', 'disposition', 'tech', 'science', 'intrigue'
  ],
  gases: ['Ar', 'CO2']
};

describe('baselines - what SSE ships is not "custom"', () => {
  it('reports NO custom calendars for a map carrying only the shipped one', () => {
    // Every real starmap has "Earth Gregorian". Counting registry keys naively would report one
    // custom calendar for every map ever made.
    const r = applyFacetRules({ temporal: { temporal_registry: { 'Earth Gregorian': {} } } }, undefined, SHIPPED);
    expect(find(r, 'custom-calendars')).toBeUndefined();
  });

  it('reports NO custom calendars for the FULL shipped set', () => {
    // Regression: the baseline was originally just 'Earth Gregorian', and every real starmap
    // carries all four - so the facet fired on every map, reporting three custom calendars for
    // maps that had none. Caught only by running against real files.
    const r = applyFacetRules({
      temporal: { temporal_registry: {
        'Earth Gregorian': {}, 'Star Trek Stardate': {},
        'Mayan Haab (Simplified)': {}, 'Chinese Lunisolar (Simplified)': {}
      } }
    }, undefined, SHIPPED);
    expect(find(r, 'custom-calendars')).toBeUndefined();
  });

  it('counts only the calendars beyond the baseline', () => {
    const r = applyFacetRules({
      temporal: { temporal_registry: { 'Earth Gregorian': {}, 'Hystrine Reckoning': {}, 'Uggi Standard': {} } }
    }, undefined, SHIPPED);
    expect(find(r, 'custom-calendars').count).toBe(2);
  });

  it('is case-insensitive about the baseline', () => {
    const r = applyFacetRules({ temporal: { temporal_registry: { 'earth gregorian': {} } } }, undefined, SHIPPED);
    expect(find(r, 'custom-calendars')).toBeUndefined();
  });

  it('reports no custom tag categories for the thirteen SSE ships', () => {
    // THE SECOND DRIFT, and the reason the baselines are fetched now: the hand-copied list said
    // nine, the engine had grown to thirteen, and a map carrying `science` and `intrigue` was
    // credited with custom categories it did not have.
    const r = applyFacetRules({ coiCategories: SHIPPED.tagCategories!.map((id) => ({ id, label: id })) }, undefined, SHIPPED);
    expect(find(r, 'custom-tag-categories')).toBeUndefined();
  });

  it('counts a genuinely custom tag category', () => {
    const r = applyFacetRules({ coiCategories: [{ id: 'status' }, { id: 'smuggling-routes' }] }, undefined, SHIPPED);
    expect(find(r, 'custom-tag-categories').count).toBe(1);
  });
});

describe('no baseline, no facet', () => {
  // The rule that keeps a fetch failure honest: with nothing to compare against, the shipped
  // calendars would all read as custom. Saying nothing is the only truthful answer.
  it('skips a baseline rule entirely when the manifest is missing', () => {
    const doc = { temporal: { temporal_registry: { 'Earth Gregorian': {}, 'Hystrine Reckoning': {} } } };
    expect(find(applyFacetRules(doc), 'custom-calendars')).toBeUndefined();
    expect(find(applyFacetRules(doc, undefined, null), 'custom-calendars')).toBeUndefined();
  });

  it('skips it when the manifest is there but says nothing about that list', () => {
    const partial: ShippedManifest = { appVersion: '3.0.316' };
    const r = applyFacetRules({ coiCategories: [{ id: 'smuggling-routes' }] }, undefined, partial);
    expect(find(r, 'custom-tag-categories')).toBeUndefined();
  });

  it('leaves rules that need no baseline alone', () => {
    // A manifest failure must not silence the whole engine - only the rules that depend on it.
    const r = applyFacetRules({ poiPacks: [{ id: 'smugglers' }] });
    expect(find(r, 'poi-packs').count).toBe(1);
  });
});

describe('value-carrying tags', () => {
  it('collects the distinct values, because the kinds are the interesting part', () => {
    const doc = {
      nodes: [
        { tags: [{ key: 'weather/precipitation', value: 'sulfuric-acid virga' }] },
        { tags: [{ key: 'weather/lightning', value: 'constant' }] },
        { tags: [{ key: 'weather/lightning', value: 'constant' }] }
      ]
    };
    const w = find(applyFacetRules(doc), 'weather');
    expect(w.count).toBe(3);
    expect(w.values).toEqual(['constant', 'sulfuric-acid virga']);
  });

  it('respects minCount, so a single stray tag does not earn a pill', () => {
    const one = applyFacetRules({ nodes: [{ tags: [{ key: 'weather/fog', value: 'thin' }] }] });
    expect(find(one, 'weather')).toBeUndefined();
  });
});

describe('rules that are waiting on the engine', () => {
  it('skips disabled rules entirely', () => {
    // The container does not exist in a save yet; the rule documents the key the hub will look for.
    const r = applyFacetRules({ customGases: [{ name: 'chlorine haze' }] });
    expect(find(r, 'custom-gases')).toBeUndefined();
  });

  it('counts them the moment the rule is enabled - no code change', () => {
    const enabled = DEFAULT_FACET_RULES.map((x) => (x.id === 'custom-gases' ? { ...x, enabled: true } : x));
    // Their baseline is already in the manifest, so enabling the rule is all that is left to do.
    const r = applyFacetRules({ customGases: [{ name: 'chlorine haze' }, { name: 'Ar' }] }, enabled, SHIPPED);
    expect(find(r, 'custom-gases').count).toBe(1);
  });
});

describe('robustness', () => {
  it('never throws on hostile input', () => {
    for (const doc of [null, undefined, 42, [], {}, { temporal: 'x' }, { coiCategories: 'x' }]) {
      expect(() => applyFacetRules(doc)).not.toThrow();
    }
  });

  it('survives a bad regex in a config row rather than taking the page down', () => {
    const bad = [{ id: 'x', label: 'X', category: 'C', tagPattern: '([' }];
    expect(() => applyFacetRules({ nodes: [] }, bad)).not.toThrow();
  });

  it('falls back to defaults when the config row is unusable', () => {
    expect(rulesFrom(null)).toBe(DEFAULT_FACET_RULES);
    expect(rulesFrom([])).toBe(DEFAULT_FACET_RULES);
    expect(rulesFrom([{ nonsense: true }])).toBe(DEFAULT_FACET_RULES);
  });

  it('drops a baselineFrom naming a list no manifest has, rather than skipping for ever', () => {
    const rules = rulesFrom([{ id: 'x', label: 'X', category: 'C', countItemsAt: 'xs', baselineFrom: 'unicorns' }]);
    expect(rules[0].baselineFrom).toBeUndefined();
    expect(find(applyFacetRules({ xs: [{ id: 'a' }] }, rules), 'x').count).toBe(1);
  });
});
