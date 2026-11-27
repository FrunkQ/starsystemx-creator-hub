// THE V4 SHELVES, for SSE4 and anyone else (D-98, contract C-09). Public, no account, CORS open.
//
//   GET /api/v4?kind=pack|campaign&shelf=<shelf id>&contains=<slug>&q=<title>&page=<n>&limit=<n>
//
// `contains` is one of the slugs read from the pack itself ($lib/v4/read.ts CONTAINS): calendars,
// ship_styles, programs, overlays, sensors and so on.
//
// Every item says `generation: "v4"`; /api/maps says `generation: "v3"` on every map, so a reader of
// both can tell them apart without knowing which endpoint an item came from.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { PUBLIC_CORS, preflight } from '$lib/server/cors';
import { loadSite } from '$lib/server/site';
import { V4_CARD_COLUMNS, type V4Card } from '$lib/server/v4';
import { SHELVES, shelfOf, cleanContains, containsLabel } from '$lib/v4/read';
import { v4Badges } from '$lib/itemBadges';
import { fanWorkHeader } from '$lib/fanWork';

const MAX_PAGE = 50;

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);

  const kindParam = url.searchParams.get('kind');
  const kind = kindParam === 'pack' || kindParam === 'campaign' ? kindParam : null;
  const shelf = SHELVES.find((s) => s.id === url.searchParams.get('shelf')) ?? null;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
  const size = Math.max(1, Math.min(MAX_PAGE, Number.parseInt(url.searchParams.get('limit') ?? '30', 10) || 30));

  let query = sb.from('v4_items').select(V4_CARD_COLUMNS).eq('state', 'public');
  if (kind) query = query.eq('kind', kind);
  if (shelf) query = query.eq('kind', 'pack').overlaps('pack_kinds', shelf.kinds);
  const contains = cleanContains(url.searchParams.get('contains'));
  if (contains) query = query.not(`provides->${contains}`, 'is', null);
  if (q) query = query.ilike('title', '%' + q + '%');
  const { data, error: e } = await query.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1);
  if (e) throw error(503, 'could not read the shelves');
  const rows = (data ?? []) as unknown as V4Card[];

  const site = await loadSite(sb, url);
  const ids = [...new Set(rows.map((r) => r.creator_id))];
  const { data: people } = ids.length ? await sb.from('creators').select('id, handle, display_name').in('id', ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));

  setHeaders({ 'cache-control': 'public, max-age=60', ...PUBLIC_CORS });
  return json({
    items: rows.map(({ creator_id, ...r }) => {
      const p = who.get(creator_id);
      return {
        generation: 'v4', ...r,
        shelf: r.kind === 'pack' ? shelfOf(r.pack_kinds) : 'campaign',
        // Worked out from the item (SP14); SSE4 shows the same words and lines.
        badges: v4Badges(r),
        contains: Object.keys(r.provides ?? {}).map((slug) => ({ slug, label: containsLabel(slug), count: r.provides[slug] })),
        fanWork: r.fan_setting ? fanWorkHeader(r.fan_setting) : null,
        creator: p ? { name: p.display_name ?? p.handle, handle: p.handle } : null,
        url: `${site.url}/v/${r.slug}`,
        metaUrl: `${site.url}/api/v4/${r.slug}`,
        fileUrl: `${site.url}/api/v4/${r.slug}/file`
      };
    }),
    page, pageSize: size,
    shelves: SHELVES.map(({ id, title }) => ({ id, title }))
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
