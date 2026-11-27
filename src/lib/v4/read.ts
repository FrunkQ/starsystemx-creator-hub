// READING A STAR SYSTEM EXPLORER 4 FILE (D-98; SSE4 build plan X2, tags design 5.7 TG15).
//
// Two kinds of file, both one JSON document:
//   - a CAMPAIGN SAVE, `schema: "sse.campaign-save/1"` (SSE4 packages/ui-contract/src/campaign.ts)
//   - a PACK MANIFEST, `format: "sse.pack/1"` (SSE4 crates/sse-pack/src/lib.rs)
//
// PURE: bytes in, a verdict out. The checks are the ones SSE4 itself makes on open, mirrored (as the
// V3 contract is, docs/contract-with-sse.md), so that a file this site lists is a file SSE4 opens.
// The final word is still SSE4's: it validates the whole stack before accepting a pack.
//
// ============================================================================================
// A PACK IS NEVER REWRITTEN. SSE4 hashes the manifest itself (canonical CBOR, SHA-256), and the site
// serves exactly the bytes it was given, so the hash SSE4 works out after a download is the hash the
// author's copy has.
//
// A CAMPAIGN LOSES ITS GM RECORD BEFORE IT IS STORED. The kernel's export carries the GM-only record
// (notes, kept values, actors) as `record` and `record_head`; SSE4's own `publicExport` strips both
// before anything leaves the GM's machine, and so does this. The undo and redo stacks go too: they
// are one GM's editing history, not the campaign. The universe's state hash does not depend on any
// of the three, so the published campaign still opens at the hash it was saved with.
// ============================================================================================

export const CAMPAIGN_SCHEMA = 'sse.campaign-save/1';
export const PACK_FORMAT = 'sse.pack/1';

/** The manifest's own kinds (sse-pack `PackKind`, kebab case). */
export const PACK_KINDS = ['base-physics', 'physics', 'universe', 'game-system', 'presentation', 'suite'] as const;
export type PackKind = (typeof PACK_KINDS)[number] | 'tag-set';

/** The shelves a pack is listed on, in the order the page shows them. */
export const SHELVES: { id: string; title: string; blurb: string; kinds: PackKind[] }[] = [
  { id: 'universe', title: 'Universe packs', blurb: 'A setting\'s ships, bases, factions and the rules that place them on worlds that fit.', kinds: ['universe'] },
  { id: 'game-system', title: 'Game systems', blurb: 'Rules, dice and character sheets for running a game.', kinds: ['game-system'] },
  { id: 'physics', title: 'Physics', blurb: 'Editable, cited physics: new processes, or a different universe\'s laws.', kinds: ['base-physics', 'physics'] },
  { id: 'tag-set', title: 'Tag sets', blurb: 'Vocabulary: labels and the rules that read them off a world.', kinds: ['tag-set'] },
  { id: 'looks', title: 'Looks and tours', blurb: 'Player view themes, lenses and guided tours.', kinds: ['presentation', 'suite'] }
];

export interface PackSummary {
  kind: 'pack';
  title: string;
  summary: string | null;
  packId: string;
  version: string;
  kinds: PackKind[];
  fictional: boolean;
  licence: string;
  kernelRange: string;
  requires: { id: string; range: string }[];
  /** Counts for the listing, only the non-zero ones. */
  provides: Record<string, number>;
}

export interface CampaignSummary {
  kind: 'campaign';
  title: string;
  summary: string | null;
  root: string;
  stateHash: string;
  events: number;
  stack: { id: string; version: string }[];
}

export type V4Read =
  | { ok: true; item: PackSummary | CampaignSummary; bytes: Uint8Array }
  | { ok: false; code: string; message: string; problems?: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** sse-pack's `valid_id`: two or more dot-separated parts of lower case, digits, `-` and `_`. */
export function validPackId(id: string): boolean {
  const parts = id.split('.');
  return parts.length >= 2 && parts.every((p) => p.length > 0 && /^[a-z0-9_-]+$/.test(p));
}

/** Semver 2.0, as the `semver` crate reads a version. */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Read a file offered as a V4 item. `maxBytes` is the upload gate's limit. */
export function readV4(bytes: Uint8Array, maxBytes: number): V4Read {
  if (bytes.length === 0) return { ok: false, code: 'empty', message: 'That file is empty.' };
  if (bytes.length > maxBytes) {
    return { ok: false, code: 'too-big', message: `That file is ${Math.ceil(bytes.length / 1e6)} MB; the limit is ${Math.floor(maxBytes / 1e6)} MB.` };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, code: 'not-json', message: 'That is not a Star System Explorer 4 file: it is not readable JSON. V3 saves go through the ordinary upload.' };
  }
  if (!isObj(doc)) return { ok: false, code: 'not-v4', message: 'That is not a Star System Explorer 4 campaign or pack.' };
  if (doc.format === PACK_FORMAT) return readPack(doc, bytes);
  if (doc.schema === CAMPAIGN_SCHEMA) return readCampaign(doc);
  if ('sseClip' in doc) return { ok: false, code: 'clip', message: 'That is a copied clip, not a file to publish. Save the campaign in SSE4 and upload the save.' };
  if ('bundleFormat' in doc || 'systems' in doc || 'nodes' in doc) {
    return { ok: false, code: 'v3', message: 'That looks like a V3 save. Use the ordinary upload for V3 maps.' };
  }
  return { ok: false, code: 'not-v4', message: 'That is not a Star System Explorer 4 campaign or pack.' };
}

function count(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (isObj(v)) return Object.keys(v).length;
  return 0;
}

function readPack(d: Record<string, unknown>, bytes: Uint8Array): V4Read {
  const problems: string[] = [];
  const id = str(d.id);
  const version = str(d.version, 60);
  if (!validPackId(id)) problems.push(`its id ${JSON.stringify(id)} is not a pack id (two or more parts like "maker.name", lower case)`);
  if (!SEMVER.test(version)) problems.push(`its version ${JSON.stringify(version)} is not a version number like 1.0.0`);
  const kindsRaw = Array.isArray(d.kind) ? d.kind : [];
  const kinds = kindsRaw.filter((k): k is (typeof PACK_KINDS)[number] => (PACK_KINDS as readonly unknown[]).includes(k));
  if (kindsRaw.length === 0) problems.push('it says no kind (universe, game-system, physics...)');
  else if (kinds.length !== kindsRaw.length) problems.push(`it has a kind SSE4 does not know: ${kindsRaw.filter((k) => !kinds.includes(k as never)).join(', ')}`);
  const kernelRange = str(d.kernel_range, 60);
  if (!kernelRange) problems.push('it says no kernel range');
  const licence = str(d.licence, 120);
  if (!licence) problems.push('it names no licence, so nobody can tell whether they may use it');
  const requires: { id: string; range: string }[] = [];
  if (d.requires !== undefined && !Array.isArray(d.requires)) problems.push('its requirements are not a list');
  for (const r of Array.isArray(d.requires) ? d.requires : []) {
    if (!isObj(r) || !validPackId(str(r.id)) || !str(r.range, 60)) { problems.push('a requirement is not an id and a version range'); break; }
    requires.push({ id: str(r.id), range: str(r.range, 60) });
  }
  if (d.provides !== undefined && !isObj(d.provides)) problems.push('what it provides is not readable');
  if (problems.length) return { ok: false, code: 'bad-pack', message: 'That pack cannot be listed: ' + problems.join('; ') + '.', problems };

  const p = isObj(d.provides) ? d.provides : {};
  const other = isObj(p.other) ? p.other : {};
  const provides = containsOf(p);

  // A pack that carries tags and nothing that computes is a tag set, whatever kind it names.
  const onlyTags = !!provides.tag_groups && Object.keys(provides).every((k) => k === 'tag_groups' || k === 'rules' || k === 'vocabulary');
  const allKinds: PackKind[] = onlyTags && !kinds.includes('base-physics') ? [...kinds, 'tag-set'] : kinds;
  const dressing = isObj(other.dressing) ? other.dressing : {};

  const about = isObj(other.about) ? other.about : {};
  return {
    ok: true,
    bytes,
    item: {
      kind: 'pack',
      title: str(about.title ?? d.title, 120) || id,
      summary: str(about.summary ?? d.summary ?? dressing.about, 400) || null,
      packId: id, version, kinds: allKinds, fictional: d.fictional === true, licence, kernelRange, requires, provides
    }
  };
}

function readCampaign(d: Record<string, unknown>): V4Read {
  const problems: string[] = [];
  const ex = d.export;
  const root = str(d.root, 120);
  if (!isObj(ex) || !Array.isArray(ex.events)) problems.push('it holds no chronicle export');
  else if (ex.root !== d.root) problems.push('its chronicle belongs to another universe than it says');
  if (!/^u:/.test(root)) problems.push('it names no universe');
  if (typeof d.state_hash !== 'string' || !d.state_hash) problems.push('its state hash is missing');
  if (!isObj(d.workspace)) problems.push('its workspace is missing');
  if (d.stack !== undefined && (!isObj(d.stack) || !Array.isArray(d.stack.added))) problems.push('its pack stack is not readable');
  if (problems.length) return { ok: false, code: 'bad-campaign', message: 'That campaign save cannot be listed: ' + problems.join('; ') + '.', problems };

  const exp = ex as Record<string, unknown>;
  const publicExport: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exp)) if (k !== 'record' && k !== 'record_head') publicExport[k] = v;
  const ws = d.workspace as Record<string, unknown>;
  const workspace: Record<string, unknown> = { ...ws, undo: [], redo: [] };
  const cleaned = { ...d, export: publicExport, workspace };

  const stackDoc = isObj(d.stack) ? d.stack : { added: [], campaign: null };
  const stack: { id: string; version: string }[] = [];
  for (const m of [...(stackDoc.added as unknown[]), stackDoc.campaign]) {
    if (isObj(m) && typeof m.id === 'string' && typeof m.version === 'string') stack.push({ id: m.id, version: m.version });
  }

  return {
    ok: true,
    bytes: new TextEncoder().encode(JSON.stringify(cleaned)),
    item: {
      kind: 'campaign',
      title: str(d.title, 120) || 'Untitled campaign',
      summary: null,
      root, stateHash: d.state_hash as string, events: (exp.events as unknown[]).length, stack
    }
  };
}

/** The shelf a pack sits on: the first shelf one of its kinds belongs to. */
export function shelfOf(kinds: readonly string[]): string {
  for (const s of SHELVES) if (s.kinds.some((k) => kinds.includes(k))) return s.id;
  return 'physics';
}

// ============================================================================================
// WHAT A PACK CONTAINS (example-packs note, question 6, accepted 23 Nov). The small things -
// calendars, unit schemes, ship styles, role programs, overlays, sensor recipes - get no shelf of
// their own; they ride inside other packs, and every shelf filters on them instead. So the list is
// read from the manifest itself, every key of `provides` and `provides.other`, and a key the site
// has never heard of still shows (under its own name): a new kind of content is findable the day a
// pack carries it, with no change here.
//
// Stored as `{slug: count}` in `v4_items.provides`. Slugs are lower case and underscores, so the
// database can filter on them directly (`provides->slug`).
// ============================================================================================

/** Slug -> [one, many]. Order here is the order a listing shows them. */
export const CONTAINS: Record<string, [string, string]> = {
  templates: ['template', 'templates'],
  dressing_rules: ['dressing rule', 'dressing rules'],
  ship_styles: ['ship style', 'ship styles'],
  ship_designs: ['ship design', 'ship designs'],
  programs: ['role program', 'role programs'],
  calendars: ['calendar', 'calendars'],
  unit_schemes: ['unit scheme', 'unit schemes'],
  name_schemes: ['name scheme', 'name schemes'],
  overlays: ['overlay', 'overlays'],
  sensors: ['sensor recipe', 'sensor recipes'],
  view_styles: ['view style', 'view styles'],
  lenses: ['lens', 'lenses'],
  themes: ['theme', 'themes'],
  tours: ['tour', 'tours'],
  tag_groups: ['tag group', 'tag groups'],
  vocabulary: ['vocabulary', 'vocabularies'],
  class_atlas: ['class atlas', 'class atlases'],
  rules: ['rule', 'rules'],
  sifters: ['sifter', 'sifters'],
  triggers: ['trigger', 'triggers'],
  intents: ['intent', 'intents'],
  code_sheets: ['code sheet', 'code sheets'],
  record: ['campaign record', 'campaign records'],
  flows: ['flow', 'flows'],
  quantity_kinds: ['quantity kind', 'quantity kinds'],
  boxes: ['box', 'boxes'],
  observe: ['observation recipe', 'observation recipes'],
  gas_mixes: ['gas mix', 'gas mixes'],
  habitat_rules: ['habitat rule', 'habitat rules'],
  surface: ['surface model', 'surface models'],
  climate: ['climate model', 'climate models'],
  cosmology: ['cosmology', 'cosmologies'],
  light: ['light model', 'light models'],
  nav: ['navigation model', 'navigation models'],
  placement: ['placement model', 'placement models'],
  patch_model: ['patch model', 'patch models'],
  time: ['time model', 'time models'],
  sol: ['Solar System model', 'Solar System models'],
  weather: ['weather model', 'weather models'],
  life: ['life model', 'life models'],
  reference: ['reference paper', 'reference papers'],
  // Sol today's (27 Nov 2026): it was listed as "6 credit, 1 crews".
  crews: ['crew', 'crews'],
  credit: ['credit', 'credits'],
  memorials: ['memorial', 'memorials'],
  in_memory: ['in memory list', 'in memory lists'],
  files: ['file', 'files'],
  contents: ['contents list', 'contents lists']
};

/** A slug nobody has named yet, in words: "-s" added or taken off, so the count still reads right. */
function guessWords(slug: string): [string, string] {
  const w = slug.replace(/_/g, ' ');
  if (/ss$/.test(w)) return [w, w + 'es'];
  if (/s$/.test(w)) return [w.slice(0, -1), w];
  return [w, w + 's'];
}

/** A manifest key's slug: the known synonyms folded together, weather_* and life_* as one each. */
export function containsSlug(key: string): string | null {
  const k = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!k || k === 'about') return null;
  if (k.startsWith('weather')) return 'weather';
  if (k.startsWith('life_')) return 'life';
  const SAME: Record<string, string> = {
    dressing: 'dressing_rules', tags: 'tag_groups', calendar: 'calendars', units: 'unit_schemes',
    names: 'name_schemes', schemes: 'name_schemes', naming: 'name_schemes', ship_design: 'ship_designs',
    ship_style: 'ship_styles', views: 'view_styles', view_style: 'view_styles', classes: 'class_atlas',
    axes: 'class_atlas', skins: 'themes', overlay: 'overlays', sensor: 'sensors', tour: 'tours'
  };
  return SAME[k] ?? k;
}

/**
 * Things a pack carries one of however it is written: a class atlas is one atlas whether it lists
 * ten classes or a hundred, a calendar is one calendar, a sensor block is one set of recipes.
 */
const ONE_EACH = new Set(['class_atlas', 'calendars', 'sensors', 'vocabulary', 'record', 'surface', 'sol', 'time',
  'climate', 'cosmology', 'patch_model', 'nav', 'placement', 'light', 'weather', 'life']);

/** One manifest value's count: a list's length, the list inside a block of the same name, else 1. */
function amount(key: string, slug: string, v: unknown): number {
  if (v === undefined || v === null || v === false) return 0;
  if (ONE_EACH.has(slug)) return (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 1) > 0 ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  if (isObj(v)) {
    for (const inner of [key, 'rules', 'groups', 'items', 'entries']) if (Array.isArray(v[inner])) return (v[inner] as unknown[]).length;
    return Object.keys(v).length;
  }
  return 1;
}

/** Everything a pack's `provides` holds, as `{slug: count}`, only the non-zero ones. */
export function containsOf(provides: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (key: string, v: unknown) => {
    const slug = containsSlug(key);
    if (!slug) return;
    const n = amount(key, slug, v);
    if (n > 0) out[slug] = ONE_EACH.has(slug) ? 1 : (out[slug] ?? 0) + n;
  };
  for (const [k, v] of Object.entries(provides)) if (k !== 'other') add(k, v);
  if (isObj(provides.other)) for (const [k, v] of Object.entries(provides.other)) add(k, v);
  return out;
}

/** A slug in words, plural: "ship styles". Unknown slugs read as themselves. */
export const containsLabel = (slug: string) => (CONTAINS[slug] ?? guessWords(slug))[1];

/** "3 templates, 1 dressing rule", in CONTAINS order, then anything else alphabetically. */
export function providesLine(provides: Record<string, number>): string {
  const order = Object.keys(CONTAINS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return Object.entries(provides)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([k, n]) => `${n} ${(CONTAINS[k] ?? guessWords(k))[n === 1 ? 0 : 1]}`)
    .join(', ');
}

/** A `contains` filter value from a query string: a known-shaped slug or nothing. */
export const cleanContains = (raw: string | null) => (raw && /^[a-z0-9_]{1,40}$/.test(raw) ? raw : null);
