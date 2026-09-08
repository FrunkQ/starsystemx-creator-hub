// THE CUSTOM RULES LIBRARY (D-71). Everything anybody has invented, in one place.
//
// ============================================================================================
// The owner, 2026-09-08: *"the site has a browse option for all these custom overrides... and they
// can be copied and pasted in using the mechanism from 1."*
//
// So this is the second producer for the clip envelope, not a second format. A row's Copy makes the
// same `sseClip` a map page's Copy makes - the only difference is that it carries rules and no
// objects, and the paste on the far side is one code path either way.
//
// DERIVED AT READ TIME, NOT INDEXED. `systems.rule_overrides` holds each map's customisations whole
// (0037); this flattens them across every public map on every request. That is the wrong shape for
// thousands of maps and exactly right for tens: an index table would be a second thing to keep in
// step on every upload, re-index and takedown, and a stale library is worse than a slow one. The
// migration says where to look when it needs indexing.
//
// PUBLIC MAPS ONLY. A draft is not published, and a rule that only exists inside one is not the
// hub's to hand out - the same rule the download and the map page follow.
// ============================================================================================
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { readOverrides, groupOverrides, KIND_PLURAL, type OverrideKind } from '$lib/bundle/overrides';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) return { rows: [], maps: {}, kinds: [], kind: '', total: 0 };

  const sb = db(env);
  // `rule_overrides` arrives with 0037; before it runs, this reads nothing and the page says so
  // rather than failing (tolerant.ts's reasoning, without needing the helper for one column).
  const { data: systems, error: readError } = await sb.from('systems')
    .select('id, slug, title, rule_overrides')
    .eq('state', 'public').eq('visibility', 'public')
    .not('rule_overrides', 'is', null);
  if (readError) throw error(500, 'The rules library could not be read.');

  const maps: Record<string, { slug: string; title: string }> = {};
  const items = [];
  for (const row of systems ?? []) {
    maps[row.id as string] = { slug: row.slug as string, title: row.title as string };
    for (const item of readOverrides(row.rule_overrides)) {
      items.push({ ...item, systemId: row.id as string });
    }
  }

  const all = groupOverrides(items).sort((a, b) =>
    a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind.localeCompare(b.kind));

  // Which kinds exist AT ALL, so the filter strip offers only what is there. A filter for a group
  // with nothing in it is a promise the page cannot keep.
  const kinds = [...new Set(all.map((r) => r.kind))]
    .map((k) => ({ kind: k, label: KIND_PLURAL[k as OverrideKind], n: all.filter((r) => r.kind === k).length }));

  const kind = url.searchParams.get('kind') ?? '';
  return {
    rows: kind ? all.filter((r) => r.kind === kind) : all,
    maps, kinds, kind, total: all.length
  };
};
