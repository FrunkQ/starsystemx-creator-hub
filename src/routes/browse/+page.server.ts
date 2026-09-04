import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { vocabularyFrom } from '$lib/vocabulary';

/** Pills the hub DERIVES from the file, grouped - see 0007's note on why these are kept apart. */
const FACET_GROUPS = [
  { label: 'Shape', tags: ['campaign', 'large-campaign', 'single-system', 'built-up', 'multi-star'] },
  // No 'stars'/'planets': every map has them, so they filter nothing (see facets.ts).
  { label: 'Contains', tags: ['moons', 'belts', 'rings', 'stations', 'ships', 'habitats', 'infrastructure'] },
  { label: 'Worlds', tags: ['life', 'habitable', 'oceans', 'ice'] },
  { label: 'Artwork', tags: ['has-artwork', 'has-3d-models'] },
  { label: 'Safe to show players', tags: ['player-safe', 'gm-notes'] }
];

const SAFE_TAG = /^[a-z0-9-]{1,40}$/;

export const load: PageServerLoad = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  const selected = url.searchParams.getAll('tag').filter((t) => SAFE_TAG.test(t)).slice(0, 8);
  // Search text, restricted to what a title can contain. PostgREST's `or` syntax reserves commas
  // and parentheses, and a search box is exactly where somebody types them.
  const q = (url.searchParams.get('q') ?? '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 80);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'loved';
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam === 'starmap' || kindParam === 'system' ? kindParam : null;

  const empty = {
    systems: [], groups: FACET_GROUPS, mine: [] as { label: string; tags: string[] }[],
    selected, q, sort, kind, counts: {} as Record<string, number>, narrow: [] as string[]
  };
  if (!env?.SUPABASE_URL) return { ...empty, configured: false, failed: false };

  const sb = db(env);
  let query = sb.from('systems')
    .select('slug, title, summary, blurb, kind, cover_sha256, hearts_count, download_count, auto_tags, tags, body_count, construct_count, system_count')
    .eq('state', 'public').eq('visibility', 'public');

  // A starmap and a system are different things to look for (owner, 2026-09-04).
  if (kind) query = query.eq('kind', kind);

  // Each selected tag must be present - in the hub's DERIVED pills or the creator's OWN picks.
  // Narrowing rather than widening is what people expect from a stack of filters: each pill you
  // add should show you less, not more. The creator's tags are what tell the fortieth Solar
  // System apart from the thirty-nine before it, so they filter here too.
  for (const t of selected) query = query.or('auto_tags.cs.{' + t + '},tags.cs.{' + t + '}');

  // Titles and the one-line blurb. Not descriptions: ILIKE over prose is slow and ranks badly; a
  // real text index is the answer when the library is big enough to need one.
  if (q) query = query.or('title.ilike.%' + q + '%,blurb.ilike.%' + q + '%');

  query = sort === 'new'
    ? query.order('created_at', { ascending: false })
    : query.order('hearts_count', { ascending: false }).order('created_at', { ascending: false });

  const [{ data, error }, { data: vocabRow }] = await Promise.all([
    query.limit(60),
    sb.from('config').select('value').eq('key', 'creator_vocabulary').maybeSingle()
  ]);
  const mine = vocabularyFrom(vocabRow?.value ?? null).map((g) => ({ label: g.label, tags: g.tags }));

  // A FAILED QUERY MUST NOT LOOK LIKE AN EMPTY LIBRARY. Discarding `error` here made a missing
  // column (an unrun migration) render as a cheerful "no maps have been published yet" - which is
  // exactly the silent failure this codebase refuses everywhere else. Surfaced, not swallowed.
  if (error) {
    console.error('browse query failed', error.message);
    return { ...empty, mine, configured: true, failed: true };
  }

  // How many results each pill would still leave, computed over the CURRENT result set - so a pill
  // that would give zero can be shown as spent rather than letting someone click into an empty page.
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const all = new Set([...((row.auto_tags ?? []) as string[]), ...((row.tags ?? []) as string[])]);
    for (const t of all) counts[t] = (counts[t] ?? 0) + 1;
  }

  // "NARROW IT DOWN": when a search returns a crowd - forty Earths - the tags that split the crowd
  // are offered right above it. The most useful pill is one that keeps some results and drops
  // some; one that every result carries, or none does, separates nothing.
  const total = (data ?? []).length;
  const narrow = Object.entries(counts)
    .filter(([t, n]) => !selected.includes(t) && n > 0 && n < total)
    .sort((a, b) => Math.abs(a[1] - total / 2) - Math.abs(b[1] - total / 2) || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t]) => t);

  setHeaders({ 'cache-control': 'public, max-age=60' });
  return { ...empty, systems: data ?? [], mine, counts, narrow: total >= 4 ? narrow : [], configured: true, failed: false };
};
