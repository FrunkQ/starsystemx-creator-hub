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
// THE SUBTLETY THAT MAKES OR BREAKS THIS: `baseline`.
//
// `temporal_registry` always contains the calendars SSE ships. Counting its entries naively reports
// custom calendars for EVERY map ever made - technically true, universally present, and therefore
// worthless, which is the same failure as the `planets` pill. A baseline is the set that ships with
// the app; only what is NOT in it is custom.
//
// THIS IS NOT HYPOTHETICAL: the first version of this rule listed only 'Earth Gregorian' and fired
// on all three real starmaps, claiming three custom calendars where there were none. It was caught
// by running the rules against real files, not by reading the code.
//
// Get this wrong and the facet does not just mislead, it actively devalues every other pill beside
// it, because a browser learns the pills cannot be trusted.
// ============================================================================================
//
// TAGS ALREADY CARRY VALUES. The engine's tags are `{ key: 'weather/precipitation', value:
// 'sulfuric-acid virga' }` - categorised, and optionally valued. `collectValues` surfaces those, so
// a rule can say "what kinds of weather does this map have" and get real answers back.

export interface FacetRule {
  id: string;
  label: string;
  /** Groups the facet on the page and in the browse sidebar. */
  category: string;
  /** Count the KEYS of an object at this dotted path. For registries like `temporal_registry`. */
  countKeysAt?: string;
  /** Count the ENTRIES of an array at this dotted path. For lists like `coiCategories`. */
  countItemsAt?: string;
  /** Names that ship with SSE and are therefore not custom. Compared case-insensitively. */
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
    // THE FULL SHIPPED SET, read from the engine's `static/temporal/calendars.json` - NOT guessed.
    //
    // This was originally just 'Earth Gregorian' and it made the facet fire on every single real
    // starmap, reporting three custom calendars for maps that had none. Exactly the failure this
    // field exists to prevent, caught only by running the rules against real files.
    //
    // KEEP IN STEP with that file: a calendar SSE adds becomes a false positive here until it is
    // listed. That is the maintenance cost of the baseline, and it is worth paying.
    baseline: [
      'Earth Gregorian', 'Star Trek Stardate', 'Mayan Haab (Simplified)', 'Chinese Lunisolar (Simplified)'
    ]
  },
  {
    id: 'custom-tag-categories',
    label: 'Custom tag categories',
    category: 'Custom content',
    countItemsAt: 'coiCategories',
    // The nine categories SSE ships. Measured from the real example starmaps.
    baseline: ['status', 'owner', 'purpose', 'resource', 'class', 'drive', 'universe', 'disposition', 'tech']
  },
  { id: 'poi-packs', label: 'Points of interest', category: 'Custom content', countItemsAt: 'poiPacks' },

  // --- waiting on the engine (R-11). Keys are the hub's PROPOSAL, not something SSE ships yet. ---
  { id: 'custom-gases', label: 'Custom gases', category: 'Custom content', countItemsAt: 'customGases', enabled: false },
  { id: 'custom-liquids', label: 'Custom liquids', category: 'Custom content', countItemsAt: 'customLiquids', enabled: false },
  { id: 'custom-fuels', label: 'Custom fuels', category: 'Custom content', countItemsAt: 'customFuels', enabled: false },
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

export function applyFacetRules(doc: any, rules: FacetRule[] = DEFAULT_FACET_RULES): FacetResult[] {
  const out: FacetResult[] = [];
  if (!doc || typeof doc !== 'object') return out;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const baseline = new Set((rule.baseline ?? []).map(norm));
    let count = 0;
    let values: string[] | undefined;

    if (rule.countKeysAt) {
      const obj = at(doc, rule.countKeysAt);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        count = Object.keys(obj).filter((k) => !baseline.has(norm(k))).length;
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
  const rules = value.filter(
    (r: any) => r && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.category === 'string'
  ) as FacetRule[];
  return rules.length ? rules : DEFAULT_FACET_RULES;
}
