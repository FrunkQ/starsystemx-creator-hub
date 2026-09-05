// Filtering a map's tree by what is IN the map (D-31): a role, the tags the objects carry, a
// word, and whether an object is described, pictured or modelled. Pure, so it is tested; the
// tree component only draws what this decides.
//
// The owner's ask (2026-09-05): "have the tag list from the actual map available as a filter to
// the bodies below - letting users find planets by in-map tags - in this list also filter on
// megastructures and other map related filters."

export interface FilterableNode {
  node_id: string;
  parent_id: string | null;
  name: string;
  role_hint: string | null;
  tags: string[];
  snippet?: unknown;
  image_sha256?: string | null;
  model_sha256?: string | null;
}

export interface TreeFilter {
  text: string;
  role: string | null;
  /** Every listed tag must be present (narrowing, like the browse pills). */
  tags: string[];
  described: boolean;
  pictured: boolean;
  modelled: boolean;
}

export const EMPTY_FILTER: TreeFilter = { text: '', role: null, tags: [], described: false, pictured: false, modelled: false };

export const isActive = (f: TreeFilter): boolean =>
  !!(f.text.trim() || f.role || f.tags.length || f.described || f.pictured || f.modelled);

/** The same floor as the information density: shorter is a placeholder, not a description. */
export const MIN_DESCRIPTION = 12;

export function isDescribed(n: FilterableNode): boolean {
  const d = (n.snippet as { description?: unknown } | null | undefined)?.description;
  return typeof d === 'string' && d.trim().length >= MIN_DESCRIPTION;
}

export function matches(n: FilterableNode, f: TreeFilter): boolean {
  if (f.role && (n.role_hint ?? '') !== f.role) return false;
  if (f.tags.length && !f.tags.every((t) => n.tags.includes(t))) return false;
  if (f.described && !isDescribed(n)) return false;
  if (f.pictured && !n.image_sha256) return false;
  if (f.modelled && !n.model_sha256) return false;
  const q = f.text.trim().toLowerCase();
  if (q && !n.name.toLowerCase().includes(q) && !n.tags.some((t) => t.toLowerCase().includes(q))) return false;
  return true;
}

/** What to show: every match, and every ancestor of a match so the path to it stays readable. */
export function visibleIds(nodes: FilterableNode[], f: TreeFilter): { matched: Set<string>; visible: Set<string> } {
  const matched = new Set(nodes.filter((n) => matches(n, f)).map((n) => n.node_id));
  const parentOf = new Map(nodes.map((n) => [n.node_id, n.parent_id]));
  const visible = new Set(matched);
  for (const id of matched) {
    for (let p = parentOf.get(id) ?? null; p && !visible.has(p); p = parentOf.get(p) ?? null) visible.add(p);
  }
  return { matched, visible };
}

/** Every tag in the map with how many objects carry it: most common first, then A to Z. */
export function tagCounts(nodes: FilterableNode[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const n of nodes) for (const t of new Set(n.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Objects by role, for the role chips: the same counting the tree's summaries use. */
export function roleCounts(nodes: FilterableNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) if (n.role_hint) out[n.role_hint] = (out[n.role_hint] ?? 0) + 1;
  return out;
}

/** "ocean=water" is shown as the key and the value; "science/impact-record" drops its namespace. */
export function tagParts(t: string): { key: string; value: string | null } {
  const i = t.indexOf('=');
  const raw = i < 0 ? t : t.slice(0, i);
  return { key: raw.split('/').pop() ?? raw, value: i < 0 ? null : t.slice(i + 1) };
}
