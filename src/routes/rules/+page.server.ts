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
import { tolerantSelect } from '$lib/server/tolerant';
import { readOverrides, groupOverrides, KIND_PLURAL, type OverrideKind } from '$lib/bundle/overrides';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) return { rows: [], maps: {}, kinds: [], kind: '', total: 0 };

  const sb = db(env);

  // ============================================================================================
  // TOLERANT, BECAUSE A PUSH DEPLOYS BEFORE THE OWNER RUNS THE MIGRATION - and the first version of
  // this page named `rule_overrides` in a plain select and returned a 500 for everybody until 0037
  // was run. The rule is written down in the handover for WRITES; it is exactly as true of reads,
  // and this page is the proof.
  //
  // AND NO `.not(...is null)` FILTER. A filter on a column that does not exist yet fails the query
  // the same way naming it does, and `tolerantSelect` can only drop a COLUMN - it cannot unpick a
  // predicate. So the null rows are dropped below in JavaScript, where nothing can be behind.
  // ============================================================================================
  const { data: systems, error: readError, dropped } = await tolerantSelect<
    Array<{ id: string; slug: string; title: string; rule_overrides?: unknown }>
  >(
    ['id', 'slug', 'title', 'rule_overrides'], ['rule_overrides'],
    (cols) => sb.from('systems').select(cols).eq('state', 'public').eq('visibility', 'public')
  );
  if (readError) throw error(500, 'The rules library could not be read.');
  // The column is not there yet: an empty library is the honest answer, not an error page.
  if (dropped.includes('rule_overrides')) return { rows: [], maps: {}, kinds: [], kind: '', total: 0 };

  const maps: Record<string, { slug: string; title: string }> = {};
  const items = [];
  for (const row of systems ?? []) {
    // Most maps customise nothing, so most rows contribute nothing. Filtered here rather than in
    // the query, for the reason above.
    const found = readOverrides(row.rule_overrides);
    if (!found.length) continue;
    maps[row.id as string] = { slug: row.slug as string, title: row.title as string };
    for (const item of found) items.push({ ...item, systemId: row.id as string });
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
