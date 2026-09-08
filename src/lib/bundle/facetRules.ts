// A FLEXIBLE, CATEGORISED FACET SYSTEM — rules, not hardcoded counters.
//
// ============================================================================================
// WHY A RULE ENGINE. The interesting things in a map are a moving target: today the hub can count
// custom calendars and tag categories, because those already ride in the save. When Star System
// Explorer gains custom gases, fuels and engines, those will ride in the save too - and adding
// "Custom Gases: 3" should then be A CONFIG ROW, not a deploy.
//
// So a facet is declared, not coded:
//
//   { id: 'custom-calendars', label: 'Custom calendars', category: 'Custom content',
//     countKeysAt: 'temporal.temporal_registry', baseline: [...the four SSE ships] }
//
// ============================================================================================
// THE SUBTLETY THAT MAKES OR BREAKS THIS: the baseline.
//
// `temporal_registry` always contains the calendars SSE ships. Counting its entries naively reports
// custom calendars for EVERY map ever made - technically true, universally present, and therefore
// worthless, which is the same failure as the `planets` pill. A baseline is the set that ships with
// the app; only what is NOT in it is custom.
//
// THIS IS NOT HYPOTHETICAL, TWICE. The first version of this rule listed only 'Earth Gregorian' and
// fired on all three real starmaps, claiming three custom calendars where there were none. It was
// corrected by hand from the engine's repo - and that hand-copied list then went stale too: it said
// nine tag categories where the engine had grown to thirteen, so a map carrying the newer four was
// credited with custom categories it did not have.
//
// SO THE BASELINE IS NO LONGER WRITTEN HERE. `baselineFrom` names a list in the engine's own
// shipped-content manifest (R-13, `bundle/shipped.ts`), fetched and cached; `baseline` survives
// only as the escape hatch for a rule defined in the `facet_rules` config row. A rule whose
// baseline is UNKNOWN is skipped rather than run without one, because a facet that fires on every
// map devalues every other pill beside it - a browser learns the pills cannot be trusted.
// ============================================================================================
//
// (See `bundle/shipped.ts` for where the baselines now come from, and why they are not written here.)
//
// TAGS ALREADY CARRY VALUES. The engine's tags are `{ key: 'weather/precipitation', value:
// 'sulfuric-acid virga' }` - categorised, and optionally valued. `collectValues` surfaces those, so
// a rule can say "what kinds of weather does this map have" and get real answers back.

import { baselineFor, isBaselineKey, type BaselineKey, type ShippedManifest } from './shipped';

export interface FacetRule {
  id: string;
  label: string;
  /** Groups the facet on the page and in the browse sidebar. */
  category: string;
  /** Count the KEYS of an object at this dotted path. For registries like `temporal_registry`. */
  countKeysAt?: string;
  /** Count the ENTRIES of an array at this dotted path. For lists like `coiCategories`. */
  countItemsAt?: string;
  /**
   * The list in the engine's shipped-content manifest that says what is NOT custom (R-13).
   * The rule is skipped entirely when that list is unknown - never run with an empty baseline.
   */
  baselineFrom?: BaselineKey;
  /**
   * Names that ship with SSE and are therefore not custom, written out. Compared case-insensitively.
   * For a rule defined in the `facet_rules` config row against something the manifest does not
   * list; the shipped rules use `baselineFrom` so no copy of the engine's data lives here.
   */
  baseline?: string[];
  /** Count nodes whose tags match this pattern (a string, compiled as a case-insensitive regex). */
  tagPattern?: string;
  /** Collect the distinct VALUES of tags matching `tagPattern`, rather than counting them. */
  collectValues?: boolean;
  /** Below this, the facet is not worth showing. Defaults to 1. */
  minCount?: number;
  /** When false the rule is parsed but skipped - for facets whose container does not exist yet. */
  enabled?: boolean;
}

export interface FacetResult {
  id: string;
  label: string;
  category: string;
  count: number;
  /** Distinct values, when the rule asked for them. */
  values?: string[];
}

/**
 * Rules that work against saves as they exist TODAY, plus the ones waiting on the engine.
 *
 * The disabled entries are deliberately shipped rather than omitted: they document the exact key
 * the hub will look for, which is what `docs/sse-requirements.md` R-11 asks the engine to provide.
 * When the container appears, this becomes `enabled: true` in a config row.
 */
export const DEFAULT_FACET_RULES: FacetRule[] = [
  {
    id: 'custom-calendars',
    label: 'Custom calendars',
    category: 'Custom content',
    countKeysAt: 'temporal.temporal_registry',
    // The shipped set comes from the engine's manifest, which is generated from the same
    // `static/temporal/calendars.json` a hand-copied list used to be transcribed out of.
    baselineFrom: 'calendars'
  },
  {
    id: 'custom-tag-categories',
    label: 'Custom tag categories',
    category: 'Custom content',
    countItemsAt: 'coiCategories',
    // The manifest takes these from the engine's `pristineTagCategories()` - the same baseline the
    // save delta uses - so the two agree by construction rather than by promise.
    baselineFrom: 'tagCategories'
  },
  { id: 'poi-packs', label: 'Points of interest', category: 'Custom content', countItemsAt: 'poiPacks' },

  // --- waiting on the engine (R-11). Keys are the hub's PROPOSAL, not something SSE ships yet. ---
  // Their baselines already exist: the manifest lists the shipped gases, liquids and fuels, so
  // these become `enabled: true` in a config row the day a save carries the container.
  { id: 'custom-gases', label: 'Custom gases', category: 'Custom content', countItemsAt: 'customGases', baselineFrom: 'gases', enabled: false },
  { id: 'custom-liquids', label: 'Custom liquids', category: 'Custom content', countItemsAt: 'customLiquids', baselineFrom: 'liquids', enabled: false },
  { id: 'custom-fuels', label: 'Custom fuels', category: 'Custom content', countItemsAt: 'customFuels', baselineFrom: 'fuels', enabled: false },
  { id: 'custom-engines', label: 'Custom engines', category: 'Custom content', countItemsAt: 'customEngines', enabled: false },
  { id: 'custom-reactions', label: 'Custom reactions', category: 'Custom content', countItemsAt: 'customReactions', enabled: false },

  // --- value-carrying tags: what KINDS of thing, not just how many ---
  { id: 'weather', label: 'Weather', category: 'Worlds', tagPattern: '^weather/', collectValues: true, minCount: 2 },
  { id: 'biospheres', label: 'Biospheres', category: 'Worlds', tagPattern: '^biodiversity/|biosignature|exotic-biology' },
  { id: 'resources', label: 'Resources', category: 'Worlds', tagPattern: '^resource/', collectValues: true, minCount: 5 }
];

/** Walk a dotted path without throwing on anything missing along the way. */
function at(doc: any, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), doc);
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export function applyFacetRules(
  doc: any, rules: FacetRule[] = DEFAULT_FACET_RULES, shipped?: ShippedManifest | null
): FacetResult[] {
  const out: FacetResult[] = [];
  if (!doc || typeof doc !== 'object') return out;

  for (const rule of rules) {
    if (rule.enabled === false) continue;

    // THE BASELINE, OR NOTHING. A rule that needs to know what the app ships and cannot find out
    // is skipped: running it with an empty baseline would report every shipped calendar as custom.
    const named = rule.baselineFrom ? baselineFor(shipped, rule.baselineFrom) : null;
    if (rule.baselineFrom && !named) continue;
    const baseline = new Set([...(named ?? []), ...(rule.baseline ?? [])].map(norm));
    let count = 0;
    let values: string[] | undefined;

    if (rule.countKeysAt) {
      const obj = at(doc, rule.countKeysAt);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        // THE NAMES, not only the number (D-72). `values` already existed for the tag rules and
        // costs nothing here, and a count on its own cannot be spoken: "this map keeps time on a
        // custom calendar" is a sentence, "1 custom calendar" is a statistic. The call-out on the
        // map page needs the name, because a calendar is the ONE customisation a clip cannot carry.
        const own = Object.keys(obj).filter((k) => !baseline.has(norm(k)));
        count = own.length;
        if (own.length) values = own.sort().slice(0, 12);
      }
    }

    if (rule.countItemsAt) {
      const arr = at(doc, rule.countItemsAt);
      if (Array.isArray(arr)) {
        // An entry is identified by whichever of these it carries - the shapes differ per container.
        count += arr.filter((e: any) => {
          const name = norm(e?.id ?? e?.key ?? e?.name ?? e?.label);
          return !name || !baseline.has(name);
        }).length;
      }
    }

    if (rule.tagPattern) {
      let re: RegExp;
      try {
        re = new RegExp(rule.tagPattern, 'i');
      } catch {
        continue; // a bad pattern in a config row must not take the page down
      }
      const seen = new Set<string>();
      for (const node of allNodes(doc)) {
        for (const t of node?.tags ?? []) {
          if (!re.test(String(t?.key ?? ''))) continue;
          count++;
          if (rule.collectValues && t?.value != null) seen.add(String(t.value));
        }
      }
      if (rule.collectValues) values = [...seen].sort().slice(0, 12);
    }

    if (count >= (rule.minCount ?? 1)) {
      out.push({ id: rule.id, label: rule.label, category: rule.category, count, values });
    }
  }

  return out;
}

/** Both document shapes, without importing the attribution module's generator. */
function* allNodes(doc: any): Generator<any> {
  if (Array.isArray(doc?.nodes)) for (const n of doc.nodes) yield n;
  for (const entry of doc?.systems ?? []) for (const n of entry?.system?.nodes ?? []) yield n;
}

/** Parse a `facet_rules` config row, falling back to the defaults when it is unusable. */
export function rulesFrom(value: unknown): FacetRule[] {
  if (!Array.isArray(value) || !value.length) return DEFAULT_FACET_RULES;
  const rules = value
    .filter((r: any) => r && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.category === 'string')
    // A `baselineFrom` naming a list no manifest has would skip the rule for ever, silently. Drop
    // the field instead: the rule then runs on whatever `baseline` it wrote out, or on none.
    .map((r: any) => (r.baselineFrom && !isBaselineKey(r.baselineFrom) ? { ...r, baselineFrom: undefined } : r)) as FacetRule[];
  return rules.length ? rules : DEFAULT_FACET_RULES;
}
