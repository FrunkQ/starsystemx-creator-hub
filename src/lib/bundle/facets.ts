// WHAT IS IN THIS MAP, counted — for the page, and for finding it.
//
// Derived at upload from the document itself, so they are always true and never a creator's claim.
// The creator's own tags sit alongside these; these are facts.
//
// ============================================================================================
// `roleHint` IS THE HUMAN AXIS, NOT `kind`. Measured against the real example saves: `kind` has
// only three values across every file - `body` (230), `construct` (69), `barycenter` (22) - so
// "230 bodies" tells a browsing GM nothing at all. `roleHint` is where the meaning is: star,
// planet, moon, belt, ring, station, ship, habitat, infrastructure.
//
// The difference is Uggi (27 bodies / 54 CONSTRUCTS - a built-up system) against TRAPPIST-1
// (8 bodies, nothing built). Same `kind` spread; completely different things to play in. A browser
// has to be able to tell those apart at a glance, and only roleHint does that.
// ============================================================================================
import { nodesWithSystem } from './attribution';
import { applyFacetRules, type FacetResult, type FacetRule } from './facetRules';
import { displayRole } from './roles';

export interface Facets {
  systemCount: number;
  bodyCount: number;
  constructCount: number;
  /** star, planet, moon, belt, ring, station, ship, habitat, infrastructure… */
  roleCounts: Record<string, number>;
  /** The engine's own tag namespaces - resource, orbit, frontier, intrigue, science, weather… */
  tagNamespaces: Record<string, number>;
  /** Named content signals, matched on specific tag keys rather than whole namespaces. */
  signals: Record<string, number>;
  /** Pictures and models the BUNDLE CARRIES - the ones the hub stores and moderates. */
  carriedImages: number;
  carriedModels: number;
  /** App-shipped artwork (`/images/star_types/…`). Informational: the hub hosts none of it (C-06). */
  appArtwork: number;
  /** Rule-driven facets - custom calendars, weather kinds, and whatever is added later. */
  rules: FacetResult[];
}

/**
 * Roles that earn a pill. `star` and `planet` are counted (and shown on the page) but never become
 * pills - every map has them, so as a FILTER they are worthless and as decoration they crowd out
 * the ones that matter. Uggi's 25 stations are what tell you what kind of map it is.
 */
const DISTINGUISHING_ROLES = [
  'moon', 'belt', 'ring', 'small object', 'station', 'ship', 'habitat', 'infrastructure'
] as const;

/** The pill a role earns. Roles are words; pills are slugs. */
const pillFor = (role: string) =>
  role === 'infrastructure' ? 'infrastructure' : role.replace(/ /g, '-') + 's';

export function computeFacets(doc: any, rules?: FacetRule[]): Facets {
  const f: Facets = {
    systemCount: 0, bodyCount: 0, constructCount: 0,
    roleCounts: {}, tagNamespaces: {}, signals: {},
    carriedImages: 0, carriedModels: 0, appArtwork: 0,
    rules: applyFacetRules(doc, rules)
  };

  f.systemCount = Array.isArray(doc?.systems) ? doc.systems.length : 0;

  for (const { node } of nodesWithSystem(doc)) {
    const kind = String(node?.kind ?? '');
    if (kind === 'construct') f.constructCount++;
    // A barycentre is scaffolding, not an object anyone came to look at. Counted as neither.
    else if (kind === 'body') f.bodyCount++;

    // The same rule normalise.ts stores: a planet or moon under the small-object mass counts as a
    // SMALL OBJECT (bundle/roles.ts), so "412 planets" becomes "412 small objects" everywhere.
    const role = (displayRole(node) ?? '').toLowerCase();
    if (role) f.roleCounts[role] = (f.roleCounts[role] ?? 0) + 1;

    for (const t of node?.tags ?? []) {
      const key = String(t?.key ?? '');
      const ns = key.split('/')[0];
      if (ns) f.tagNamespaces[ns] = (f.tagNamespaces[ns] ?? 0) + 1;

      // Some signals are a SPECIFIC key, not a whole namespace. `science` covers everything from
      // an impact record to a biosignature, and only one of those makes a GM pick the map.
      for (const [signal, test] of SIGNAL_TESTS) {
        if (test(key)) f.signals[signal] = (f.signals[signal] ?? 0) + 1;
      }
    }

    // C-06: only assets the bundle CARRIES are the hub's business. An app-shipped picture is
    // counted separately because it says something about the map without being ours to store.
    const url = String(node?.image?.url ?? '');
    if (url.startsWith('assets/images/')) f.carriedImages++;
    else if (url.startsWith('/images/')) f.appArtwork++;

    // A GM-uploaded model has a hash; an app-shipped starter model has only a url.
    if (typeof node?.model?.hash === 'string' && node.model.hash) f.carriedModels++;
  }

  for (const a of doc?.playerAssets ?? []) {
    if (String(a?.dataUrl ?? '').startsWith('assets/images/')) f.carriedImages++;
  }

  return f;
}

/**
 * Content signals worth their own pill, matched against real tag keys found in the example saves:
 * `science/biosignature`, `biodiversity/*`, `hydrosphere/ocean`, `frontier/life-support`.
 *
 * These are the ones a GM actually searches on. "Show me somewhere with life" is a question people
 * ask; "show me somewhere with an orbit" is not.
 */
const SIGNAL_TESTS: [string, (key: string) => boolean][] = [
  ['life', (k) => /^biodiversity\//.test(k) || /biosignature|exotic-biology/.test(k)],
  ['oceans', (k) => /^hydrosphere\/(ocean|sea)/.test(k)],
  ['ice', (k) => /^hydrosphere\/frozen/.test(k) || /water-ice/.test(k)],
  ['habitable', (k) => /life-support|habitable/.test(k)]
];

/**
 * The pills. Derived facts a person can filter on, in the order they are worth seeing.
 *
 * Kept deliberately small: a wall of thirty pills is as useless as none. Each one has to answer
 * "would somebody choose a map because of this?"
 */
export function deriveTags(f: Facets, opts: { hasGmContent: boolean }): string[] {
  const tags: string[] = [];

  // What SHAPE of thing is it - the first question anyone asks.
  if (f.systemCount > 1) {
    tags.push('campaign');
    if (f.systemCount >= 20) tags.push('large-campaign');
  } else {
    tags.push('single-system');
  }

  // What is IN it - but only the roles that DISTINGUISH one map from another.
  //
  // `star` and `planet` are deliberately absent: measured across the real example saves, every
  // single map has both, so a "planets" pill filters nothing and only crowds out the pills that do.
  // Exactly the reasoning applied to structural tag namespaces below. The interesting star case is
  // already covered by `multi-star`.
  for (const role of DISTINGUISHING_ROLES) {
    const n = f.roleCounts[role] ?? 0;
    if (n > 0) tags.push(pillFor(role));
  }
  // Uggi's 54 constructs against TRAPPIST-1's none. Worth its own pill.
  if (f.constructCount >= 20) tags.push('built-up');
  if (f.roleCounts.star >= 3) tags.push('multi-star');

  // What is interesting ABOUT the worlds - the questions GMs actually ask.
  if (f.signals.life) tags.push('life');
  if (f.signals.oceans) tags.push('oceans');
  if (f.signals.habitable) tags.push('habitable');
  if (f.signals.ice && !f.signals.oceans) tags.push('ice');

  // Does it bring its own art? A map with real artwork is a different proposition.
  if (f.carriedImages > 0) tags.push('has-artwork');
  if (f.carriedModels > 0) tags.push('has-3d-models');

  // THE SAFETY PILL, and it is deliberately not a boast either way. "player-safe" is a promise the
  // hub can actually keep, because it is checked rather than claimed (bundle/gmContent.ts).
  tags.push(opts.hasGmContent ? 'gm-notes' : 'player-safe');

  // Rule-driven facets earn a pill too, so "custom-calendars" becomes filterable the moment the
  // rule exists - without this function knowing anything about calendars.
  for (const r of f.rules) tags.push(r.id);

  // The engine's own tag namespaces are ready-made discovery axes: a map thick with `intrigue` is
  // a different night's play from one thick with `resource`. Only the strongly-present ones.
  const strong = Object.entries(f.tagNamespaces)
    .filter(([ns, n]) => n >= 10 && !STRUCTURAL_NAMESPACES.has(ns))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ns]) => ns);
  tags.push(...strong);

  return [...new Set(tags)];
}

// Present on almost every body, so they distinguish nothing and would crowd out the pills that do.
const STRUCTURAL_NAMESPACES = new Set(['orbit', 'spin', 'barycenter', 'visibility', 'status', 'flight']);

/** Human sizes for the page. Bytes are honest but unreadable. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
