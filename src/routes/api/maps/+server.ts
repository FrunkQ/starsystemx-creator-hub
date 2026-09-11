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
import { CARD_COLUMNS, CARD_OPTIONAL, orderCards, type CardRow } from '$lib/server/cards';
import { bestDensity } from '$lib/server/density';
import { densityLevel } from '$lib/bundle/density';
import { loadSite } from '$lib/server/site';
import { loadGates } from '$lib/server/config';
import { openLink } from '$lib/openInSse';

const DEFAULT_PAGE = 30;
/** Ten is what Star System Explorer asks for; fifty is as much as one screen can use (R-20). */
const MAX_PAGE = 50;

/** A card's columns and the few more the app wants for its own list. */
const LIST_COLUMNS = [...CARD_COLUMNS, 'carried_images', 'carried_models', 'source_bytes', 'created_with', 'updated_at'];
type ListRow = CardRow & { carried_images: number; carried_models: number; source_bytes: number; created_with: string | null; updated_at: string };

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const tags = url.searchParams.getAll('tag').filter(Boolean).slice(0, 8);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const sortParam = url.searchParams.get('sort');
  const sort: 'new' | 'detailed' | 'discussed' | 'loved' =
    sortParam === 'new' ? 'new'
      : sortParam === 'detailed' ? 'detailed'
        : sortParam === 'discussed' ? 'discussed'
          : 'loved';
  const page = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
  // A CALLER-CHOSEN PAGE SIZE (R-20). The engine wants ten for a panel inside itself; the web pages
  // want thirty. Clamped, because the size is in a query string a stranger writes.
  const size = Math.max(1, Math.min(MAX_PAGE,
    Number.parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE));
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam === 'starmap' || kindParam === 'system' ? kindParam : null;

  // Built from the column list so a column the database lacks yet can be dropped and the query
  // run again (tolerant.ts).
  const sb = db(env);
  const gates = await loadGates(sb);
  const [{ data, error: e }, best] = await Promise.all([
    tolerantSelect<ListRow[]>(LIST_COLUMNS, CARD_OPTIONAL, (cols) => {
      let query = sb.from('systems').select(cols).eq('state', 'public').eq('visibility', 'public');

      if (tags.length) query = query.contains('auto_tags', tags);
      if (q) query = query.ilike('title', '%' + q + '%');
      // A campaign and a single system are different things to ask for, and the engine can only
      // OPEN the first (R-18) - so a panel offering "open this" wants to be able to say which.
      if (kind) query = query.eq('kind', kind);

      // THE SAME ORDER AS THE WEB (D-89), from the one definition - maps that need a fix after every
      // map that does not, on every page. `discussed` orders on `comments_count` (0021, long run);
      // an ORDER on a column is not something `tolerantSelect` can rescue (D-71).
      return orderCards(query, sort).range((page - 1) * size, page * size - 1);
    }),
    // What a 5 on the information meter means today (D-30).
    bestDensity(sb)
  ]);

  // Same rule as the web pages: a failed query must not be served as an empty library.
  if (e) {
    console.error('api/maps failed', e.message);
    throw error(503, 'could not read the library');
  }

  // ============================================================================================
  // ABSOLUTE URLS PER ITEM (R-20), not only the path templates below.
  //
  // The owner, on the engine showing a list of hub maps inside itself: *"we need the ability for
  // SSE to hook into - thumbnail & key data & url."* The templates stayed for the callers that
  // already use them, but assembling a URL from a template is a job every caller then does slightly
  // differently, and each one is a chance to get the hostname wrong. `site.url` is the address the
  // hub gives out everywhere else (D-41), so it is the address it hands out here.
  //
  // `openUrl` IS NULL FOR A SINGLE SYSTEM, deliberately and not as an omission: the engine refuses
  // one through `?open=` (R-18), and a link that opens the app to an error is worse than no link.
  // A caller can offer Copy for those, which is what the hub's own page does (D-56).
  // ============================================================================================
  const site = await loadSite(sb, url);
  const openPrefix = gates.open_in_sse_url;

  setHeaders({ 'cache-control': 'public, max-age=60', ...PUBLIC_CORS });
  return json({
    maps: (data ?? []).map((m) => ({
      ...m,
      // `information`: 0..5, how much of the map is written about, 5 being the best on the hub.
      information: densityLevel(m.info_density, best),
      url: site.url + '/s/' + m.slug,
      downloadUrl: site.url + '/api/download/' + m.slug,
      coverUrl: m.cover_sha256 ? site.url + '/asset/' + m.cover_sha256 : null,
      openUrl: openLink(openPrefix, site.url, m.slug, m.kind)
    })),
    page,
    pageSize: size,
    sort,
    // Kept for the callers already built against them.
    downloadPath: '/api/download/{slug}',
    coverPath: '/asset/{sha256}'
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
