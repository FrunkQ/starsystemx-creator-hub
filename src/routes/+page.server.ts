import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tolerantSelect } from '$lib/server/tolerant';
import { CARD_COLUMNS, CARD_OPTIONAL, type CardRow } from '$lib/server/cards';

// SSR, one query, no engine. The page must be fast at LOADING (design 2).
export const load: PageServerLoad = async ({ platform, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) return { systems: [], configured: false, failed: false };

  const sb = db(env);
  const { data, error } = await tolerantSelect<CardRow[]>(CARD_COLUMNS, CARD_OPTIONAL, (cols) =>
    sb.from('systems').select(cols)
      .eq('state', 'public').eq('visibility', 'public')
      .order('hearts_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(24)
  );

  // Same rule as /browse: a failed query must not render as an empty library. Do not cache a
  // failure either - a 60-second cache on a broken read turns a blip into a minute of wrong page.
  if (error) {
    console.error('front page query failed', error.message);
    return { systems: [], configured: true, failed: true };
  }

  // Short edge cache: the front page is the same for everybody and is the most-hit route.
  setHeaders({ 'cache-control': 'public, max-age=60' });

  return { systems: data ?? [], configured: true, failed: false };
};
