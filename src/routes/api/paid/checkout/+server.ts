// START A PURCHASE (paid packs, PP3). A form post from the item's page: listing id and the
// cancellation-waiver tick box. Writes a pending purchase, opens a Stripe Checkout Session for it,
// and sends the buyer there.
//
// INVISIBLE WHILE THE SWITCH IS OFF (404, D-94). TEST KEYS ONLY (server/paid/stripe.ts).
//
// THE PRICE IS THE SITE'S, never the form's: it is read from the listing here and sent to Stripe,
// and the webhook refuses any total that differs from it.
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import { whyNotContributing } from '$lib/server/auth';
import { requirePaidPacks, checkPrice } from '$lib/paid/switch';
import { orderNumber } from '$lib/paid/events';
import { stripe, stripeSecret } from '$lib/server/paid/stripe';

/** Stripe's tax code for electronically supplied services (digital goods with no physical part). */
const TAX_CODE_DIGITAL = 'txcd_10000000';

export const POST: RequestHandler = async ({ request, platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  const sb = db(env);
  const gates = await loadGates(sb);
  requirePaidPacks(gates);
  stripeSecret(env); // 503 now, before any row is written, if payments are not set up.

  const viewer = locals.viewer;
  const blocked = whyNotContributing(viewer);
  if (blocked) throw error(401, blocked);

  const form = await request.formData();
  const listingId = String(form.get('listing_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw error(400, 'Which item?');
  // UK and EU law: the 14-day right to cancel ends when a download starts, but only if the buyer
  // agreed to that first. No tick, no sale (design 3.5).
  if (form.get('waive_cancellation') !== 'on') {
    throw error(400, 'Please tick the box: the right to cancel ends once the download starts.');
  }

  const { data: listing } = await sb.from('paid_listings')
    .select('id, system_id, title, seller_account_id, price_pence, state, approved_sha256').eq('id', listingId).maybeSingle();
  if (!listing || listing.state !== 'listed') throw error(404, 'Not found');
  const priceProblem = checkPrice(listing.price_pence, gates);
  if (priceProblem || listing.price_pence <= 0) throw error(409, 'This item is not on sale at the moment.');

  const { data: seller } = await sb.from('seller_accounts')
    .select('id, creator_id, handle, payouts_ready, suspended_at').eq('id', listing.seller_account_id).maybeSingle();
  if (!seller || !seller.payouts_ready || seller.suspended_at) throw error(409, 'This item is not on sale at the moment.');
  if (seller.creator_id === viewer!.id) throw error(409, 'This is your own item.');

  const { data: owned } = await sb.from('purchases').select('id')
    .eq('listing_id', listing.id).eq('buyer_id', viewer!.id).in('state', ['paid', 'disputed']).limit(1);
  if (owned && owned.length > 0) throw error(409, 'You already own this.');

  const { data: system } = listing.system_id
    ? await sb.from('systems').select('slug').eq('id', listing.system_id).maybeSingle()
    : { data: null };
  const site = await loadSite(sb, url);
  const back = system?.slug ? `${site.url}/s/${system.slug}` : site.url;

  const id = crypto.randomUUID();
  const order = orderNumber(id);
  const now = new Date().toISOString();
  const { error: insertError } = await sb.from('purchases').insert({
    id, order_no: order, listing_id: listing.id, system_id: listing.system_id, item_title: listing.title,
    item_sha256: listing.approved_sha256, buyer_id: viewer!.id, buyer_handle: viewer!.handle,
    seller_account_id: seller.id, seller_handle: seller.handle, price_pence: listing.price_pence,
    site_share_bp: gates.paid_packs_site_share_bp, state: 'pending', waived_cancellation_at: now
  });
  if (insertError) throw error(500, 'Could not start the purchase.');

  const session = await stripe<{ id: string; url: string }>(env, 'POST', '/checkout/sessions', {
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp', unit_amount: listing.price_pence, tax_behavior: 'inclusive',
        product_data: { name: listing.title, tax_code: TAX_CODE_DIGITAL }
      }
    }],
    automatic_tax: { enabled: true },
    // Stripe Tax needs the buyer's country; the billing address is how it gets it.
    billing_address_collection: 'required',
    client_reference_id: id,
    metadata: { purchase_id: id, order_no: order },
    payment_intent_data: { metadata: { purchase_id: id, order_no: order } },
    success_url: `${back}?bought=${order}`,
    cancel_url: back
  }, 'checkout-' + id);

  await sb.from('purchases').update({ stripe_checkout_session_id: session.id }).eq('id', id);
  throw redirect(303, session.url);
};
