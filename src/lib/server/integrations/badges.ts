// Hub-earned badges, and pushing them outward to Discord.
//
// THIS IS THE LEG ONLY THE HUB CAN DO. Patreon knows who pays. Discord knows who is in the server.
// Neither knows who published a map that forty people downloaded - and that is the thing actually
// worth a badge in a community of makers.
//
// Badge rules are DERIVED, never set. `deriveBadges` is a pure function of what the database
// already knows, so it can be re-run at any time and always agrees with itself. That is what makes
// the outbox dedupe key safe: re-deriving on every publish queues nothing new.
import type { Db } from './../database.types';
import type { Gates } from './../config';
import * as outbox from './outbox';

export const BADGES = {
  /**
   * Published at least one public map.
   *
   * NOT called `explorer`: everyone who signs up is an Explorer, so a badge saying so would mean
   * nothing and reward nothing. A cartographer is an explorer who charted something and gave the
   * chart to other people - which is exactly what this badge is for.
   */
  cartographer: 'cartographer',
  /** A published map has passed a heart threshold. */
  featured: 'featured'
} as const;

export type Badge = (typeof BADGES)[keyof typeof BADGES];

const FEATURED_HEARTS = 25;

export async function deriveBadges(sb: Db, creatorId: string): Promise<Badge[]> {
  const { data: published } = await sb.from('systems')
    .select('hearts_count')
    .eq('creator_id', creatorId).eq('state', 'public').eq('visibility', 'public');

  const rows = published ?? [];
  const badges: Badge[] = [];
  if (rows.length > 0) badges.push(BADGES.cartographer);
  if (rows.some((r) => (r.hearts_count ?? 0) >= FEATURED_HEARTS)) badges.push(BADGES.featured);
  return badges;
}

/**
 * Recompute a creator's badges and queue any Discord role changes.
 *
 * Safe to call on every publish, unpublish, heart and removal. Cheap, idempotent, and the outbox
 * collapses the duplicates.
 */
export async function reconcile(sb: Db, gates: Gates, creatorId: string): Promise<void> {
  const should = new Set(await deriveBadges(sb, creatorId));

  const { data: existing } = await sb.from('creator_badges')
    .select('badge').eq('creator_id', creatorId);
  const has = new Set((existing ?? []).map((b) => b.badge as Badge));

  for (const badge of should) {
    if (!has.has(badge)) {
      await sb.from('creator_badges').upsert(
        { creator_id: creatorId, badge },
        { onConflict: 'creator_id,badge', ignoreDuplicates: true }
      );
    }
  }
  for (const badge of has) {
    // A badge is LOST when the thing that earned it goes away - a map unpublished, or removed by a
    // moderator. Not doing this would leave a community role attached to content that no longer
    // exists, which is exactly the sort of thing that erodes trust in a badge.
    if (!should.has(badge)) {
      await sb.from('creator_badges').delete().eq('creator_id', creatorId).eq('badge', badge);
    }
  }

  if (!gates.discord_enabled || !gates.discord_guild_id) return;

  const { data: identity } = await sb.from('creator_identities')
    .select('provider_user_id')
    .eq('creator_id', creatorId).eq('provider', 'discord')
    .maybeSingle();
  if (!identity) return; // no linked Discord account: nothing to push, and that is fine

  const roleFor: Partial<Record<Badge, string>> = { [BADGES.cartographer]: gates.discord_role_creator };

  for (const [badge, roleId] of Object.entries(roleFor)) {
    if (!roleId) continue;
    const wants = should.has(badge as Badge);
    await outbox.enqueue(sb, {
      kind: wants ? 'discord.role.add' : 'discord.role.remove',
      creatorId,
      payload: { discordUserId: identity.provider_user_id, roleId },
      // A pure function of the intent, so re-running this changes nothing until the intent itself
      // changes. Never put a timestamp in here.
      dedupeKey: [creatorId, 'discord', roleId, wants ? 'add' : 'remove'].join(':')
    });
  }
}
