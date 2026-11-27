// THE V4 SHELVES (D-98; tags design 5.7, TG15): packs by kind, campaigns, and - visibly apart - the
// fan-made, unofficial shelf for packs and campaigns made for somebody else's setting.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { V4_CARD_COLUMNS, type V4Card } from '$lib/server/v4';
import { SHELVES, shelfOf, cleanContains, containsLabel, CONTAINS } from '$lib/v4/read';
import { tolerantSelect } from '$lib/server/tolerant';
import { CARD_COLUMNS, CARD_OPTIONAL, orderCards, type CardRow } from '$lib/server/cards';
import { V3_CONTAINS, V3_SHELF_SIZE, cleanSearch, matchesSearch } from '$lib/shelves';

export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);
  const { data, error: failed } = await sb.from('v4_items').select(V4_CARD_COLUMNS).eq('state', 'public')
    .order('created_at', { ascending: false }).limit(300);
  // A FAILED READ IS NOT AN EMPTY SHELF (27 Nov 2026): it showed "Nothing on the shelves yet" and
  // cached that for a minute. An error page carries no public cache header, so nothing keeps it.
  if (failed) {
    console.error('shelves query failed', failed.message);
    throw error(503, 'The shelves could not be read right now.');
  }
  const rows = (data ?? []) as unknown as V4Card[];
  const ids = [...new Set(rows.map((r) => r.creator_id))];
  const { data: people } = ids.length ? await sb.from('creators').select('id, handle, display_name').in('id', ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.display_name ?? p.handle]));
  const cards = rows.map((r) => ({ ...r, creator: who.get(r.creator_id) ?? null, shelf: r.kind === 'pack' ? shelfOf(r.pack_kinds) : 'campaign' }));

  // THE "CONTAINS" FILTER (example-packs note, question 6): one row of choices, read from what the
  // listed packs actually carry, and it narrows every shelf at once. Only what is present is offered.
  const tally = new Map<string, number>();
  for (const c of cards) for (const slug of Object.keys(c.provides ?? {})) tally.set(slug, (tally.get(slug) ?? 0) + 1);
  const order = Object.keys(CONTAINS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const choices = [...tally.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([slug, packs]) => ({ slug, label: containsLabel(slug), packs }));
  // The V3 maps' own "contains" pills, offered beside the packs' (a fixed list, so no extra read).
  for (const t of V3_CONTAINS) if (!choices.some((c) => c.slug === t.slug)) choices.push({ slug: t.slug, label: t.label, packs: 0 });
  const rawContains = url.searchParams.get('contains');
  const v3Tag = V3_CONTAINS.find((t) => t.slug === rawContains) ?? null;
  const contains = cleanContains(rawContains) ?? v3Tag?.slug ?? null;
  // ONE SEARCH FOR EVERY SHELF (SP17): titles and summaries, V4 here in the Worker (the V4 rows are
  // already in hand), V3 in the database the way Browse does it.
  const q = cleanSearch(url.searchParams.get('q'));
  const shown = cards.filter((c) => (!contains || (c.provides ?? {})[contains]) && matchesSearch(q, c.title, c.summary));

  // THE V3 LIBRARY AS TWO SHELVES (SP17, store packs design 9.6): "Starmaps (V3)" and "Systems (V3)",
  // read from `systems` as it is, nothing moved or rewritten. A short shelf each, most loved first,
  // with the rest on Browse, which keeps its full filters. A V3 map's "contains" is its derived pills.
  const v3Shelf = async (kind: 'starmap' | 'system') => {
    const { data: rows, error: e } = await tolerantSelect<CardRow[]>(CARD_COLUMNS, CARD_OPTIONAL, (cols) => {
      let query = sb.from('systems').select(cols).eq('state', 'public').eq('visibility', 'public').eq('kind', kind);
      if (contains) query = query.contains('auto_tags', [contains]);
      if (q) query = query.or('title.ilike.%' + q + '%,blurb.ilike.%' + q + '%');
      return orderCards(query, 'loved').limit(V3_SHELF_SIZE + 1);
    });
    if (e) { console.error('v3 shelf query failed', e.message); return { items: [] as CardRow[], more: false, failed: true }; }
    const list = rows ?? [];
    return { items: list.slice(0, V3_SHELF_SIZE), more: list.length > V3_SHELF_SIZE, failed: false };
  };
  // A slug only V4 packs can carry (calendars, ship styles) narrows the V3 shelves to nothing, and
  // asking the database for that would be a wasted read.
  const v3Possible = !contains || V3_CONTAINS.some((t) => t.slug === contains);
  const none = { items: [] as CardRow[], more: false, failed: false };
  const [starmaps, systems] = v3Possible ? await Promise.all([v3Shelf('starmap'), v3Shelf('system')]) : [none, none];
  const browse = (kind: string) => '/browse?kind=' + kind + (contains ? '&tag=' + contains : '') + (q ? '&q=' + encodeURIComponent(q) : '');

  const own = shown.filter((c) => !c.fan_setting);
  setHeaders({ 'cache-control': 'public, max-age=60' });
  return {
    shelves: [
      ...SHELVES.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, items: own.filter((c) => c.shelf === s.id) })),
      { id: 'campaign', title: 'Campaigns', blurb: 'Whole SSE4 campaigns to open and play.', items: own.filter((c) => c.kind === 'campaign') }
    ],
    fan: shown.filter((c) => !!c.fan_setting),
    v3: [
      { id: 'v3-starmap', title: 'Starmaps (V3)', blurb: 'Whole star maps made in Star System Explorer 3. SSE4 opens them too.', ...starmaps, all: browse('starmap') },
      { id: 'v3-system', title: 'Systems (V3)', blurb: 'Single star systems made in Star System Explorer 3.', ...systems, all: browse('system') }
    ],
    q,
    choices,
    contains: contains ? { slug: contains, label: v3Tag?.label ?? containsLabel(contains) } : null
  };
};
