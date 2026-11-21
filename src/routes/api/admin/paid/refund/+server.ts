// AN ADMIN REFUND (paid packs, PP3). Asks Stripe to refund a purchase in full. The ledger is not
// touched here: Stripe's charge.refunded event does that, the same way for every refund.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isAdmin } from '$lib/server/auth';
import { loadGates } from '$lib/server/config';
import { requirePaidPacks } from '$lib/paid/switch';
import { refundIntent } from '$lib/server/paid/apply';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isAdmin(locals.viewer)) throw error(404, 'Not found');
  const sb = db(env);
  requirePaidPacks(await loadGates(sb));

  const body = (await request.json().catch(() => null)) as { purchase_id?: unknown; reason?: unknown } | null;
  const id = String(body?.purchase_id ?? '');
  const reason = String(body?.reason ?? '').trim();
  if (!reason) throw error(400, 'Say why: the reason goes in the log.');

  const { data: p } = await sb.from('purchases').select('id, state, stripe_payment_intent_id').eq('id', id).maybeSingle();
  if (!p) throw error(404, 'No such purchase');
  if (p.state !== 'paid' || !p.stripe_payment_intent_id) throw error(409, `This purchase is ${p.state}.`);

  const ok = await refundIntent(sb, env, p.id, p.stripe_payment_intent_id, reason, locals.viewer.id);
  if (!ok) throw error(502, 'Stripe did not take the refund. It is in the admin log.');
  return json({ ok: true });
};
