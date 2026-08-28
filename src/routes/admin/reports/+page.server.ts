import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);

  // Reasons drive triage order, and report velocity against one creator or one hash is itself a
  // signal (design 6.5 / 6.6).
  const { data: open } = await sb.from('reports')
    .select('id, target, reason, detail, created_at, sha256, systems(slug, title)')
    .eq('state', 'open').order('created_at', { ascending: false }).limit(100);

  return { reports: open ?? [] };
};
