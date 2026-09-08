// THE CUSTOM RULES A MAP CARRIES (D-71), read out of the save and put back into one.
//
// ============================================================================================
// The owner, 2026-09-08, on what should happen when somebody copies a body that needs a custom
// liquid, engine or biosphere: *"1 and 2 should ride on the back... i.e. the site has a browse
// option for all these custom overrides... and they can be copied and pasted in using the mechanism
// from 1. the rest is not needed."*
//
// So there is ONE mechanism and two things that produce for it: a map clip carries the rules its
// nodes need, and a browse page carries one rule on its own. Both are the same envelope and the
// same paste.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS FIXES, because it is not a missing feature so much as a quiet wrong answer.
//
// Custom definitions do NOT live on the node. They live on the STARMAP, in `rulePackOverrides`, and
// the app builds an effective rule pack of shipped-plus-overrides. A clip carries nodes only. So on
// the far side:
//
//   liquidDef(name, pack) -> allLiquids(pack).find((l) => l.name === name)   // undefined
//
// The paste reports success, the body arrives, and everything derived from the liquid it names -
// phase, appearance, climate - quietly falls back. Not a crash and not a warning: a planet that is
// subtly wrong in a way the person who pasted it cannot see.
// ---------------------------------------------------------------------------------------------
//
// HOW MUCH THE HUB IS ALLOWED TO KNOW, and the line matters because getting it wrong is how two
// codebases drift:
//
//   IT MAY READ NAMES.      Enough to list a liquid called "Unobtainium" on a browse page. Shallow,
//                           and it is the whole of what a library needs.
//   IT MAY NOT WORK OUT     Which node field references which definition is ENGINE knowledge that
//   WHAT IS REFERENCED.     changes whenever a new field appears. A map clip therefore carries the
//                           overrides WHOLE and the engine narrows them to what the nodes need -
//                           the same reasoning that declined `rootKind` on the envelope (D-58): the
//                           app has to check a claim against the nodes anyway, so a second answer
//                           is the fault rather than a convenience.
// ============================================================================================

/** The keys of `RulePackOverrides` this hub understands well enough to name. */
export type OverrideKind =
  | 'liquids' | 'gasPhysics' | 'atmosphereCompositions'
  | 'pigments' | 'morphologies'
  | 'fuelDefinitions' | 'engineDefinitions' | 'sensorDefinitions';

/** One customisation, as a browse page shows it and as a clip carries it. */
export interface OverrideItem {
  kind: OverrideKind;
  /** The identity the engine looks it up by: a `name`, a `key`, an `id`, or a record key. */
  key: string;
  /** What to show a person. Falls back to the key when a definition has no separate label. */
  label: string;
  /**
   * True when the hub can see this is a WHOLE definition rather than a few changed fields.
   *
   * `pigments` and `morphologies` are stored as deltas (`PackListDelta`), where an entry is either
   * a new record or only the fields that differ from the shipped one. **The hub cannot tell those
   * apart without the shipped pack**, so it does not pretend to: a partial entry is offered as a
   * change to something, not as a new thing somebody invented.
   */
  whole: boolean;
  /** The definition itself, exactly as the save carried it. Never rewritten. */
  def: unknown;
}

/** Human words for a kind. Used on the browse page and in the "what came with this" line. */
export const KIND_LABEL: Record<OverrideKind, string> = {
  liquids: 'Liquid',
  gasPhysics: 'Gas',
  atmosphereCompositions: 'Atmosphere mix',
  pigments: 'Pigment',
  morphologies: 'Biosphere form',
  fuelDefinitions: 'Fuel',
  engineDefinitions: 'Engine',
  sensorDefinitions: 'Sensor'
};

/** Plural, for a heading. English is not regular enough to derive this. */
export const KIND_PLURAL: Record<OverrideKind, string> = {
  liquids: 'Liquids',
  gasPhysics: 'Gases',
  atmosphereCompositions: 'Atmosphere mixes',
  pigments: 'Pigments',
  morphologies: 'Biosphere forms',
  fuelDefinitions: 'Fuels',
  engineDefinitions: 'Engines',
  sensorDefinitions: 'Sensors'
};

/**
 * WHICH FIELD IS THE IDENTITY, per kind, and they genuinely differ - `LiquidDef` has `name`,
 * `PigmentDef` has `key`, `EngineDefinition` has `id`. Guessing one rule for all of them would put
 * "undefined" under a third of a browse page.
 */
const IDENTITY: Record<OverrideKind, ReadonlyArray<string>> = {
  liquids: ['name'],
  gasPhysics: [],                       // the record KEY is the gas
  atmosphereCompositions: ['name'],
  pigments: ['key'],
  morphologies: ['key'],
  fuelDefinitions: ['id', 'name'],
  engineDefinitions: ['id', 'name'],
  sensorDefinitions: ['id', 'name']
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const text = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** The first identity field a record actually has. */
function identityOf(kind: OverrideKind, def: unknown): string {
  if (!isObject(def)) return '';
  for (const field of IDENTITY[kind]) {
    const found = text(def[field]);
    if (found) return found;
  }
  return '';
}

const labelOf = (def: unknown, fallback: string): string =>
  (isObject(def) ? text(def.label) || text(def.name) : '') || fallback;

/**
 * Every customisation in a save's `rulePackOverrides`, flattened.
 *
 * TOLERANT BY DESIGN. This reads a document a stranger uploaded and a shape another codebase owns:
 * an unknown key is skipped, a malformed entry is skipped, and nothing here throws. The worst
 * outcome must be "the browse page is missing an item", never "the upload failed".
 */
export function readOverrides(overrides: unknown): OverrideItem[] {
  if (!isObject(overrides)) return [];
  const out: OverrideItem[] = [];

  for (const kind of Object.keys(KIND_LABEL) as OverrideKind[]) {
    const value = overrides[kind];
    if (value == null) continue;

    // A plain record of gas name -> physics. The key IS the identity.
    if (kind === 'gasPhysics') {
      if (!isObject(value)) continue;
      for (const [key, def] of Object.entries(value)) {
        if (!text(key)) continue;
        out.push({ kind, key, label: labelOf(def, key), whole: true, def });
      }
      continue;
    }

    // An `atmosphereCompositions` entry wraps its record: `{ value: { name, ... } }`.
    if (Array.isArray(value)) {
      for (const entry of value) {
        const def = kind === 'atmosphereCompositions' && isObject(entry) && isObject(entry.value)
          ? entry.value : entry;
        const key = identityOf(kind, def);
        if (!key) continue;
        out.push({ kind, key, label: labelOf(def, key), whole: true, def: entry });
      }
      continue;
    }

    // A `PackListDelta`: `{ order?: string[], entries?: Record<key, Partial<T>> }`. The map key is
    // the identity, and an entry may be a whole record or only the fields that were changed.
    if (isObject(value) && isObject(value.entries)) {
      for (const [key, def] of Object.entries(value.entries)) {
        if (!text(key)) continue;
        // A record carrying its own identity field is one somebody wrote whole; a bag of two
        // changed numbers is a tweak to something shipped. The hub says which it can see.
        out.push({ kind, key, label: labelOf(def, key), whole: !!identityOf(kind, def), def });
      }
    }
  }

  return out;
}

/**
 * Rebuild a `rulePackOverrides` object carrying exactly these items and nothing else.
 *
 * This is what a browse page's Copy produces: one liquid, in the shape the engine already merges,
 * so a rules clip and a map clip are the same thing to the paste (D-71).
 *
 * THE DELTA KINDS GO BACK AS DELTAS, with no `order`. Order says where a thing sits in a list the
 * destination has never seen, and imposing the source campaign's ordering on somebody else's pack
 * would reorder entries they never asked about.
 */
export function overridesFrom(items: OverrideItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of items) {
    if (item.kind === 'gasPhysics') {
      const bag = (out.gasPhysics ?? {}) as Record<string, unknown>;
      bag[item.key] = item.def;
      out.gasPhysics = bag;
    } else if (item.kind === 'pigments' || item.kind === 'morphologies') {
      const delta = (out[item.kind] ?? { entries: {} }) as { entries: Record<string, unknown> };
      delta.entries[item.key] = item.def;
      out[item.kind] = delta;
    } else {
      const list = (out[item.kind] ?? []) as unknown[];
      list.push(item.def);
      out[item.kind] = list;
    }
  }
  return out;
}

/**
 * A stable identity for one customisation, so the same liquid published on four maps is ONE row in
 * a library rather than four.
 *
 * KIND AND KEY ONLY, deliberately not the definition's contents. Two GMs with a differently tuned
 * "Liquid Ammonia" are talking about the same thing and a reader wants them side by side; hashing
 * the body would file them as unrelated. What it costs is that the library must show WHICH map a
 * copy came from, which it wants to do anyway - the credit belongs to somebody.
 */
export const overrideId = (kind: OverrideKind, key: string): string =>
  kind + ':' + key.trim().toLowerCase();

/** A one-line summary of what a clip is bringing, for the receipt after a paste. */
export function describeOverrides(items: OverrideItem[]): string {
  if (!items.length) return '';
  const counts = new Map<OverrideKind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const parts = [...counts.entries()].map(([kind, n]) =>
    n + ' ' + (n === 1 ? KIND_LABEL[kind].toLowerCase() : KIND_PLURAL[kind].toLowerCase()));
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

// ============================================================================================
// TELLING "THE SAME ONE AGAIN" FROM "A DIFFERENT ONE WITH THE SAME NAME" (D-71).
//
// The owner: *"the receiving end needs to identify duplicates to what it had and discard (i.e. a
// related object pasted before)."* Exactly - and it is the common case, not the edge one: paste a
// star, then paste one of its planets, and every rule the second clip carries is one the first
// already brought.
//
// THE MERGE HAS THREE OUTCOMES AND ONLY ONE OF THEM IS INTERESTING:
//
//   absent                -> add it
//   present and IDENTICAL -> discard, silently. This is the ordinary case above.
//   present and DIFFERENT -> DO NOT OVERWRITE. Somebody else's "Liquid Unobtainium" is not this
//                            one, and replacing it would silently change bodies they already had -
//                            turning a quiet wrong answer on one pasted planet into a quiet wrong
//                            answer across their whole campaign. Rename the incoming one and point
//                            the pasted nodes at the new name.
//
// WHICH MEANS "IDENTICAL" HAS TO BE DECIDABLE, and the trap is key order. `{a:1,b:2}` and
// `{b:2,a:1}` are the same definition and different strings, and JSON key order is decided by
// whatever built the object - a different engine version, a hand-edited save, a round trip through
// a database. Comparing the raw text would report a duplicate as a conflict and rename something
// that did not need renaming, which is the failure a person would actually notice.
//
// So both sides compare CANONICAL form: keys sorted, recursively. The hub publishes the rule here
// rather than shipping a hash for the engine to trust, for the same reason as everything else on
// this seam (D-58) - a claim the far side must verify anyway is not worth carrying.
// ============================================================================================

/** Stable JSON: object keys sorted at every depth, arrays left in their own order. */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isObject(v)) {
      const out: Record<string, unknown> = {};
      // ARRAY ORDER IS MEANING and object key order is not. A pigment's `bands` are a sequence;
      // the fields of a band are a set. Sorting the first would change the definition.
      for (const key of Object.keys(v).sort()) out[key] = walk(v[key]);
      return out;
    }
    return v;
  };
  try {
    return JSON.stringify(walk(value)) ?? '';
  } catch {
    // A cycle, or a value JSON cannot hold. Two things that cannot be compared are not the same.
    return '';
  }
}

/**
 * Whether two definitions are the same thing, whatever order their fields were written in.
 *
 * Returns FALSE for anything uncomparable, which is the safe direction: the caller then treats it
 * as a conflict and renames rather than silently discarding something it could not read.
 */
export function sameDefinition(a: unknown, b: unknown): boolean {
  const left = canonical(a);
  return !!left && left === canonical(b);
}

/**
 * Group items that are the same customisation, for a library that shows one row per thing.
 *
 * KIND AND KEY GROUP; the canonical form then says whether the maps agree about it. Two GMs with a
 * differently tuned "Liquid Ammonia" belong side by side under one name - a reader is looking for
 * the liquid, and being told there are two versions of it is the useful part, not a filing error.
 */
export function groupOverrides(
  items: Array<OverrideItem & { systemId: string }>
): Array<{ id: string; kind: OverrideKind; key: string; label: string; versions: number; systems: string[] }> {
  const by = new Map<string, { item: OverrideItem; shapes: Set<string>; systems: Set<string> }>();
  for (const item of items) {
    const id = overrideId(item.kind, item.key);
    const seen = by.get(id) ?? { item, shapes: new Set<string>(), systems: new Set<string>() };
    seen.shapes.add(canonical(item.def));
    seen.systems.add(item.systemId);
    by.set(id, seen);
  }
  return [...by.entries()].map(([id, v]) => ({
    id,
    kind: v.item.kind,
    key: v.item.key,
    label: v.item.label,
    versions: v.shapes.size,
    systems: [...v.systems]
  }));
}

/**
 * The overrides a save document carries, or null.
 *
 * NULL RATHER THAN AN EMPTY OBJECT, because absence is a statement and `{}` is not: a column full
 * of empty objects says every map on the hub was checked and customises nothing, which is not
 * something anybody recorded. Same rule the engine writes its registries by (`saveRegistries.ts`:
 * *"a container with nothing in it is not a statement"*).
 */
export function rulePackOverridesOf(doc: unknown): Record<string, unknown> | null {
  if (!isObject(doc)) return null;
  const overrides = doc.rulePackOverrides;
  if (!isObject(overrides) || !Object.keys(overrides).length) return null;
  // A document whose overrides object holds nothing this hub can name is still stored whole - a
  // newer engine key is not a reason to drop the lot, and the paste side may well understand it.
  return overrides;
}
