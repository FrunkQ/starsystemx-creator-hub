// WHAT A CREATOR IS ENTITLED TO, AND WHY.
//
// ============================================================================================
// THE SHAPE, and it is worth stating because the obvious alternative is worse.
//
// A tier is NOT a column somebody sets. It is the best ACTIVE grant in a ledger. Three questions
// come up the moment real money is involved, and only a ledger answers them:
//
//   "why does this person have Pro?"          -> the grant row says: patreon, member 12345
//   "when does it lapse?"                     -> expires_at, set from the paid-through date
//   "they cancelled, but I gifted them a year"-> two grants; the best active one wins; cancelling
//                                                one does not silently revoke the other
//
// A tier column alone answers none of them, and the third case is the one that generates an angry
// message from someone whose gift vanished.
// ============================================================================================
//
// THE DIRECTION OF EACH INTEGRATION MATTERS, and they are different problems:
//
//   INBOUND   Patreon -> hub.  "You pay, so you get Pro."           entitlements (this file)
//   OUTBOUND  hub -> Discord.  "You published, so you get a badge."  badges.ts + the outbox
//   IDENTITY  Discord -> hub.  "Sign in with Discord."               creator_identities
//
// The outbound leg is the only one the hub is uniquely able to do: it knows things neither Patreon
// nor Discord can - that somebody published a map, that people liked it - and that is what a
// community badge should actually reward.
import type { Db } from './database.types';
import type { Gates } from './config';
import * as audit from './audit';

export type Tier = 'free' | 'pro';
export type EntitlementSource = 'patreon' | 'manual' | 'grandfathered' | 'gift';

export interface GrantInput {
  creatorId: string;
  source: EntitlementSource;
  tier: Tier;
  /** The provider's id for whatever granted this - a Patreon member id, say. */
  externalRef?: string;
  /**
   * Null is open-ended. A Patreon grant should ALWAYS set this to the paid-through date, so that a
   * missed webhook degrades into a lapse rather than into free Pro forever. A dropped revoke is the
   * failure mode to design against, because it is silent.
   */
  expiresAt?: string | null;
  note?: string;
  grantedBy?: string | null;
}

export async function grant(sb: Db, g: GrantInput): Promise<void> {
  // One live grant per (creator, source, externalRef): a webhook that fires twice must renew, not
  // stack. Revoke the previous one from the same source and ref, then insert.
  if (g.externalRef) {
    await sb.from('entitlements')
      .update({ revoked_at: new Date().toISOString() })
      .eq('creator_id', g.creatorId).eq('source', g.source)
      .eq('external_ref', g.externalRef).is('revoked_at', null);
  }

  const { error } = await sb.from('entitlements').insert({
    id: crypto.randomUUID(),
    creator_id: g.creatorId,
    source: g.source,
    tier: g.tier,
    external_ref: g.externalRef ?? null,
    expires_at: g.expiresAt ?? null,
    note: g.note ?? null,
    granted_by: g.grantedBy ?? null
  });
  if (error) throw new Error('could not grant entitlement: ' + error.message);

  await audit.record(sb, g.grantedBy ?? null, 'entitlement.grant', 'creator:' + g.creatorId, g.source, {
    tier: g.tier, externalRef: g.externalRef ?? null, expiresAt: g.expiresAt ?? null
  });
}

/**
 * Revoke every live grant from one source for one creator.
 *
 * NOTE what this deliberately does not do: it does not touch grants from any OTHER source. A
 * Patreon cancellation must not revoke a manual gift, and getting that wrong is the bug that
 * annoys exactly the people you least want to annoy.
 */
export async function revokeFromSource(
  sb: Db, creatorId: string, source: EntitlementSource, externalRef?: string, actorId?: string | null
): Promise<void> {
  let q = sb.from('entitlements')
    .update({ revoked_at: new Date().toISOString() })
    .eq('creator_id', creatorId).eq('source', source).is('revoked_at', null);
  if (externalRef) q = q.eq('external_ref', externalRef);

  const { error } = await q;
  if (error) throw new Error('could not revoke entitlement: ' + error.message);

  await audit.record(sb, actorId ?? null, 'entitlement.revoke', 'creator:' + creatorId, source, {
    externalRef: externalRef ?? null
  });
}

/** The effective tier. `creators.account_tier` is kept in step by trigger; this recomputes it. */
export async function effectiveTier(sb: Db, creatorId: string): Promise<Tier> {
  const { data, error } = await sb.rpc('creator_tier', { p_creator_id: creatorId });
  if (error) throw new Error('could not read tier: ' + error.message);
  return (data as Tier) ?? 'free';
}

/**
 * Apply a tier's benefits to the gates.
 *
 * A TIER IS A SET OF CONFIG ROWS, NOT A BRANCH IN CODE. Same reasoning as the gates themselves
 * (design 6.3): what Pro is worth should be tunable without a deploy, because it will be tuned.
 */
export function gatesForTier(gates: Gates, tier: Tier): Gates {
  if (tier !== 'pro') return gates;
  return {
    ...gates,
    uploads_per_user_per_day: gates.pro_uploads_per_user_per_day,
    max_bundle_bytes: gates.pro_max_bundle_bytes,
    max_assets_per_bundle: gates.pro_max_assets_per_bundle
  };
}
