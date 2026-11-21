// WHAT A STRIPE EVENT DOES TO THE LEDGER (paid packs, PP3; design sections 5 and 6).
//
// ============================================================================================
// PURE: given the event and the purchase as the database holds it now, return the plan - the
// purchase's new state, the ledger rows to add, and whether to refund. The webhook route does the
// I/O; every rule about money is here, where a test can reach it.
//
// IDEMPOTENT BY STATE as well as by event id. Stripe retries and can deliver out of order, so each
// rule asks "is the purchase in the state this event moves it FROM?" and does nothing otherwise.
// The database adds a second lock (payout_ledger unique on purchase and kind), so even a bug here
// cannot pay a creator twice.
//
// THE CREATOR IS NEVER CHARGED MORE THAN THEIR SHARE. A refund or a lost dispute takes back
// exactly the share the sale gave them; the card fee Stripe keeps and the £20 dispute fee are the
// site's (design section 6).
// ============================================================================================
import type { PurchaseState, LedgerKind } from '$lib/server/database.types';
import { splitActual, type Split } from './split';

/** EU member states, ISO 3166-1 alpha-2. An EU buyer is refused while `paid_packs_sell_eu` is off (design 3.4). */
export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

export const isEuCountry = (c: string | null | undefined) => !!c && EU_COUNTRIES.has(c.toUpperCase());

/** The purchase as the plan needs it. */
export interface PurchaseNow {
  id: string;
  state: PurchaseState;
  price_pence: number;
  creator_pence: number;
  site_share_bp: number;
  seller_account_id: string | null;
}

/** The facts read from a completed checkout (and its charge's balance transaction). */
export interface PaidFacts {
  amountTotal: number;
  amountTax: number;
  feePence: number;
  country: string | null;
  paymentIntentId: string;
  /** Effective VAT rate, basis points, if Stripe Tax gave one. */
  vatBp: number | null;
}

export interface LedgerEntry {
  kind: LedgerKind;
  amount_pence: number;
  /** ISO time; null = at once. */
  available_at: string | null;
  note: string;
}

export interface Plan {
  /** Columns to set on the purchase; absent = leave it. */
  purchase?: Record<string, unknown>;
  ledger: LedgerEntry[];
  /** Refund the payment, with this reason. */
  refund?: string;
  /** Why nothing happened, for the log. */
  skipped?: string;
}

const NOTHING = (why: string): Plan => ({ ledger: [], skipped: why });

export interface PlanSettings {
  holdDays: number;
  sellEu: boolean;
}

/** checkout.session.completed with payment_status "paid". */
export function planPaid(p: PurchaseNow, f: PaidFacts, s: PlanSettings, nowIso: string): Plan {
  if (p.state !== 'pending') return NOTHING(`purchase already ${p.state}`);
  if (f.amountTotal !== p.price_pence) {
    // The price is set by the site and sent to Stripe; a different total means something is wrong.
    // Take no share and refund: never guess with money.
    // The purchase goes STRAIGHT to refunded, so the charge.refunded event that follows finds
    // nothing to reverse (no share was ever written). price_pence is the agreed price; the stored
    // split keeps the database's adds-up check true without inventing a share.
    const why = `charged ${f.amountTotal}p for a ${p.price_pence}p item`;
    return { purchase: { state: 'refunded', paid_at: nowIso, refunded_at: nowIso, refund_reason: why,
      stripe_payment_intent_id: f.paymentIntentId,
      vat_pence: 0, fee_pence: 0, creator_pence: 0, site_pence: p.price_pence }, ledger: [], refund: why };
  }
  const split: Split = splitActual(f.amountTotal, f.amountTax, f.feePence, p.site_share_bp);
  const purchase = {
    state: 'paid', paid_at: nowIso, stripe_payment_intent_id: f.paymentIntentId,
    vat_pence: split.vat, fee_pence: split.fees, creator_pence: split.creator, site_pence: split.site,
    vat_country: f.country ? f.country.toUpperCase() : null, vat_bp: f.vatBp
  };
  if (isEuCountry(f.country) && !s.sellEu) {
    // Not open to EU buyers yet: refunded at once, and the creator's share is never written. As
    // above, the purchase is marked refunded now, so the refund's own event reverses nothing.
    const why = 'Sales to buyers in the EU are not open yet';
    return { purchase: { ...purchase, state: 'refunded', refunded_at: nowIso, refund_reason: why }, ledger: [], refund: why };
  }
  const available = new Date(Date.parse(nowIso) + s.holdDays * 86400000).toISOString();
  const ledger: LedgerEntry[] = split.creator > 0
    ? [{ kind: 'sale_share', amount_pence: split.creator, available_at: available, note: 'Your share of a sale' }]
    : [];
  return { purchase, ledger };
}

/** charge.refunded (fully). */
export function planRefunded(p: PurchaseNow, nowIso: string, reason: string | null): Plan {
  if (p.state !== 'paid' && p.state !== 'disputed') return NOTHING(`purchase is ${p.state}`);
  return {
    purchase: { state: 'refunded', refunded_at: nowIso, refund_reason: reason },
    ledger: p.creator_pence > 0
      ? [{ kind: 'refund_reversal', amount_pence: -p.creator_pence, available_at: null, note: 'A sale was refunded' }]
      : []
  };
}

/** charge.dispute.created */
export function planDisputeOpened(p: PurchaseNow): Plan {
  if (p.state !== 'paid') return NOTHING(`purchase is ${p.state}`);
  return { purchase: { state: 'disputed' }, ledger: [] };
}

/** charge.dispute.closed */
export function planDisputeClosed(p: PurchaseNow, status: string): Plan {
  if (p.state !== 'disputed') return NOTHING(`purchase is ${p.state}`);
  if (status === 'won' || status === 'warning_closed') return { purchase: { state: 'paid' }, ledger: [] };
  if (status === 'lost') {
    return {
      purchase: { state: 'dispute_lost' },
      ledger: p.creator_pence > 0
        ? [{ kind: 'dispute_reversal', amount_pence: -p.creator_pence, available_at: null, note: 'A buyer\'s bank reversed a sale' }]
        : []
    };
  }
  return NOTHING(`dispute closed as ${status}`);
}

/** A readable order number from the purchase id: "SX-" and the first 8 characters, upper case. */
export const orderNumber = (purchaseId: string) => 'SX-' + purchaseId.replace(/-/g, '').slice(0, 8).toUpperCase();

/** The VAT rate a VAT-inclusive total implies, in basis points; null when there was no tax. */
export function vatBpFrom(totalPence: number, taxPence: number): number | null {
  const net = totalPence - taxPence;
  if (taxPence <= 0 || net <= 0) return null;
  return Math.floor((2 * taxPence * 10000 + net) / (2 * net));
}
