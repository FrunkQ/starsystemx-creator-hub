// The Patreon webhook.
//
// ============================================================================================
// AN UNVERIFIED WEBHOOK ENDPOINT IS A FREE PRO BUTTON FOR ANYONE WHO FINDS THE URL.
//
// So: verify the signature against the RAW BODY BYTES before parsing, and fail closed on anything
// unexpected. Nothing here trusts a single field until the signature has checked out.
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import * as patreon from '$lib/server/integrations/patreon';
import * as audit from '$lib/server/audit';

const HANDLED = ['members:pledge:create', 'members:pledge:update', 'members:pledge:delete'] as const;

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const sb = db(env);
  const gates = await loadGates(sb);
  // 404 rather than 403 while switched off: an endpoint that answers differently when disabled
  // tells anyone probing that it exists.
  if (!gates.patreon_enabled) throw error(404, 'Not found');

  const secret = (env as unknown as { PATREON_WEBHOOK_SECRET?: string }).PATREON_WEBHOOK_SECRET;
  if (!secret) throw error(503, 'not configured');

  // The RAW bytes. Verification must run on exactly what was sent - parsing and re-serialising
  // produces a different string and a signature that can never match.
  const raw = await request.arrayBuffer();
  const signature = request.headers.get('x-patreon-signature');

  let ok = false;
  try {
    ok = await patreon.verifyWebhook(secret, raw, signature);
  } catch (e) {
    // The verifier throws when the runtime cannot do HMAC-MD5. Fail closed and say so - never
    // treat "could not verify" as "verified".
    console.error('patreon signature verification unavailable', e);
    throw error(500, 'cannot verify');
  }
  if (!ok) throw error(401, 'bad signature');

  const event = request.headers.get('x-patreon-event') ?? '';
  if (!(HANDLED as readonly string[]).includes(event)) {
    // Acknowledge, so Patreon stops retrying something we will never act on.
    return json({ ok: true, ignored: event });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw error(400, 'bad payload');
  }

  const facts = patreon.readPledgePayload(body);
  if (!facts) return json({ ok: true, ignored: 'unreadable payload' });

  const result = await patreon.applyPledge(sb, gates, event as (typeof HANDLED)[number], facts);

  await audit.record(sb, null, 'patreon.' + event, 'patreon_user:' + facts.patreonUserId,
    result.reason, { memberId: facts.memberId, applied: result.applied });

  // Always 200 once verified. A non-2xx makes Patreon retry, and retrying a payload we understood
  // and deliberately did not act on achieves nothing.
  return json({ ok: true, applied: result.applied });
};
