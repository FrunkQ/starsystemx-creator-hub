// THE MASTER SWITCH (paid packs; owner, 2026-11-21: "a master switch under admin that turns on the
// monetisation features"). One question every money route, screen and list asks first.
//
// OFF MEANS ABSENT, not hidden behind a message: a route answers 404 exactly as if it did not exist,
// and no page draws a price, a buy button or a seller link. A visitor cannot tell paid packs are
// built at all while it is off.
//
// IT IS A LITERAL `true`, nothing else. A row typed as "yes", 1 or "true" by hand is off: a switch
// that takes money must never be on by accident.
import { error } from '@sveltejs/kit';

export interface PaidSettings {
  paid_packs: unknown;
  paid_packs_site_share_bp: number;
  paid_packs_min_price_pence: number;
  paid_packs_price_steps: number[];
}

export const paidPacksOn = (gates: { paid_packs: unknown }): boolean => gates.paid_packs === true;

/** For a money route: carry on, or a 404 indistinguishable from a route that does not exist. */
export function requirePaidPacks(gates: { paid_packs: unknown }): void {
  if (!paidPacksOn(gates)) throw error(404, 'Not found');
}

/**
 * Is this a price a seller may set? Null when it is, or the sentence to show beside the box.
 * The minimum is a config row (design question 5); zero is not a price, it is "free", and is never
 * refused here - free is always free and needs no switch.
 */
export function checkPrice(pence: unknown, gates: Pick<PaidSettings, 'paid_packs_min_price_pence'>): string | null {
  if (typeof pence !== 'number' || !Number.isInteger(pence) || pence < 0) {
    return 'A price is a whole number of pence: for example 300 for £3.00.';
  }
  if (pence === 0) return null;
  const min = gates.paid_packs_min_price_pence;
  if (pence < min) {
    return `The lowest price is £${(min / 100).toFixed(2)}. Below that, the fixed card fee takes too much of every sale.`;
  }
  return null;
}
