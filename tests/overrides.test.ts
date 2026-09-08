// READING AND REBUILDING A MAP'S CUSTOM RULES (D-71).
//
// This reads a shape ANOTHER codebase owns, out of a document a stranger uploaded. So the tests
// come in two halves: the shapes really used by `RulePackOverrides` in the engine's types.ts, and
// the junk a hostile or merely old save can contain - where the only acceptable outcome is a
// missing row on a browse page, never a failed upload.
import { describe, it, expect } from 'vitest';
import {
  readOverrides, overridesFrom, overrideId, describeOverrides, KIND_LABEL,
  sameDefinition, groupOverrides, customCalendars, calendarCaveat
} from '../src/lib/bundle/overrides';
import { buildClip, buildRulesClip } from '../src/lib/bundle/clip';

const SOURCE = { site: 'the hub', url: 'https://hub.test/s/m', title: 'A Map', creator: 'FrunkQ' };

/** The real shapes, one of each, taken from the engine's own type declarations. */
const overrides = {
  // LiquidDef: identity is `name`, with a separate `label`.
  liquids: [{ name: 'unobtainium', label: 'Liquid Unobtainium', meltK: 20, boilK: 90 }],
  // A record keyed BY THE GAS. There is no name field inside.
  gasPhysics: { CH4: { molarMassKg: 0.016 }, NH3: { molarMassKg: 0.017 } },
  // Each entry WRAPS its record.
  atmosphereCompositions: [{ value: { name: 'Thin methane', mix: { CH4: 0.9 } } }],
  // PigmentDef: identity is `key`. Stored as a delta.
  pigments: { entries: { violacein: { key: 'violacein', label: 'Violacein', bands: [] } } },
  // MorphologyDef: also `key`, also a delta - and this one is a TWEAK, not a whole record.
  morphologies: { order: ['moss', 'canopy'], entries: { canopy: { opacity: 0.8 } } },
  // EngineDefinition / FuelDefinition / SensorDefinition: identity is `id`, display is `name`.
  engineDefinitions: [{ id: 'q-drive', name: 'Q Drive', type: 'fusion', fuel_type_id: 'dt' }],
  fuelDefinitions: [{ id: 'dt', name: 'Deuterium-Tritium', density_kg_per_m3: 200, description: '' }],
  sensorDefinitions: [{ id: 'lidar-x', name: 'LIDAR-X', range_km: 500 }]
};

describe('readOverrides', () => {
  const items = readOverrides(overrides);

  it('finds every kind the engine can override', () => {
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(Object.keys(KIND_LABEL)));
  });

  it('reads the identity field each kind actually uses, not one guessed rule', () => {
    // LiquidDef has `name`, PigmentDef has `key`, EngineDefinition has `id`. One rule for all three
    // would put "undefined" under a third of a browse page.
    const by = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.key);
    expect(by('liquids')).toEqual(['unobtainium']);
    expect(by('pigments')).toEqual(['violacein']);
    expect(by('engineDefinitions')).toEqual(['q-drive']);
    expect(by('sensorDefinitions')).toEqual(['lidar-x']);
  });

  it('takes a gas name from the record KEY, because there is no field to read', () => {
    expect(items.filter((i) => i.kind === 'gasPhysics').map((i) => i.key).sort()).toEqual(['CH4', 'NH3']);
  });

  it('unwraps an atmosphere composition, which stores its record under `value`', () => {
    const mix = items.find((i) => i.kind === 'atmosphereCompositions')!;
    expect(mix.key).toBe('Thin methane');
    // The DEF kept is the wrapper, so putting it back gives the engine what it expects.
    expect(mix.def).toEqual({ value: { name: 'Thin methane', mix: { CH4: 0.9 } } });
  });

  it('prefers a label for display and falls back to the key', () => {
    expect(items.find((i) => i.key === 'unobtainium')!.label).toBe('Liquid Unobtainium');
    expect(items.find((i) => i.key === 'CH4')!.label).toBe('CH4');
  });

  it('does not claim a partial delta is a whole definition somebody invented', () => {
    // `morphologies.canopy` is two changed fields on a SHIPPED form. Listing that as "a custom
    // biosphere form" would be a lie the hub cannot check, because it has no copy of the base pack.
    expect(items.find((i) => i.key === 'canopy')!.whole).toBe(false);
    expect(items.find((i) => i.key === 'violacein')!.whole).toBe(true);
  });

  it('ignores `order`, which names keys that are not customisations', () => {
    // `morphologies.order` lists 'moss', which the GM never touched.
    expect(items.map((i) => i.key)).not.toContain('moss');
  });
});

describe('readOverrides survives a save it was not given', () => {
  it('returns nothing rather than throwing, for anything that is not an object', () => {
    for (const junk of [null, undefined, 'x', 42, [], true]) {
      expect(readOverrides(junk), String(junk)).toEqual([]);
    }
  });

  it('skips an unknown key instead of choking on it', () => {
    // A newer engine will add keys this hub has never heard of. That must cost a row, not an upload.
    expect(readOverrides({ somethingNew: [{ id: 'x' }], liquids: [{ name: 'a' }] }))
      .toEqual([expect.objectContaining({ kind: 'liquids', key: 'a' })]);
  });

  it('skips entries with no identity at all', () => {
    expect(readOverrides({ liquids: [{ label: 'nameless' }, { name: 'ok' }] }).map((i) => i.key))
      .toEqual(['ok']);
    expect(readOverrides({ gasPhysics: { '': {} } })).toEqual([]);
  });

  it('skips a kind whose value is the wrong shape entirely', () => {
    expect(readOverrides({ liquids: 'not a list', gasPhysics: [1, 2] })).toEqual([]);
  });
});

describe('overridesFrom', () => {
  it('round-trips: what is read can be put back and read again', () => {
    const again = readOverrides(overridesFrom(readOverrides(overrides)));
    expect(again.map((i) => i.kind + ':' + i.key).sort())
      .toEqual(readOverrides(overrides).map((i) => i.kind + ':' + i.key).sort());
  });

  it('rebuilds each kind in the shape the engine merges - list, record or delta', () => {
    const one = (kind: string) => readOverrides(overrides).filter((i) => i.kind === kind);
    expect(overridesFrom(one('liquids')).liquids).toHaveLength(1);
    expect(overridesFrom(one('gasPhysics')).gasPhysics).toHaveProperty('CH4');
    expect(overridesFrom(one('pigments'))).toEqual({
      pigments: { entries: { violacein: { key: 'violacein', label: 'Violacein', bands: [] } } }
    });
  });

  it('never carries `order` across', () => {
    // Order says where something sits in a list the DESTINATION has never seen. Imposing the source
    // campaign's ordering would reorder entries the person pasting never asked about.
    const out = overridesFrom(readOverrides(overrides)) as { morphologies?: { order?: unknown } };
    expect(out.morphologies?.order).toBeUndefined();
  });

  it('gives an empty object for nothing, so a clip carries no key at all', () => {
    expect(overridesFrom([])).toEqual({});
  });
});

describe('the two clips are one envelope', () => {
  const nodes = [{ node_id: 'a', parent_id: null, snippet: { id: 'a', name: 'A' } }];

  it('a map clip carries the rules whole, under the engine name', () => {
    const clip = buildClip(nodes, 'a', SOURCE, [], overrides)!;
    expect(clip.rulePackOverrides).toEqual(overrides);
    expect(clip.root).toBe('a');
  });

  it('a map clip with no custom rules carries no key at all', () => {
    // Absence is the signal. `rulePackOverrides: {}` in every clip on record says nothing.
    expect(buildClip(nodes, 'a', SOURCE)!.rulePackOverrides).toBeUndefined();
    expect(buildClip(nodes, 'a', SOURCE, [], {})!.rulePackOverrides).toBeUndefined();
  });

  it('a rules clip is the same envelope with no objects in it', () => {
    const clip = buildRulesClip(SOURCE, overridesFrom(readOverrides(overrides).slice(0, 1)))!;
    expect(clip.sseClip).toBe(1);
    expect(clip.nodes).toEqual([]);
    // No root: that is how a reader tells the two apart without a second marker to keep in step.
    expect(clip.root).toBeUndefined();
    expect(clip.rulePackOverrides).toBeTruthy();
  });

  it('refuses to make a rules clip out of nothing', () => {
    expect(buildRulesClip(SOURCE, {})).toBeNull();
  });
});

describe('naming them', () => {
  it('files the same liquid from four maps under one id', () => {
    // A library wants one row per thing, with the maps that use it - not four rows.
    expect(overrideId('liquids', 'Unobtainium')).toBe(overrideId('liquids', ' unobtainium '));
    expect(overrideId('liquids', 'a')).not.toBe(overrideId('gasPhysics', 'a'));
  });

  it('says what a clip is bringing, in words and in the plural', () => {
    const items = readOverrides(overrides);
    const said = describeOverrides(items);
    expect(said).toMatch(/2 gases/);
    expect(said).toMatch(/1 liquid\b/);
    expect(said).toMatch(/ and /);
    expect(describeOverrides([])).toBe('');
  });
});

describe('telling the same one again from a different one with the same name', () => {
  it('does not mind what order the fields were written in', () => {
    // THE TRAP. Key order is decided by whatever built the object - a different engine version, a
    // hand-edited save, a round trip through a database. Comparing raw text would report an
    // ordinary duplicate as a conflict and rename something that did not need renaming.
    expect(sameDefinition({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameDefinition(
      { name: 'x', meltK: 20, nested: { p: 1, q: 2 } },
      { nested: { q: 2, p: 1 }, meltK: 20, name: 'x' }
    )).toBe(true);
  });

  it('DOES mind the order of an array, because that is meaning', () => {
    // A pigment's `bands` are a sequence; the fields of a band are a set. Sorting the first would
    // change the definition.
    expect(sameDefinition({ bands: [1, 2] }, { bands: [2, 1] })).toBe(false);
  });

  it('sees a real difference', () => {
    expect(sameDefinition({ name: 'x', boilK: 90 }, { name: 'x', boilK: 91 })).toBe(false);
    expect(sameDefinition({ name: 'x' }, { name: 'x', extra: 1 })).toBe(false);
  });

  it('calls anything it cannot read DIFFERENT, which is the safe direction', () => {
    // The caller then renames rather than silently discarding something it could not compare.
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(sameDefinition(cycle, cycle)).toBe(false);
  });

  it('the same liquid pasted from two clips is one thing, not two', () => {
    // Paste a star, then one of its planets: every rule the second clip carries is one the first
    // already brought. That is the ordinary case, not the edge one.
    const a = readOverrides(overrides).find((i) => i.kind === 'liquids')!;
    const b = readOverrides(JSON.parse(JSON.stringify(overrides))).find((i) => i.kind === 'liquids')!;
    expect(overrideId(a.kind, a.key)).toBe(overrideId(b.kind, b.key));
    expect(sameDefinition(a.def, b.def)).toBe(true);
  });
});

describe('grouping them for a library', () => {
  const withMap = (systemId: string, o: unknown) =>
    readOverrides(o).map((i) => ({ ...i, systemId }));

  it('files the same liquid from four maps as one row naming four maps', () => {
    const items = ['m1', 'm2', 'm3', 'm4'].flatMap((id) => withMap(id, { liquids: overrides.liquids }));
    const rows = groupOverrides(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].versions).toHaveLength(1);
    expect(rows[0].versions[0].systems).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('counts the versions when two maps disagree about the same name', () => {
    // Being told there are two versions of a liquid is the USEFUL part, not a filing error - a
    // reader is looking for the liquid, and wants both side by side.
    const rows = groupOverrides([
      ...withMap('m1', { liquids: [{ name: 'ammonia', boilK: 240 }] }),
      ...withMap('m2', { liquids: [{ name: 'ammonia', boilK: 239 }] })
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].versions).toHaveLength(2);
    // Each version knows whose it is, because copying "ammonia" without saying whose would be a
    // choice made on somebody's behalf.
    expect(rows[0].versions.flatMap((v) => v.systems).sort()).toEqual(['m1', 'm2']);
  });

  it('keeps different kinds apart even when they share a name', () => {
    expect(groupOverrides([
      ...withMap('m1', { liquids: [{ name: 'x' }] }),
      ...withMap('m1', { gasPhysics: { x: {} } })
    ])).toHaveLength(2);
  });
});

describe('the calendar, which is the one thing a clip cannot carry (D-72)', () => {
  const results = (extra: Record<string, unknown> = {}) => [
    { id: 'custom-calendars', label: 'Custom calendars', category: 'Custom content', count: 1,
      values: ['Thousand Suns Reckoning'], ...extra }
  ];

  it('reads the names a map keeps time on', () => {
    expect(customCalendars(results())).toEqual(['Thousand Suns Reckoning']);
  });

  it('says nothing at all when there is nothing to say', () => {
    // Three different reasons - none, not evaluated, baseline unavailable - and one right answer.
    // A hub that warned about a calendar it was not sure existed would train people to ignore it.
    expect(customCalendars([])).toEqual([]);
    expect(customCalendars(null)).toEqual([]);
    expect(customCalendars(results({ count: 0 }))).toEqual([]);
    expect(customCalendars([{ id: 'custom-tag-categories', count: 3 }])).toEqual([]);
    expect(calendarCaveat([])).toBe('');
  });

  it('names it rather than shrugging', () => {
    // "a custom calendar" is a shrug; the name is a thing somebody can go and look at.
    expect(calendarCaveat(['Thousand Suns Reckoning'])).toContain('"Thousand Suns Reckoning"');
    expect(calendarCaveat(['A', 'B'])).toMatch(/"A" and "B"/);
  });

  it('still says something useful for a map indexed before the names were kept', () => {
    // `countKeysAt` recorded only a count until D-72. Older rows have no values.
    expect(calendarCaveat([], 1)).toContain('its own calendar');
    expect(calendarCaveat([], 3)).toContain('3 calendars');
  });

  it('says the DOWNLOAD is fine, because it is', () => {
    // The calendar is in the save. This is a caveat about copying ONE object, and telling somebody
    // their download was incomplete when it is not would be a worse bug than the one warned about.
    expect(calendarCaveat(['X'])).toMatch(/full\s+download does/);
    expect(calendarCaveat(['X'])).toMatch(/copying something from here does not bring it/);
  });
});
