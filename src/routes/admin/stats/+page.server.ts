import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { HubStats, HubTraffic } from '$lib/stats';

// Usage, from the hub's own tables rather than the host's analytics. The host can say how many
// requests hit a URL; only the hub knows which map, which creator, which refusal code, and how much
// of the storage allowance is spoken for.
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const sb = db(env);
  const [{ data, error: err }, { data: trafficData, error: trafficErr }] = await Promise.all([
    sb.rpc('hub_stats', { p_days: days }),
    // Its own function (0017), so the traffic panel can grow without rewriting hub_stats. Absent
    // until that migration runs; the panel says so rather than showing zeros.
    sb.rpc('hub_traffic', {})
  ]);

  // The most likely failure is the migration not having been run yet. Say that, plainly, rather
  // than rendering an empty dashboard that looks like a site nobody visits.
  if (err) return { stats: null, traffic: null, days, problem: err.message };
  return {
    stats: data as unknown as HubStats,
    traffic: trafficErr ? null : (trafficData as unknown as HubTraffic),
    days,
    problem: null
  };
};
