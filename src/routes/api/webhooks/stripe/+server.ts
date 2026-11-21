// THE STRIPE WEBHOOK (paid packs, PP3).
//
// ============================================================================================
// THE SAME RULES AS THE PATREON ONE: verify the signature on the RAW body before reading a single
// field, fail closed, 404 while the switch is off, and 200 once verified so Stripe stops retrying.
//
// REPLAYS CHANGE NOTHING, three ways: Stripe's event id is remembered (stripe_events); every plan
// acts only from the state it expects (events.ts, apply.ts); and the ledger refuses a second share
// for one purchase (unique constraint, migration 0043).
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db, type HubEnv } from '$lib/server/db';
import type { Db } from '$lib/server/database.types';
import { loadGates } from '$lib/server/config';
import { paidPacksOn } from '$lib/paid/switch';
import { verifyStripeSignature } from '$lib/server/paid/stripeSignature';
import { stripe } from '$lib/server/paid/stripe';
import { applyPlan, PURCHASE_COLUMNS, type PurchaseFound } from '$lib/server/paid/apply';
import { planPaid, planRefunded, planDisputeOpened, planDisputeClosed, vatBpFrom } from '$lib/paid/events';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  const sb = db(env);
  const gates = await loadGates(sb);
  if (!paidPacksOn(gates)) throw error(404, 'Not found');
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw error(503, 'not configured');

  const raw = new Uint8Array(await request.arrayBuffer());
  const verdict = await verifyStripeSignature(secret, raw, request.headers.get('stripe-signature'),
    Math.floor(Date.now() / 1000));
  if (verdict !== 'ok') throw error(401, 'bad signature');

  let event: Obj;
  try { event = JSON.parse(new TextDecoder().decode(raw)); } catch { throw error(400, 'bad payload'); }
  // A test-mode endpoint must never act on a live event, whatever key it was sent with.
  if (event.livemode === true) return json({ ok: true, ignored: 'live event' });

  const { data: seen } = await sb.from('stripe_events').select('processed_at').eq('id', event.id).maybeSingle();
  if (seen?.processed_at) return json({ ok: true, ignored: 'already handled' });
  if (!seen) await sb.from('stripe_events').insert({ id: event.id, type: event.type });

  const result = await handle(sb, env, event, gates.paid_packs_hold_days, gates.paid_packs_sell_eu === true);
  // Marked handled only after it worked. A throw above means a 500, Stripe retries, and the state
  // checks make the retry safe.
  await sb.from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('id', event.id);
  return json({ ok: true, ...result });
};

async function purchaseBy(sb: Db, column: 'id' | 'stripe_payment_intent_id', value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const { data } = await sb.from('purchases').select(PURCHASE_COLUMNS).eq(column, value).maybeSingle();
  return (data as PurchaseFound | null) ?? null;
}

async function handle(sb: Db, env: HubEnv, event: Obj, holdDays: number, sellEu: boolean) {
  const o: Obj = event.data?.object ?? {};
  const now = new Date().toISOString();

  switch (event.type) {
    case 'checkout.session.completed': {
      if (o.payment_status !== 'paid') return { ignored: 'not paid yet' };
      const p = await purchaseBy(sb, 'id', o.metadata?.purchase_id ?? o.client_reference_id);
      if (!p) return { ignored: 'no such purchase' };
      // The card fee is on the charge's balance transaction, not on the session.
      const pi = await stripe<Obj>(env, 'GET', '/payment_intents/' + o.payment_intent,
        { expand: ['latest_charge.balance_transaction'] });
      const fee = Number(pi.latest_charge?.balance_transaction?.fee ?? NaN);
      if (!Number.isFinite(fee)) throw new Error('no balance transaction yet'); // 500: Stripe retries
      const total = Number(o.amount_total);
      const tax = Number(o.total_details?.amount_tax ?? 0);
      const plan = planPaid(p, {
        amountTotal: total, amountTax: tax, feePence: fee, paymentIntentId: String(o.payment_intent),
        country: o.customer_details?.address?.country ?? null, vatBp: vatBpFrom(total, tax)
      }, { holdDays, sellEu }, now);
      return applyPlan(sb, env, p, plan, 'paid');
    }
    case 'charge.refunded': {
      // Only a FULL refund reverses the share. A partial refund is not something this site makes;
      // if one is made by hand in Stripe, it is left for an admin adjustment and logged.
      const p = await purchaseBy(sb, 'stripe_payment_intent_id', o.payment_intent);
      if (!p) return { ignored: 'no such purchase' };
      if (Number(o.amount_refunded) < Number(o.amount)) return { ignored: 'partial refund: adjust by hand' };
      return applyPlan(sb, env, p, planRefunded(p, now, o.refunds?.data?.[0]?.metadata?.reason ?? null), 'refunded');
    }
    case 'charge.dispute.created': {
      const p = await purchaseBy(sb, 'stripe_payment_intent_id', o.payment_intent);
      if (!p) return { ignored: 'no such purchase' };
      return applyPlan(sb, env, p, planDisputeOpened(p), 'dispute_opened');
    }
    case 'charge.dispute.closed': {
      const p = await purchaseBy(sb, 'stripe_payment_intent_id', o.payment_intent);
      if (!p) return { ignored: 'no such purchase' };
      return applyPlan(sb, env, p, planDisputeClosed(p, String(o.status)), 'dispute_closed');
    }
    default:
      return { ignored: event.type };
  }
}
