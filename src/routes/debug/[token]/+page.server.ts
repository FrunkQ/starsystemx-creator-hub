import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { usableInvite } from '$lib/server/debugUploads';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const gates = await loadGates(sb);
  if (!gates.debug_uploads_enabled) throw error(404, 'Not found');

  const invite = await usableInvite(sb, params.token);
  // Unknown, spent and expired are one answer, so a guessed token learns nothing.
  if (!invite) throw error(404, 'Not found');

  // Never cached, never indexed. A one-shot link in a proxy cache is not one-shot.
  setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });

  return { note: invite.note, expiresAt: invite.expires_at, maxBytes: gates.debug_max_bytes };
};
