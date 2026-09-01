// Browse, as JSON, for the app.
//
// Mirrors what /browse shows, because two answers to "what is on the hub" that could disagree is
// one too many. NO CREDENTIALS - browsing and downloading never need an account, in the app exactly
// as on the web.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const PAGE = 30;

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const tags = url.searchParams.getAll('tag').filter(Boolean).slice(0, 8);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'loved';
  const page = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));

  let query = db(env).from('systems')
    .select('slug, title, blurb, summary, kind, cover_sha256, hearts_count, download_count, auto_tags, tags, body_count, construct_count, system_count, carried_images, carried_models, source_bytes, created_with, updated_at')
    .eq('state', 'public').eq('visibility', 'public');

  if (tags.length) query = query.contains('auto_tags', tags);
  if (q) query = query.ilike('title', '%' + q + '%');

  query = sort === 'new'
    ? query.order('created_at', { ascending: false })
    : query.order('hearts_count', { ascending: false }).order('created_at', { ascending: false });

  const { data, error: e } = await query.range((page - 1) * PAGE, page * PAGE - 1);

  // Same rule as the web pages: a failed query must not be served as an empty library.
  if (e) {
    console.error('api/maps failed', e.message);
    throw error(503, 'could not read the library');
  }

  setHeaders({ 'cache-control': 'public, max-age=60' });
  return json({
    maps: data ?? [],
    page,
    pageSize: PAGE,
    // The app builds its own download url from the slug; given here so the contract is explicit.
    downloadPath: '/api/download/{slug}',
    coverPath: '/asset/{sha256}'
  });
};
