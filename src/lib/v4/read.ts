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
  const dressing = isObj(other.dressing) ? other.dressing : {};
  const tags = other.tags;
  const provides: Record<string, number> = {};
  const put = (k: string, n: number) => { if (n > 0) provides[k] = n; };
  put('flows', count(p.flows));
  put('quantity kinds', count(p.quantity_kinds));
  put('units', count(p.units));
  put('boxes', count(p.boxes));
  put('templates', count(other.templates));
  put('dressing rules', count(dressing.rules));
  put('tag groups', isObj(tags) && Array.isArray(tags.groups) ? tags.groups.length : count(tags));
  put('rules', count(other.rules));
  put('programs', count(other.programs));
  put('sifters', count(other.sifters));
  put('themes', count(other.themes) + count(other.skins));
  put('lenses', count(other.lenses));
  put('reference papers', count(p.reference));

  // A pack that carries tags and nothing that computes is a tag set, whatever kind it names.
  const onlyTags = provides['tag groups'] && Object.keys(provides).every((k) => k === 'tag groups' || k === 'rules');
  const allKinds: PackKind[] = onlyTags && !kinds.includes('base-physics') ? [...kinds, 'tag-set'] : kinds;

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

/** "3 templates, 1 dressing rule" */
export function providesLine(provides: Record<string, number>): string {
  const one = (k: string) => (k === 'boxes' ? 'box' : k === 'lenses' ? 'lens' : k.replace(/s$/, ''));
  return Object.entries(provides).map(([k, n]) => `${n} ${n === 1 ? one(k) : k}`).join(', ');
}
