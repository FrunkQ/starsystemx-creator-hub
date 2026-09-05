// Cross-posting a map to the Discord sharing channel (D-32), through the outbox.
//
// The owner (2026-09-05): "Newly published and updated maps would be great if they cross published
// to a Discord channel dedicated to sharing." Posting is a network call to somebody else's
// service, so the publish action writes an INTENT and returns; delivery is the outbox drain's job
// (deliver.ts), retried, and deduplicated by the hour - a publish, unpublish, publish dance is one
// announcement, not three.
import type { Db, SystemRow } from '../database.types';
import * as outbox from './outbox';

export type ShareEvent = 'published' | 'updated';

export interface SharePayload {
  event: ShareEvent;
  slug: string;
  url: string;
  title: string;
  kind: string;
  by: string | null;
  blurb: string | null;
  /** Absolute URL of a servable cover, or null. */
  cover: string | null;
  counts: { systems: number; bodies: number; constructs: number };
  stars: number;
  downloads: number;
}

/** One post per map per event per hour at most. A pure function of the intent, never the moment. */
export function shareDedupeKey(systemId: string, event: ShareEvent, at: Date = new Date()): string {
  return ['share', systemId, event, at.toISOString().slice(0, 13)].join(':');
}

export function buildShare(
  system: Pick<SystemRow, 'slug' | 'title' | 'kind' | 'blurb' | 'summary' | 'cover_sha256' | 'system_count' | 'body_count' | 'construct_count' | 'hearts_count' | 'download_count'>,
  by: string | null, siteUrl: string, coverServable: boolean, event: ShareEvent
): SharePayload {
  return {
    event,
    slug: system.slug,
    url: siteUrl + '/s/' + system.slug,
    title: system.title,
    kind: system.kind,
    by,
    blurb: system.blurb ?? system.summary ?? null,
    cover: coverServable && system.cover_sha256 ? siteUrl + '/asset/' + system.cover_sha256 : null,
    counts: { systems: system.system_count ?? 0, bodies: system.body_count ?? 0, constructs: system.construct_count ?? 0 },
    stars: system.hearts_count ?? 0,
    downloads: system.download_count ?? 0
  };
}

export async function queueShare(sb: Db, creatorId: string, systemId: string, payload: SharePayload): Promise<void> {
  await outbox.enqueue(sb, {
    kind: 'discord.share',
    creatorId,
    payload: payload as unknown as Record<string, unknown>,
    dedupeKey: shareDedupeKey(systemId, payload.event)
  });
}
