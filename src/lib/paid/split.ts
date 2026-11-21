// THE SPLIT: where every penny of a sale goes (paid packs, PP1; design SSE4-explorers-paid-packs.md
// section 4; owner's ruling 2026-11-21, "the cut is shown openly and honestly").
//
// ============================================================================================
// THE RULE (design question 4, built to the recommendation and kept as a setting): tax and card
// fees come off first, because neither the creator nor the site keeps them; what is left is split
// 80 to the creator and 20 to the site. On a £3 UK sale that is 50p VAT, 26p fees, £1.79 and 45p.
//
// WHOLE PENCE, NO LEAKS. Every amount is an integer number of pence and the four parts ALWAYS add
// back to the sticker price: VAT and fees are rounded to the nearest penny, the creator's share is
// rounded to the nearest penny, and the site gets exactly what is left. A penny cannot appear or
// vanish between the buyer's receipt, the creator's statement and the ledger, because there is
// only one place that does the sum. No floating point touches money here.
//
// THE NUMBERS ARE INPUTS, NOT CONSTANTS. The fee schedule is Stripe's (read 21 Nov 2026, design
// section 4) and the share is a config row, so a change to either is a setting, never a rewrite.
// ============================================================================================

/** A provider's charge on one card payment: a percentage in basis points plus a fixed amount. */
export interface FeeSchedule {
  /** Card fee, basis points (150 = 1.5%). */
  cardBp: number;
  /** Fixed card fee per payment, pence. */
  fixedPence: number;
  /** Tax calculation fee, basis points of the sale (Stripe Tax: 50 = 0.5%). 0 if not used. */
  taxBp: number;
}

/**
 * Stripe UK card fees, read from Stripe's UK pricing page on 2026-11-21 (design section 4).
 * Stripe Tax is 0.5% where the seller is registered. Currency conversion (+2%) is not included:
 * prices are set and charged in pounds.
 */
export const STRIPE_UK: Record<'uk' | 'eea' | 'international', FeeSchedule> = {
  uk: { cardBp: 150, fixedPence: 20, taxBp: 50 },
  eea: { cardBp: 250, fixedPence: 20, taxBp: 50 },
  international: { cardBp: 315, fixedPence: 20, taxBp: 50 }
};

/** UK standard VAT, basis points. A buyer elsewhere has their own country's rate (Stripe Tax says which). */
export const UK_VAT_BP = 2000;

/** The site's share of what is left after tax and fees, basis points. 2000 = 20%. A config row. */
export const DEFAULT_SITE_SHARE_BP = 2000;

export interface SplitInput {
  /** The sticker price the buyer pays, tax included, in pence. */
  pricePence: number;
  /** The buyer's VAT rate in basis points (2000 = 20%). 0 where no VAT is due. */
  vatBp: number;
  fees: FeeSchedule;
  /** The site's share of the remainder, basis points. */
  siteShareBp: number;
}

export interface Split {
  price: number;
  /** VAT inside the price. */
  vat: number;
  /** Card and tax-calculation fees together. */
  fees: number;
  /** What is left to divide: price - vat - fees. */
  net: number;
  creator: number;
  site: number;
  /**
   * True when the fees and tax eat the whole price, so nothing is left to split. A minimum price
   * stops this ever being offered; it is reported rather than thrown so a test or a preview can
   * show the reason.
   */
  loss: boolean;
}

/** Round a non-negative a/b to the nearest whole number, halves up, in integer arithmetic. */
function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

function wholeNonNegative(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a whole number of at least 0 (got ${n})`);
}

/** The split of one sale. Pure: the same input always gives the same pennies. */
export function splitSale({ pricePence, vatBp, fees, siteShareBp }: SplitInput): Split {
  wholeNonNegative('pricePence', pricePence);
  wholeNonNegative('vatBp', vatBp);
  wholeNonNegative('cardBp', fees.cardBp);
  wholeNonNegative('fixedPence', fees.fixedPence);
  wholeNonNegative('taxBp', fees.taxBp);
  wholeNonNegative('siteShareBp', siteShareBp);
  if (siteShareBp > 10000) throw new RangeError('siteShareBp cannot exceed 10000 (100%)');

  // Prices are shown WITH tax (UK consumer law), so VAT is the part of the price that is tax:
  // price x rate / (1 + rate).
  const vat = roundDiv(pricePence * vatBp, 10000 + vatBp);
  // Both percentage fees are charged on what the buyer pays, then the fixed fee on top. Rounded
  // once, on the total, so two half-pennies do not become two pennies.
  const fee = fees.fixedPence + roundDiv(pricePence * (fees.cardBp + fees.taxBp), 10000);
  const net = pricePence - vat - fee;
  if (net <= 0) {
    // Nothing to split. The site has absorbed the shortfall; the creator is never charged for a sale.
    return { price: pricePence, vat, fees: fee, net, creator: 0, site: net, loss: true };
  }
  const creator = roundDiv(net * (10000 - siteShareBp), 10000);
  return { price: pricePence, vat, fees: fee, net, creator, site: net - creator, loss: false };
}

/** The usual case: a UK buyer on a standard card, at the configured share. */
export const splitUk = (pricePence: number, siteShareBp = DEFAULT_SITE_SHARE_BP): Split =>
  splitSale({ pricePence, vatBp: UK_VAT_BP, fees: STRIPE_UK.uk, siteShareBp });

/** "£3.00", "45p", "£1.79". Pence below a pound read as pence, the way the design writes them. */
export function money(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const p = Math.abs(pence);
  if (p < 100) return `${sign}${p}p`;
  return `${sign}£${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
}

/**
 * THE OPEN SPLIT LINE, word for word the same for the buyer before paying, on the receipt, and for
 * the seller as they type a price (owner, 2026-11-21: "the cut shown openly and honestly").
 * "£3.00: 50p VAT, 26p card fees, £1.79 to the creator, 45p to Explorers for hosting".
 */
export function splitLine(s: Split): string {
  const price = s.price < 100 ? `£0.${String(s.price).padStart(2, '0')}` : money(s.price);
  if (s.loss) return `${price}: ${money(s.vat)} VAT and ${money(s.fees)} card fees use up the whole price, so nothing is left for the creator. Choose a higher price.`;
  return `${price}: ${money(s.vat)} VAT, ${money(s.fees)} card fees, ${money(s.creator)} to the creator, ${money(s.site)} to Explorers for hosting`;
}
