// THE ONE SHELVES PAGE (SP17, store packs design 9.6): what the V3 and V4 shelves share.

/** A V3 shelf shows this many maps; the rest are one click away on Browse. */
export const V3_SHELF_SIZE = 12;

/**
 * The V3 maps' "contains" pills: the hub's own derived tags (facets.ts), the same list as Browse's
 * Contains group. Offered on the shelves beside what V4 packs carry.
 */
export const V3_CONTAINS: { slug: string; label: string }[] = [
  { slug: 'moons', label: 'moons' }, { slug: 'belts', label: 'belts' }, { slug: 'rings', label: 'rings' },
  { slug: 'small-objects', label: 'small objects' }, { slug: 'megastructures', label: 'megastructures' },
  { slug: 'stations', label: 'stations' }, { slug: 'ships', label: 'ships' }, { slug: 'habitats', label: 'habitats' },
  { slug: 'infrastructure', label: 'infrastructure' }
];

/**
 * Search text, restricted to what a title can contain - the same rule as Browse. PostgREST's `or`
 * syntax reserves commas and parentheses, and a search box is where somebody types them.
 */
export function cleanSearch(raw: string | null): string {
  return (raw ?? '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 80);
}

/** Whether a title or summary holds the search, ignoring case. No search matches everything. */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => (f ?? '').toLowerCase().includes(needle));
}
