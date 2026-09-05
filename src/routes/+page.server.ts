import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tolerantSelect } from '$lib/server/tolerant';
import { CARD_COLUMNS, CARD_OPTIONAL, type CardRow } from '$lib/server/cards';
import { bestDensity } from '$lib/server/density';

// SSR, one query, no engine. The page must be fast at LOADING (design 2).
export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
  const env = platform?.env;
  // Where a deleted account lands. Said once, kindly, on a page that is otherwise the same for everyone.
  const bye = url.searchParams.has('bye');
  if (!env?.SUPABASE_URL) return { systems: [], configured: false, failed: false, bye, best: null };

  const sb = db(env);
  const [{ data, error }, best] = await Promise.all([
    tolerantSelect<CardRow[]>(CARD_COLUMNS, CARD_OPTIONAL, (cols) =>
      sb.from('systems').select(cols)
        .eq('state', 'public').eq('visibility', 'public')
        .order('hearts_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(24)
    ),
    // What a 5 on the information meter means today (D-30).
    bestDensity(sb)
  ]);

  // Same rule as /browse: a failed query must not render as an empty library. Do not cache a
  // failure either - a 60-second cache on a broken read turns a blip into a minute of wrong page.
  if (error) {
    console.error('front page query failed', error.message);
    return { systems: [], configured: true, failed: true, bye, best: null };
  }

  // Short edge cache: the front page is the same for everybody and is the most-hit route.
  setHeaders({ 'cache-control': 'public, max-age=60' });

  return { systems: data ?? [], configured: true, failed: false, bye, best };
};
