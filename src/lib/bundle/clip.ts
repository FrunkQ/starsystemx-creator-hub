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
  /** Stored as `key` or `key=value`. An `origin/hub=<url>` tag means this node was itself pasted. */
  tags?: string[];
}

/** One earlier home of a copied object: where it was before the map it is being copied from. */
export interface ClipOrigin {
  url: string;
  title: string | null;
  creator: string | null;
}

/** What a map says about the work it includes (systems.content_credits, read from the save). */
export interface CreditLike {
  title: string;
  creator: string | null;
  url: string | null;
  chain?: ClipOrigin[] | null;
}

/** The address of one object on its map's page: the page opens that branch and scrolls to it. */
export const deepLink = (pageUrl: string, nodeId: string): string =>
  pageUrl.split('#')[0] + '#node=' + encodeURIComponent(nodeId);

/** The node a page url points at, or null. */
export function nodeFromHash(hash: string): string | null {
  const m = /^#node=(.+)$/.exec(hash ?? '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

/** `/s/<slug>` out of a hub url, whichever host and whatever follows. */
export function slugOfUrl(url: string | null | undefined): string | null {
  const m = /\/s\/([a-z0-9-]+)/i.exec(url ?? '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * THE TRUE SOURCE, when the copied object was itself pasted in from somewhere (owner, 2026-09-04:
 * "link right back to the true source ... if it has been appended and updated ownership is kind of
 * shared"). The engine stamps a pasted root with `origin/hub=<url>` (R-14 rule 5); the map's own
 * content credits (R-16) say who that url belonged to and, if THAT was a copy too, where it came
 * from before. The chain is deepest source first: the original, then each map it passed through.
 * The map being copied from now is not in it - that is `source` itself.
 */
export function originChain(root: ClipNode, credits: CreditLike[] = []): ClipOrigin[] {
  const tag = (root.tags ?? []).find((t) => t.startsWith('origin/hub='));
  if (!tag) return [];
  const url = tag.slice('origin/hub='.length).trim();
  if (!url) return [];
  const slug = slugOfUrl(url);
  const credit = credits.find((c) => c.url && (c.url === url || (slug !== null && slugOfUrl(c.url) === slug)));
  const earlier = credit?.chain?.filter((o) => o && typeof o.url === 'string') ?? [];
  return [...earlier, { url, title: credit?.title ?? null, creator: credit?.creator ?? null }];
}

export interface ClipSource {
  /** The hub's name, so a pasted body can say where it came from. */
  site: string;
  /** The page it was copied from. Absolute. */
  url: string;
  /** The map's title. */
  title: string;
  /**
   * WHO MADE THE MAP (owner, 2026-09-04: "are we pushing through attributions with it?"). The
   * cartographer's name, so the campaign this lands in can credit a person and not only a url.
   * The engine records it as a content credit on paste (docs/sse-requirements.md R-16).
   */
  creator?: string | null;
  /**
   * Earlier homes of the copied object, deepest first, when it was itself pasted in from
   * somewhere. Empty for an object made in the map it is copied from. See `originChain`.
   */
  chain?: ClipOrigin[];
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

export function buildClip(
  nodes: ClipNode[], rootId: string, source: ClipSource, credits: CreditLike[] = []
): SseClip | null {
  const subtree = subtreeOf(nodes, rootId);
  if (!subtree.length) return null;

  // The address is the OBJECT, not the page: a credit that links to the page of a 192-node map
  // points at nothing in particular. And the chain, so a copy of a copy still names the original.
  const chain = originChain(subtree[0], credits);
  source = { ...source, url: deepLink(source.url, rootId), ...(chain.length ? { chain } : {}) };

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
