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
  systemNames: string[];
  bodies: NormalisedNode[];
  constructs: NormalisedNode[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

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
    tags: Array.isArray(node?.tags) ? node.tags.filter((t: unknown) => typeof t === 'string') : [],
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

  const title = String(doc?.name ?? doc?.title ?? systemNames[0] ?? 'Untitled');
  return { title, summary: str(doc?.description), systemNames, bodies, constructs };
}
