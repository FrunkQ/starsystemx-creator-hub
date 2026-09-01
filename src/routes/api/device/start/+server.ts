// Begin pairing. The app calls this, shows the user_code, and starts polling.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { startPairing } from '$lib/server/devicePairing';

export const POST: RequestHandler = async ({ request, platform, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const gates = await loadGates(sb);
  // 404 rather than 403 when switched off: a disabled endpoint that answers differently tells
  // anyone probing that it exists.
  if (!gates.device_pairing_enabled) throw error(404, 'not found');

  const body = (await request.json().catch(() => ({}))) as { client?: unknown; version?: unknown };
  const client = typeof body.client === 'string' && body.client ? body.client : 'Star System Explorer';
  const version = typeof body.version === 'string' ? body.version : null;

  const started = await startPairing(
    sb, client, version, gates.device_code_ttl_seconds, gates.device_poll_interval_seconds
  );

  return json({
    device_code: started.deviceCode,
    user_code: started.userCode,
    verification_url: url.origin + '/link',
    expires_in: started.expiresIn,
    interval: started.interval
  });
};
