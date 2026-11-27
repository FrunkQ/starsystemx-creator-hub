import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { HubStats, HubTraffic } from '$lib/stats';
import { mailSent } from '$lib/server/mail';

// Usage, from the hub's own tables rather than the host's analytics. The host can say how many
// requests hit a URL; only the hub knows which map, which creator, which refusal code, and how much
// of the storage allowance is spoken for.
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const sb = db(env);
  const [{ data, error: err }, { data: trafficData, error: trafficErr }, mail, v4] = await Promise.all([
    sb.rpc('hub_stats', { p_days: days }),
    // Its own function (0017), so the traffic panel can grow without rewriting hub_stats. Absent
    // until that migration runs; the panel says so rather than showing zeros.
    sb.rpc('hub_traffic', {}),
    // Counted in the Worker rather than added to `hub_stats`, because the outbox already records
    // every send and a new SQL function would be a migration for two numbers (D-52).
    mailSent(sb),
    v4Stats(sb)
  ]);

  // The most likely failure is the migration not having been run yet. Say that, plainly, rather
  // than rendering an empty dashboard that looks like a site nobody visits.
  if (err) return { stats: null, traffic: null, mail, v4, days, problem: err.message };
  return {
    v4,
    stats: data as unknown as HubStats,
    traffic: trafficErr ? null : (trafficData as unknown as HubTraffic),
    mail,
    days,
    problem: null
  };
};

/**
 * SSE4 ITEMS (SP16), counted in the Worker from one small read of `v4_items`, for the same reason
 * as `mailSent`: a new SQL function would be a migration for a handful of numbers. The table holds
 * one row per published item, so this stays light. Their uploads are already in `upload_events`
 * (and so in the uploads tile above); their downloads are counted on the row, not as events.
 */
async function v4Stats(sb: ReturnType<typeof db>) {
  const { data, error: e } = await sb.from('v4_items').select('slug, title, kind, state, download_count, byte_size');
  if (e) return null;
  const rows = data ?? [];
  const count = (kind: string, state?: string) => rows.filter((r) => r.kind === kind && (!state || r.state === state)).length;
  const { count: openReports } = await sb.from('v4_reports').select('id', { count: 'exact', head: true }).eq('state', 'open');
  return {
    packs: { pub: count('pack', 'public'), all: count('pack') },
    campaigns: { pub: count('campaign', 'public'), all: count('campaign') },
    held: rows.filter((r) => r.state === 'held').length,
    downloads: rows.reduce((t, r) => t + (r.download_count ?? 0), 0),
    bytes: rows.reduce((t, r) => t + (r.byte_size ?? 0), 0),
    openReports: openReports ?? 0,
    top: rows.filter((r) => r.state === 'public').sort((a, b) => b.download_count - a.download_count).slice(0, 5)
      .map((r) => ({ slug: r.slug, title: r.title, downloads: r.download_count }))
  };
}
