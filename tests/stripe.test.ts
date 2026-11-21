// Paid packs PP3: the webhook signature, the event plans and the Stripe client's guards.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyStripeSignature, stripeSignatureFor, parseSignatureHeader } from '../src/lib/server/paid/stripeSignature';
import { formEncode, isTestKey, stripeSecret, stripe } from '../src/lib/server/paid/stripe';
import { planPaid, planRefunded, planDisputeOpened, planDisputeClosed, orderNumber, isEuCountry, vatBpFrom, type PurchaseNow } from '../src/lib/paid/events';
import type { HubEnv } from '../src/lib/server/db';

const enc = (s: string) => new TextEncoder().encode(s);
const SECRET = 'whsec_test_example';
const BODY = '{"id":"evt_1","type":"checkout.session.completed"}';

describe('webhook signature', () => {
  it('accepts a fresh genuine signature', async () => {
    const t = 1_800_000_000;
    const sig = await stripeSignatureFor(SECRET, t, enc(BODY));
    expect(await verifyStripeSignature(SECRET, enc(BODY), `t=${t},v1=${sig}`, t + 10)).toBe('ok');
  });
  it('accepts when any v1 matches (secret being rolled)', async () => {
    const t = 1_800_000_000;
    const sig = await stripeSignatureFor(SECRET, t, enc(BODY));
    expect(await verifyStripeSignature(SECRET, enc(BODY), `t=${t},v1=${'0'.repeat(64)},v1=${sig}`, t)).toBe('ok');
  });
  it('refuses a changed body, a wrong secret, an old event and no header', async () => {
    const t = 1_800_000_000;
    const sig = await stripeSignatureFor(SECRET, t, enc(BODY));
    expect(await verifyStripeSignature(SECRET, enc(BODY + ' '), `t=${t},v1=${sig}`, t)).toBe('mismatch');
    expect(await verifyStripeSignature('whsec_other', enc(BODY), `t=${t},v1=${sig}`, t)).toBe('mismatch');
    expect(await verifyStripeSignature(SECRET, enc(BODY), `t=${t},v1=${sig}`, t + 301)).toBe('stale');
    expect(await verifyStripeSignature(SECRET, enc(BODY), null, t)).toBe('missing');
    expect(parseSignatureHeader('t=abc,v1=xyz')).toBeNull();
  });
});

describe('Stripe client guards', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('takes test keys only', () => {
    expect(isTestKey('sk_test_abc')).toBe(true);
    expect(isTestKey('rk_test_abc')).toBe(true);
    expect(isTestKey('sk_live_abc')).toBe(false);
    expect(() => stripeSecret({ STRIPE_SECRET_KEY: 'sk_live_abc' } as HubEnv)).toThrow();
    expect(() => stripeSecret({} as HubEnv)).toThrow();
  });
  it('never sends a request with a live key', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(stripe({ STRIPE_SECRET_KEY: 'sk_live_abc' } as HubEnv, 'POST', '/refunds')).rejects.toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it('keeps the key out of error messages', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'No such payment_intent', type: 'invalid_request_error' } }), { status: 404 }));
    const err = await stripe({ STRIPE_SECRET_KEY: 'sk_test_SECRETVALUE' } as HubEnv, 'GET', '/payment_intents/pi_x').catch((e) => e);
    expect(String(err.message)).not.toContain('SECRETVALUE');
    expect(JSON.stringify(err)).not.toContain('SECRETVALUE');
  });
  it('form-encodes nested params the way Stripe reads them', () => {
    expect(formEncode({
      mode: 'payment', line_items: [{ quantity: 1, price_data: { unit_amount: 300, product_data: { name: 'A & B' } } }],
      automatic_tax: { enabled: true }, skip: undefined, expand: ['latest_charge.balance_transaction']
    })).toBe('mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=300'
      + '&line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=A%20%26%20B'
      + '&automatic_tax%5Benabled%5D=true&expand%5B0%5D=latest_charge.balance_transaction');
  });
});

const NOW = '2026-11-21T12:00:00.000Z';
const pending: PurchaseNow = { id: 'p1', state: 'pending', price_pence: 300, creator_pence: 0, site_share_bp: 2000, seller_account_id: 's1' };
const facts = { amountTotal: 300, amountTax: 50, feePence: 26, country: 'GB', paymentIntentId: 'pi_1', vatBp: 2000 };
const settings = { holdDays: 30, sellEu: false };

describe('event plans', () => {
  it('a UK sale writes the design table split and a share held for 30 days', () => {
    const plan = planPaid(pending, facts, settings, NOW);
    expect(plan.purchase).toMatchObject({ state: 'paid', vat_pence: 50, fee_pence: 26, creator_pence: 179, site_pence: 45 });
    expect(plan.ledger).toEqual([{ kind: 'sale_share', amount_pence: 179, available_at: '2026-12-21T12:00:00.000Z', note: 'Your share of a sale' }]);
    expect(plan.refund).toBeUndefined();
  });
  it('the four parts always add to the price', () => {
    const p = planPaid(pending, facts, settings, NOW).purchase!;
    expect((p.vat_pence as number) + (p.fee_pence as number) + (p.creator_pence as number) + (p.site_pence as number)).toBe(300);
  });
  it('a replayed or late completion changes nothing', () => {
    for (const state of ['paid', 'refunded', 'disputed', 'dispute_lost'] as const) {
      expect(planPaid({ ...pending, state }, facts, settings, NOW)).toEqual({ ledger: [], skipped: `purchase already ${state}` });
    }
  });
  it('an EU buyer is refunded while EU sales are off, with no share written', () => {
    const plan = planPaid(pending, { ...facts, country: 'fr' }, settings, NOW);
    expect(plan.refund).toMatch(/EU/);
    expect(plan.ledger).toEqual([]);
    expect(plan.purchase?.state).toBe('refunded');
    // ...so the refund's own charge.refunded event then reverses nothing.
    expect(planRefunded({ ...pending, state: 'refunded' }, NOW, null).skipped).toBeTruthy();
  });
  it('an EU buyer is sold to once EU sales are on', () => {
    const plan = planPaid(pending, { ...facts, country: 'FR' }, { ...settings, sellEu: true }, NOW);
    expect(plan.refund).toBeUndefined();
    expect(plan.ledger).toHaveLength(1);
  });
  it('a total that differs from the price is refunded, never guessed at', () => {
    const plan = planPaid(pending, { ...facts, amountTotal: 250 }, settings, NOW);
    expect(plan.refund).toBeTruthy();
    expect(plan.ledger).toEqual([]);
    const p = plan.purchase!;
    expect((p.vat_pence as number) + (p.fee_pence as number) + (p.creator_pence as number) + (p.site_pence as number)).toBe(300);
  });
  it('a refund or a lost dispute takes back exactly the share', () => {
    const paid = { ...pending, state: 'paid' as const, creator_pence: 179 };
    expect(planRefunded(paid, NOW, 'asked').ledger).toEqual([{ kind: 'refund_reversal', amount_pence: -179, available_at: null, note: 'A sale was refunded' }]);
    expect(planDisputeOpened(paid).purchase).toEqual({ state: 'disputed' });
    const disputed = { ...paid, state: 'disputed' as const };
    expect(planDisputeClosed(disputed, 'won').purchase).toEqual({ state: 'paid' });
    expect(planDisputeClosed(disputed, 'lost').ledger[0]).toMatchObject({ kind: 'dispute_reversal', amount_pence: -179 });
    expect(planDisputeClosed(paid, 'lost').skipped).toBeTruthy();
    expect(planRefunded(pending, NOW, null).skipped).toBeTruthy();
  });
  it('helpers', () => {
    expect(orderNumber('3f2a9c1e-0000-4000-8000-000000000000')).toBe('SX-3F2A9C1E');
    expect(isEuCountry('ie')).toBe(true);
    expect(isEuCountry('GB')).toBe(false);
    expect(isEuCountry(null)).toBe(false);
    expect(vatBpFrom(300, 50)).toBe(2000);
    expect(vatBpFrom(300, 0)).toBeNull();
  });
});
