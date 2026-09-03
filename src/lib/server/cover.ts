// Storing a generated cover: draw, hash, put, register - and the lazy backfill for maps that
// were uploaded before the hub could draw one.
//
// ONE PLACE for both callers (ingest on upload, the map page on first view) so the two can never
// disagree about what a generated cover is or how it enters the ledger (D-21).
import type { Db, SystemRow } from './database.types';
import type { HubEnv } from './db';
import * as ledger from './ledger';
import * as r2 from './r2';
import { sha256Hex } from '$lib/bundle/hash';
import { renderCover, type CoverFacts, type CoverNode } from '$lib/cover/generate';

export const GENERATED_COVER_PATH = 'hub/generated-cover.png';

/** The primary key of `system_assets`, as the upsert's conflict target. Pinned to the migration by a test. */
export const SYSTEM_ASSETS_KEY = 'system_id,bundle_path';

/** Draw the card, put it in R2 if absent, register it approved. Returns the hash. */
export async function storeGeneratedCover(env: HubEnv, sb: Db, facts: CoverFacts): Promise<string> {
  const png = renderCover(facts);
  const hash = await sha256Hex(png);
  if (!(await r2.has(env, hash))) await r2.putAsset(env, hash, png, 'image/png');
  await ledger.registerGenerated(sb, hash, png.length);
  return hash;
}

/**
 * THE BACKFILL. A map uploaded before 0.7.0 with nothing to show has `cover_sha256` null; the first
 * visit to its page draws one and stores it, so nobody has to re-upload to get a picture.
 *
 * A write during a GET, deliberately: it is idempotent (same map, same bytes, same hash), it
 * happens once per map, and the alternative - every share of an older map previewing blank until
 * its creator notices - is the failure this whole feature exists to remove. Any error here is
 * swallowed: a page must never fail over its own decoration.
 */
export async function ensureCover(
  env: HubEnv, sb: Db,
  system: Pick<SystemRow, 'id' | 'title' | 'cover_sha256' | 'system_count' | 'body_count' | 'construct_count'>,
  nodes: CoverNode[],
  creatorHandle: string | null,
  siteName: string
): Promise<string | null> {
  if (system.cover_sha256) return system.cover_sha256;
  try {
    const hash = await storeGeneratedCover(env, sb, {
      title: system.title, creator: creatorHandle, site: siteName,
      systems: system.system_count, bodies: system.body_count, constructs: system.construct_count,
      nodes
    });
    await sb.from('systems').update({ cover_sha256: hash }).eq('id', system.id);
    // THE CONFLICT TARGET MUST BE THE TABLE'S ACTUAL PRIMARY KEY, which is (system_id, bundle_path)
    // - see db/migrations/0001. The first version of this named (system_id, sha256), PostgREST
    // refused the upsert, supabase-js reported it in `error` rather than throwing, and the row
    // silently never landed. The cover then showed on the FIRST view of a page (approved by
    // construction) and on no view after it. tests/schema.test.ts pins the key to the migration.
    const { error } = await sb.from('system_assets').upsert(
      { system_id: system.id, sha256: hash, role: 'cover', bundle_path: GENERATED_COVER_PATH, node_ref: null },
      { onConflict: SYSTEM_ASSETS_KEY, ignoreDuplicates: true }
    );
    if (error) console.warn('generated cover stored but not linked to its map', error.message);
    return hash;
  } catch (e) {
    console.warn('could not backfill a cover', e);
    return null;
  }
}
