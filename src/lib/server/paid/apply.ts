// CARRYING OUT A PLAN (paid packs, PP3). The rules are in $lib/paid/events.ts; this is the I/O.
//
// THE UPDATE IS CONDITIONAL ON THE STATE THE PLAN STARTED FROM: two copies of one Stripe event
// racing each other can both plan, but only one update matches, and only the winner writes ledger
// rows. Behind that, payout_ledger's unique (purchase_id, kind) refuses a second share outright.
import type { Db } from '../database.types';
import type { HubEnv } from '../db';
import type { Plan, PurchaseNow } from '$lib/paid/events';
import { stripe } from './stripe';
import * as audit from '../audit';

export const PURCHASE_COLUMNS = 'id, state, price_pence, creator_pence, site_share_bp, seller_account_id, stripe_payment_intent_id';

export type PurchaseFound = PurchaseNow & { stripe_payment_intent_id: string | null };

export async function applyPlan(
  sb: Db, env: HubEnv, p: PurchaseFound, plan: Plan, source: string
): Promise<{ applied: boolean; reason: string }> {
  if (plan.skipped) return { applied: false, reason: plan.skipped };

  if (plan.purchase) {
    const { data, error } = await sb.from('purchases').update(plan.purchase as never)
      .eq('id', p.id).eq('state', p.state).select('id');
    if (error) throw new Error('purchase update failed: ' + error.message);
    if (!data || data.length === 0) return { applied: false, reason: 'purchase changed meanwhile' };
  }

  for (const row of plan.ledger) {
    if (!p.seller_account_id) {
      // The seller's account row is gone (set null). The share has nowhere to go: say so loudly.
      await audit.record(sb, null, 'paid.ledger_orphan', 'purchase:' + p.id, row.note, row);
      continue;
    }
    const { error } = await sb.from('payout_ledger').insert({
      id: crypto.randomUUID(), seller_account_id: p.seller_account_id, purchase_id: p.id,
      kind: row.kind, amount_pence: row.amount_pence, available_at: row.available_at, note: row.note
    });
    // 23505 = the unique (purchase_id, kind) lock: this entry is already written. Exactly the point.
    if (error && error.code !== '23505') throw new Error('ledger insert failed: ' + error.message);
  }

  const intent = (plan.purchase?.stripe_payment_intent_id as string | undefined) ?? p.stripe_payment_intent_id;
  if (plan.refund && intent) await refundIntent(sb, env, p.id, intent, plan.refund, null);

  await audit.record(sb, null, 'paid.' + source, 'purchase:' + p.id, plan.refund ?? undefined,
    { state: plan.purchase?.state ?? p.state, ledger: plan.ledger.map((l) => [l.kind, l.amount_pence]) });
  return { applied: true, reason: plan.refund ? 'refunded: ' + plan.refund : 'ok' };
}

/**
 * Ask Stripe to give the money back. Idempotent on Stripe's side by purchase id, so a retried
 * webhook or a double-clicked admin button refunds once. The ledger follows from Stripe's own
 * charge.refunded event, not from here: one path for every refund, however it started.
 */
export async function refundIntent(
  sb: Db, env: HubEnv, purchaseId: string, paymentIntentId: string, reason: string, actorId: string | null
): Promise<boolean> {
  try {
    await stripe(env, 'POST', '/refunds',
      { payment_intent: paymentIntentId, metadata: { purchase_id: purchaseId, reason: reason.slice(0, 450) } },
      'refund-' + purchaseId);
    await audit.record(sb, actorId, 'paid.refund_requested', 'purchase:' + purchaseId, reason);
    return true;
  } catch (e) {
    // Never swallowed: the admin log shows a refund that still has to be made by hand.
    await audit.record(sb, actorId, 'paid.refund_failed', 'purchase:' + purchaseId, reason,
      { message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
