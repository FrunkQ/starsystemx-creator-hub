// Patreon: a pledge in, a tier out.
//
// THE ONE RULE THAT MATTERS: an entitlement is NEVER derived from anything a client says. Only two
// things may grant a tier -
//
//   1. a webhook whose signature verifies against the webhook secret, or
//   2. a token exchange the hub performed itself against Patreon's API.
//
// A POST to the webhook endpoint saying "this person is a patron" is not evidence of anything, and
// an unverified webhook endpoint is a free Pro button for anyone who finds the URL.
//
// EVERYTHING HERE IS INERT until `patreon_enabled` is true and the secrets are set.
import type { Db } from './../database.types';
import type { Gates } from './../config';
import * as entitlements from './../entitlements';

export interface PatreonSecrets {
  PATREON_CLIENT_ID?: string;
  PATREON_CLIENT_SECRET?: string;
  PATREON_WEBHOOK_SECRET?: string;
}

/**
 * Verify a Patreon webhook.
 *
 * Patreon signs the raw request body with HMAC-MD5 keyed on the webhook secret and sends it in
 * `X-Patreon-Signature`. MD5 is Patreon's choice, not ours, and it is adequate for an HMAC here -
 * but it means the comparison must be constant-time, because a fast-exit compare on a short digest
 * is the one place a timing oracle is actually practical.
 *
 * NOTE: verification runs against the RAW BODY BYTES. Parse the JSON only after this returns true;
 * re-serialising and then verifying compares a different string and will fail (or, worse, be
 * "fixed" by someone disabling the check).
 */
export async function verifyWebhook(
  secret: string, rawBody: ArrayBuffer, signatureHex: string | null
): Promise<boolean> {
  if (!secret || !signatureHex) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'MD5' }, false, ['sign']
  ).catch(() => null);

  // Workers do not expose MD5 through SubtleCrypto. When the platform refuses, say so loudly
  // rather than returning true - a verifier that cannot verify must fail closed.
  if (!key) throw new Error('HMAC-MD5 unavailable on this runtime: use a JS md5 implementation');

  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
  let hex = '';
  for (const b of mac) hex += b.toString(16).padStart(2, '0');

  return timingSafeEqual(hex, signatureHex.toLowerCase());
}

/** Constant-time string compare. Never `a === b` on a signature. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type PatreonEvent =
  | 'members:pledge:create'
  | 'members:pledge:update'
  | 'members:pledge:delete';

export interface PledgeFacts {
  patreonUserId: string;
  memberId: string;
  tierIds: string[];
  /** Patreon's own paid-through date. Becomes the entitlement's expiry - see below. */
  paidThrough: string | null;
  campaignId: string | null;
}

/**
 * Apply a verified pledge event.
 *
 * `paidThrough` becomes `expires_at` DELIBERATELY. If a delete webhook is ever missed - and one
 * will be - the grant lapses on its own instead of becoming free Pro forever. A dropped revoke is
 * the failure mode worth designing against precisely because it is silent.
 */
export async function applyPledge(
  sb: Db, gates: Gates, event: PatreonEvent, facts: PledgeFacts
): Promise<{ applied: boolean; reason?: string }> {
  if (!gates.patreon_enabled) return { applied: false, reason: 'patreon integration is off' };

  if (gates.patreon_campaign_id && facts.campaignId && facts.campaignId !== gates.patreon_campaign_id) {
    return { applied: false, reason: 'different campaign' };
  }

  // The link must already exist. The hub cannot invent an account from a Patreon id, and it must
  // not: the person has to prove they own both ends by linking them.
  const { data: identity } = await sb.from('creator_identities')
    .select('creator_id')
    .eq('provider', 'patreon').eq('provider_user_id', facts.patreonUserId)
    .maybeSingle();

  if (!identity) return { applied: false, reason: 'no linked hub account' };

  if (event === 'members:pledge:delete') {
    await entitlements.revokeFromSource(sb, identity.creator_id, 'patreon', facts.memberId);
    return { applied: true };
  }

  // A row edit, not a deploy: Patreon tier ids change whenever the owner restructures their tiers.
  const map = (gates.patreon_tier_map ?? {}) as Record<string, string>;
  const tier = facts.tierIds.map((id) => map[id]).find((t) => t === 'pro') as 'pro' | undefined;

  if (!tier) {
    // Pledging at a tier that grants nothing is not an error; it just grants nothing.
    await entitlements.revokeFromSource(sb, identity.creator_id, 'patreon', facts.memberId);
    return { applied: true, reason: 'tier grants no benefit' };
  }

  await entitlements.grant(sb, {
    creatorId: identity.creator_id,
    source: 'patreon',
    tier,
    externalRef: facts.memberId,
    expiresAt: facts.paidThrough,
    note: 'Patreon tier ' + facts.tierIds.join(',')
  });
  return { applied: true };
}

/** Pull the fields we need out of Patreon's JSON:API payload, which is nested and verbose. */
export function readPledgePayload(body: unknown): PledgeFacts | null {
  const b = body as any;
  const data = b?.data;
  if (!data) return null;

  const included: any[] = Array.isArray(b?.included) ? b.included : [];
  const user = included.find((i) => i?.type === 'user');
  const campaign = included.find((i) => i?.type === 'campaign');
  const tiers = included.filter((i) => i?.type === 'tier');

  const patreonUserId = String(user?.id ?? data?.relationships?.user?.data?.id ?? '');
  if (!patreonUserId) return null;

  return {
    patreonUserId,
    memberId: String(data?.id ?? ''),
    tierIds: tiers.map((t) => String(t.id)),
    paidThrough: data?.attributes?.next_charge_date ?? data?.attributes?.pledge_relationship_end ?? null,
    campaignId: campaign ? String(campaign.id) : null
  };
}
