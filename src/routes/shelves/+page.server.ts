// THE V4 SHELVES (D-98; tags design 5.7, TG15): packs by kind, campaigns, and - visibly apart - the
// fan-made, unofficial shelf for packs and campaigns made for somebody else's setting.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { V4_CARD_COLUMNS, type V4Card } from '$lib/server/v4';
import { SHELVES, shelfOf, cleanContains, containsLabel, CONTAINS } from '$lib/v4/read';

export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);
  const { data } = await sb.from('v4_items').select(V4_CARD_COLUMNS).eq('state', 'public')
    .order('created_at', { ascending: false }).limit(300);
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
  const contains = cleanContains(url.searchParams.get('contains'));
  const shown = contains ? cards.filter((c) => (c.provides ?? {})[contains]) : cards;

  const own = shown.filter((c) => !c.fan_setting);
  setHeaders({ 'cache-control': 'public, max-age=60' });
  return {
    shelves: [
      ...SHELVES.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, items: own.filter((c) => c.shelf === s.id) })),
      { id: 'campaign', title: 'Campaigns', blurb: 'Whole SSE4 campaigns to open and play.', items: own.filter((c) => c.kind === 'campaign') }
    ],
    fan: shown.filter((c) => !!c.fan_setting),
    choices,
    contains: contains ? { slug: contains, label: containsLabel(contains) } : null
  };
};
