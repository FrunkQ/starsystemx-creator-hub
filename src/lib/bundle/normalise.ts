// Cut a bundle document into rows.
//
// THIS IS THE ONLY PLACE THE HUB LOOKS INSIDE A CAMPAIGN, and it looks at a handful of fields:
// `systems[].system.nodes[]` (or a bare `nodes[]` for a single-system save), and per node `id`,
// `name`, `kind`, `roleHint`, `parentId`, plus the two asset references. No physics, no
// classification, no types beyond what it slices on (design 4).
//
// BLOCKED UNTIL THE FIXTURE LANDS. Everything below is written against the shape the engine's own
// `nodesWithSystem` walks, which is evidence but not proof. It is not reachable in production
// until `KNOWN_BUNDLE_FORMATS` is non-empty, and that should not happen until a canonical fixture
// has been run through it.
import { IMAGES_DIR, PLAYER_IMAGES_DIR } from './contract';

export interface NormalisedNode {
  node_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  role_hint: string | null;
  tags: string[];
  /** The path this node's picture sits at in the bundle, if it carries one. */
  image_path: string | null;
  /** The hash a construct's model CLAIMS. Verified against the bytes before it is ever used. */
  model_hash_claim: string | null;
  /** The copy-paste JSON snippet for this one node, precomputed (design 2). */
  snippet: unknown;
}

export interface NormalisedBundle {
  title: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  systemNames: string[];
  bodies: NormalisedNode[];
  constructs: NormalisedNode[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * A node's tags, flattened for storage.
 *
 * ============================================================================================
 * THE ENGINE'S TAGS ARE OBJECTS, NOT STRINGS: `{ key: 'weather/lightning', value: 'constant' }`.
 * This originally filtered for `typeof t === 'string'`, which silently discarded EVERY ONE - so
 * every node in the database had an empty tag list and the Tags column on a real 161-body map was
 * blank from top to bottom.
 *
 * It went unnoticed because `facets.ts` reads `t.key` correctly, so the PILLS were right while the
 * per-node tags were empty. Two readers of the same field, one of them wrong, and the working one
 * masked the broken one.
 * ============================================================================================
 *
 * Stored as `key` or `key=value` so a value-carrying tag keeps its value, the array stays `text[]`
 * (and so stays GIN-indexable for search), and the display side can split on the first `=`.
 */
function readNodeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    // A plain string is accepted too - cheap, and it means a future format change that simplifies
    // tags does not silently empty this again.
    if (typeof t === 'string' && t) { out.push(t); continue; }
    const key = typeof t?.key === 'string' ? t.key.trim() : '';
    if (!key) continue;
    const value = t?.value;
    out.push(value == null || value === '' ? key : key + '=' + String(value));
  }
  return [...new Set(out)].slice(0, 40);
}

/** A construct is anything the engine marks as one; everything else is a body. */
const isConstruct = (node: any) => String(node?.kind ?? '') === 'construct';

function toNode(node: any): NormalisedNode {
  const imageUrl = str(node?.image?.url);
  return {
    node_id: String(node?.id ?? ''),
    parent_id: str(node?.parentId),
    name: String(node?.name ?? node?.id ?? 'unnamed'),
    kind: String(node?.kind ?? 'unknown'),
    role_hint: str(node?.roleHint),
    tags: readNodeTags(node?.tags),
    image_path:
      imageUrl && imageUrl.startsWith(IMAGES_DIR) && !imageUrl.startsWith(PLAYER_IMAGES_DIR)
        ? imageUrl : null,
    model_hash_claim: str(node?.model?.hash),
    snippet: snippetFor(node)
  };
}

/**
 * The copy-paste snippet: the node as it would be pasted into another campaign, with the asset
 * references stripped. A snippet that referenced `assets/images/x.jpg` would paste a broken link
 * into somebody else's save, and a snippet carrying a data URL would be enormous. The picture is
 * not the point - the body is.
 */
function snippetFor(node: any): unknown {
  const copy = { ...node };
  delete copy.image;
  delete copy.model;
  delete copy.gmNotes;
  return copy;
}

export function normalise(doc: any): NormalisedBundle {
  const bodies: NormalisedNode[] = [];
  const constructs: NormalisedNode[] = [];
  const systemNames: string[] = [];

  const push = (node: any) => (isConstruct(node) ? constructs : bodies).push(toNode(node));

  if (Array.isArray(doc?.nodes)) for (const node of doc.nodes) push(node);
  for (const entry of doc?.systems ?? []) {
    const name = String(entry?.name ?? entry?.system?.name ?? '');
    if (name) systemNames.push(name);
    for (const node of entry?.system?.nodes ?? []) push(node);
  }

  // THE CREATOR'S WRITE-UP, if the save carries one (docs/sse-integration-spec.md section 1).
  // A `meta` block lets someone write their pitch in the app, where they are already working,
  // instead of only in a web form afterwards. It PREFILLS; edits made on the hub then win.
  //
  // Absent is the normal case today and must never be an error - hence the fallback chain, which
  // is exactly what the hub did before `meta` existed.
  const meta = doc?.meta ?? {};
  const title = String(meta.title ?? doc?.name ?? doc?.title ?? systemNames[0] ?? 'Untitled').slice(0, 120);

  // Length caps because these are displayed and arrive from a file a stranger wrote.
  const summary = clamp(str(meta.summary), 300);
  const description = clamp(str(meta.description) ?? str(doc?.description), 8000);

  const tags = Array.isArray(meta.tags)
    ? meta.tags.filter((t: unknown): t is string => typeof t === 'string' && !!t)
        .map((t: string) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : [];

  return { title, summary, description, tags, systemNames, bodies, constructs };
}

const clamp = (v: string | null, max: number) => (v === null ? null : v.slice(0, max));
