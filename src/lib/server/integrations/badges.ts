// Hub-earned badges, and pushing them outward to Discord.
//
// THIS IS THE LEG ONLY THE HUB CAN DO. Patreon knows who pays. Discord knows who is in the server.
// Neither knows who published a map that forty people downloaded - and that is the thing actually
// worth a badge in a community of makers.
//
// Badge rules are DERIVED, never set. The rules and the art live in src/lib/badges.ts (pure, so
// they are tested and drawn on the client); this file gathers the facts they look at, stores the
// result, and queues the Discord role changes. Re-deriving on every publish queues nothing new,
// which is what makes the outbox dedupe key safe.
import type { Db } from './../database.types';
import type { Gates } from './../config';
import * as outbox from './outbox';
import { deriveBadgeSet, isBadge, type Badge, type BadgeFacts } from '$lib/badges';

export type { Badge };

/** What the hub knows about a person that a badge rule can look at. Each query failing quietly
 *  reads as "none", which is the honest answer when a table does not exist yet. */
export async function gatherFacts(sb: Db, creatorId: string): Promise<BadgeFacts> {
  const [{ data: maps }, { data: me }] = await Promise.all([
    // `*`: info_density is 0023's, and naming it before that migration fails the read - which
    // would read as "no maps" and strip every badge. A person's own maps are few.
    sb.from('systems').select('*')
      .eq('creator_id', creatorId).eq('state', 'public').eq('visibility', 'public'),
    sb.from('creators').select('created_at, role').eq('id', creatorId).maybeSingle()
  ]);
  const rows = maps ?? [];
  const slugs = rows.map((m) => m.slug);

  const [usedIn, comments, before] = await Promise.all([
    slugs.length
      ? sb.from('systems').select('id', { count: 'exact', head: true })
          .eq('state', 'public').eq('visibility', 'public').neq('creator_id', creatorId)
          .overlaps('content_credit_slugs', slugs)
          .then((r) => r.count ?? 0, () => 0)
      : Promise.resolve(0),
    sb.from('comments').select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).is('removed_at', null)
      .then((r) => r.count ?? 0, () => 0),
    me?.created_at
      ? sb.from('creators').select('id', { count: 'exact', head: true }).lt('created_at', me.created_at)
          .then((r) => r.count, () => null)
      : Promise.resolve(null as number | null)
  ]);

  return {
    maps: rows.map((m) => ({
      kind: m.kind, stars: m.hearts_count ?? 0, downloads: m.download_count ?? 0,
      images: m.carried_images ?? 0, models: m.carried_models ?? 0,
      objects: (m.body_count ?? 0) + (m.construct_count ?? 0),
      credits: Array.isArray(m.content_credits) ? m.content_credits.length : 0,
      density: typeof m.info_density === 'number' ? m.info_density : 0
    })),
    usedIn,
    comments,
    joinedRank: before == null ? null : before + 1,
    admin: me?.role === 'admin'
  };
}

export async function deriveBadges(sb: Db, creatorId: string): Promise<Badge[]> {
  return deriveBadgeSet(await gatherFacts(sb, creatorId));
}

/**
 * Recompute a creator's badges and queue any Discord role changes.
 *
 * Safe to call on every publish, unpublish, star, comment, takedown and account-page view. Cheap,
 * idempotent, and the outbox collapses the duplicates.
 */
export async function reconcile(sb: Db, gates: Gates, creatorId: string): Promise<void> {
  const should = new Set(await deriveBadges(sb, creatorId));

  const { data: existing } = await sb.from('creator_badges')
    .select('badge').eq('creator_id', creatorId);
  const has = new Set((existing ?? []).map((b) => b.badge).filter(isBadge));

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

  const roleFor: Partial<Record<Badge, string>> = { cartographer: gates.discord_role_creator };

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
