import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

/** Pills offered in the sidebar, grouped. Only ones the hub DERIVES - see 0007's note on why. */
const FACET_GROUPS = [
  { label: 'Shape', tags: ['campaign', 'large-campaign', 'single-system', 'built-up', 'multi-star'] },
  // No 'stars'/'planets': every map has them, so they filter nothing (see facets.ts).
  { label: 'Contains', tags: ['moons', 'belts', 'rings', 'stations', 'ships', 'habitats', 'infrastructure'] },
  { label: 'Worlds', tags: ['life', 'habitable', 'oceans', 'ice'] },
  { label: 'Artwork', tags: ['has-artwork', 'has-3d-models'] },
  { label: 'Safe to show players', tags: ['player-safe', 'gm-notes'] }
] as const;

export const load: PageServerLoad = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  const selected = url.searchParams.getAll('tag').filter(Boolean).slice(0, 8);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'loved';

  if (!env?.SUPABASE_URL) {
    return { systems: [], groups: FACET_GROUPS, selected, q, sort, counts: {}, configured: false };
  }

  const sb = db(env);
  let query = sb.from('systems')
    .select('slug, title, summary, blurb, kind, cover_sha256, hearts_count, download_count, auto_tags, body_count, construct_count, system_count')
    .eq('state', 'public').eq('visibility', 'public');

  // `contains` = has ALL selected tags. Narrowing rather than widening is what people expect from
  // a stack of filters: each pill you add should show you less, not more.
  if (selected.length) query = query.contains('auto_tags', selected);

  // Title search only, deliberately. A full-text index over descriptions is worth having later;
  // pretending to do it with ILIKE over prose would be slow and would rank badly.
  if (q) query = query.ilike('title', '%' + q + '%');

  query = sort === 'new'
    ? query.order('created_at', { ascending: false })
    : query.order('hearts_count', { ascending: false }).order('created_at', { ascending: false });

  const { data } = await query.limit(60);

  // How many results each pill would still leave, computed over the CURRENT result set - so a pill
  // that would give zero can be shown as spent rather than letting someone click into an empty page.
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    for (const t of (row.auto_tags ?? []) as string[]) counts[t] = (counts[t] ?? 0) + 1;
  }

  setHeaders({ 'cache-control': 'public, max-age=60' });
  return { systems: data ?? [], groups: FACET_GROUPS, selected, q, sort, counts, configured: true };
};
