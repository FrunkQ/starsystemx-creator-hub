import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { HubStats } from '$lib/stats';

// Usage, from the hub's own tables rather than the host's analytics. The host can say how many
// requests hit a URL; only the hub knows which map, which creator, which refusal code, and how much
// of the storage allowance is spoken for.
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const { data, error: err } = await db(env).rpc('hub_stats', { p_days: days });

  // The most likely failure is the migration not having been run yet. Say that, plainly, rather
  // than rendering an empty dashboard that looks like a site nobody visits.
  if (err) return { stats: null, days, problem: err.message };
  return { stats: data as unknown as HubStats, days, problem: null };
};
