// The rule engine. The test that matters most is the baseline one: a facet that is universally
// true is worse than no facet, because it teaches people the pills cannot be trusted.
import { describe, it, expect } from 'vitest';
import { applyFacetRules, rulesFrom, DEFAULT_FACET_RULES } from '../src/lib/bundle/facetRules';

const find = (r: any[], id: string) => r.find((x) => x.id === id);

describe('baselines - what SSE ships is not "custom"', () => {
  it('reports NO custom calendars for a map carrying only the shipped one', () => {
    // Every real starmap has "Earth Gregorian". Counting registry keys naively would report one
    // custom calendar for every map ever made.
    const r = applyFacetRules({ temporal: { temporal_registry: { 'Earth Gregorian': {} } } });
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
    });
    expect(find(r, 'custom-calendars')).toBeUndefined();
  });

  it('counts only the calendars beyond the baseline', () => {
    const r = applyFacetRules({
      temporal: { temporal_registry: { 'Earth Gregorian': {}, 'Hystrine Reckoning': {}, 'Uggi Standard': {} } }
    });
    expect(find(r, 'custom-calendars').count).toBe(2);
  });

  it('is case-insensitive about the baseline', () => {
    const r = applyFacetRules({ temporal: { temporal_registry: { 'earth gregorian': {} } } });
    expect(find(r, 'custom-calendars')).toBeUndefined();
  });

  it('reports no custom tag categories for the nine SSE ships', () => {
    const shipped = ['status', 'owner', 'purpose', 'resource', 'class', 'drive', 'universe', 'disposition', 'tech'];
    const r = applyFacetRules({ coiCategories: shipped.map((id) => ({ id, label: id })) });
    expect(find(r, 'custom-tag-categories')).toBeUndefined();
  });

  it('counts a genuinely custom tag category', () => {
    const r = applyFacetRules({ coiCategories: [{ id: 'status' }, { id: 'smuggling-routes' }] });
    expect(find(r, 'custom-tag-categories').count).toBe(1);
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
    const r = applyFacetRules({ customGases: [{ name: 'chlorine haze' }, { name: 'neon fog' }] }, enabled);
    expect(find(r, 'custom-gases').count).toBe(2);
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
});
