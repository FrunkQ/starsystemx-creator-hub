// A CLIP: one node and everything under it, as a single thing to paste into Star System Explorer.
//
// ============================================================================================
// WHY AN ENVELOPE AND NOT A BARE NODE. The original "Copy JSON" handed out one node's raw JSON.
// That has two problems, and the second is the one that matters:
//   1. A star without its planets is rarely what anybody wanted.
//   2. A paste target has to RECOGNISE what it was given. Raw node JSON is indistinguishable from
//      any other JSON, so the engine could only guess - and a guess that is wrong pastes garbage
//      into a live campaign. `sseClip: 1` is the marker, and the number is the format version.
//
// The engine-side consumer is docs/sse-requirements.md R-14. Until that ships, this is a promise
// about a format, not a working round trip - which is why the format is written down there rather
// than only here.
// ============================================================================================
//
// THE ORDER MATTERS: parents before children, depth-first. A one-pass insert then always finds the
// parent it needs already present. The root's `parentId` is nulled: where the clip lands is the
// paste target's decision (the selected body), not the source map's.
//
// IDS ARE THE SOURCE MAP'S IDS. They are carried so `parentId` links resolve WITHIN the clip, and
// for no other purpose. A paste target must mint its own ids and remap - two clips from the same
// map, or one clip pasted twice, would otherwise collide.

export interface ClipNode {
  node_id: string;
  parent_id: string | null;
  /** The node as stored: bundle-carried asset references and GM notes already stripped (normalise.ts). */
  snippet: unknown;
}

export interface ClipSource {
  /** The hub's name, so a pasted body can say where it came from. */
  site: string;
  /** The page it was copied from. Absolute. */
  url: string;
  /** The map's title. */
  title: string;
}

export interface SseClip {
  sseClip: 1;
  source: ClipSource;
  /** The id of the first node in `nodes`; everything else descends from it. */
  root: string;
  /** Depth-first, parents first. The root's `parentId` is null. */
  nodes: Record<string, unknown>[];
}

export const CLIP_FORMAT = 1 as const;

/**
 * Collect `rootId` and every descendant, parents first.
 *
 * Cycle-safe: a hostile or damaged file can make a node its own ancestor, and a walk that trusts
 * `parent_id` blindly would never return. A visited set makes the worst case "some nodes are
 * missing", never "the page hangs".
 */
export function subtreeOf(nodes: ClipNode[], rootId: string): ClipNode[] {
  const byParent = new Map<string, ClipNode[]>();
  const byId = new Map<string, ClipNode>();
  for (const n of nodes) {
    byId.set(n.node_id, n);
    if (n.parent_id) {
      const list = byParent.get(n.parent_id) ?? [];
      list.push(n);
      byParent.set(n.parent_id, list);
    }
  }

  const root = byId.get(rootId);
  if (!root) return [];

  const out: ClipNode[] = [];
  const seen = new Set<string>();
  const walk = (n: ClipNode) => {
    if (seen.has(n.node_id)) return;
    seen.add(n.node_id);
    out.push(n);
    for (const c of byParent.get(n.node_id) ?? []) walk(c);
  };
  walk(root);
  return out;
}

export function buildClip(nodes: ClipNode[], rootId: string, source: ClipSource): SseClip | null {
  const subtree = subtreeOf(nodes, rootId);
  if (!subtree.length) return null;

  const out: Record<string, unknown>[] = [];
  for (const n of subtree) {
    // A snippet is whatever normalise.ts stored. Anything that is not an object cannot be a node
    // and is dropped rather than pasted as a scalar.
    if (!n.snippet || typeof n.snippet !== 'object' || Array.isArray(n.snippet)) continue;
    const copy: Record<string, unknown> = { ...(n.snippet as Record<string, unknown>) };
    if (n.node_id === rootId) copy.parentId = null;
    out.push(copy);
  }
  if (!out.length) return null;

  return { sseClip: CLIP_FORMAT, source, root: rootId, nodes: out };
}

/** The text that goes on the clipboard. Pretty-printed: people do read these before pasting. */
export function clipText(clip: SseClip): string {
  return JSON.stringify(clip, null, 2);
}
