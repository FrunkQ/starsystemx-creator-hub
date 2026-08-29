import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

// SSR, one query, no engine. The page must be fast at LOADING (design 2).
export const load: PageServerLoad = async ({ platform, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) return { systems: [], configured: false };

  const sb = db(env);
  const { data } = await sb.from('systems')
    .select('slug, title, summary, blurb, kind, cover_sha256, hearts_count, download_count, auto_tags, body_count, construct_count, system_count')
    .eq('state', 'public').eq('visibility', 'public')
    .order('hearts_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24);

  // Short edge cache: the front page is the same for everybody and is the most-hit route.
  setHeaders({ 'cache-control': 'public, max-age=60' });

  return { systems: data ?? [], configured: true };
};
