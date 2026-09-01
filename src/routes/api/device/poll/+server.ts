// Poll for approval. Returns the token exactly once, then the code is spent.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { poll } from '$lib/server/devicePairing';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const gates = await loadGates(sb);
  if (!gates.device_pairing_enabled) throw error(404, 'not found');

  const body = (await request.json().catch(() => ({}))) as { device_code?: unknown };
  const deviceCode = typeof body.device_code === 'string' ? body.device_code : '';
  if (!deviceCode) return json({ status: 'expired' }, { status: 410 });

  const outcome = await poll(sb, deviceCode, gates.device_poll_interval_seconds);

  // Status codes chosen so a client can branch without parsing the body.
  if (outcome.status === 'pending') return json({ status: 'pending' }, { status: 202 });
  if (outcome.status === 'slow_down') return json({ status: 'slow_down' }, { status: 429 });
  if (outcome.status === 'expired') return json({ status: 'expired' }, { status: 410 });

  return json({ status: 'ready', token: outcome.token, handle: outcome.handle, expires_at: null });
};
