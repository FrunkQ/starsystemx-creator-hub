// Browse, as JSON, for the app.
//
// Mirrors what /browse shows, because two answers to "what is on the hub" that could disagree is
// one too many. NO CREDENTIALS - browsing and downloading never need an account, in the app exactly
// as on the web.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { PUBLIC_CORS, preflight } from '$lib/server/cors';
import { tolerantSelect } from '$lib/server/tolerant';
import { CARD_COLUMNS, CARD_OPTIONAL, type CardRow } from '$lib/server/cards';

const PAGE = 30;

/** A card's columns and the few more the app wants for its own list. */
const LIST_COLUMNS = [...CARD_COLUMNS, 'carried_images', 'carried_models', 'source_bytes', 'created_with', 'updated_at'];
type ListRow = CardRow & { carried_images: number; carried_models: number; source_bytes: number; created_with: string | null; updated_at: string };

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const tags = url.searchParams.getAll('tag').filter(Boolean).slice(0, 8);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'loved';
  const page = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));

  // Built from the column list so a column the database lacks yet can be dropped and the query
  // run again (tolerant.ts).
  const { data, error: e } = await tolerantSelect<ListRow[]>(LIST_COLUMNS, CARD_OPTIONAL, (cols) => {
    let query = db(env).from('systems').select(cols).eq('state', 'public').eq('visibility', 'public');

    if (tags.length) query = query.contains('auto_tags', tags);
    if (q) query = query.ilike('title', '%' + q + '%');

    query = sort === 'new'
      ? query.order('created_at', { ascending: false })
      : query.order('hearts_count', { ascending: false }).order('created_at', { ascending: false });

    return query.range((page - 1) * PAGE, page * PAGE - 1);
  });

  // Same rule as the web pages: a failed query must not be served as an empty library.
  if (e) {
    console.error('api/maps failed', e.message);
    throw error(503, 'could not read the library');
  }

  setHeaders({ 'cache-control': 'public, max-age=60', ...PUBLIC_CORS });
  return json({
    maps: data ?? [],
    page,
    pageSize: PAGE,
    // The app builds its own download url from the slug; given here so the contract is explicit.
    downloadPath: '/api/download/{slug}',
    coverPath: '/asset/{sha256}'
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
