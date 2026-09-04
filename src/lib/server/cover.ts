// Generated covers: what the card needs to know, how it is stored, and the lazy backfill.
//
// ONE PLACE for every caller - ingest on upload, the map page on first view, the designer on the
// manage page and its live preview - so none of them can disagree about what a generated cover is
// or how it enters the ledger (D-21, D-22).
import type { Db, SystemRow } from './database.types';
import type { HubEnv } from './db';
import * as ledger from './ledger';
import * as r2 from './r2';
import { sha256Hex } from '$lib/bundle/hash';
import {
  renderCover, DEFAULT_COVER_OPTIONS,
  type CoverFacts, type CoverNode, type CoverOptions
} from '$lib/cover/generate';

export const GENERATED_COVER_PATH = 'hub/generated-cover.png';

/** The primary key of `system_assets`, as the upsert's conflict target. Pinned to the migration by a test. */
export const SYSTEM_ASSETS_KEY = 'system_id,bundle_path';

/** A node as the cover needs it, from a stored row or a freshly normalised one (same shape). */
export function coverNodeFrom(n: {
  node_id: string; parent_id: string | null; name: string; kind: string; role_hint: string | null;
  snippet: unknown; distance?: number | null; map_x?: number | null; map_y?: number | null;
}): CoverNode {
  // The snippet is the node itself minus its assets, so the physical facts the card draws from -
  // radius, mass, class, whether there is an ocean - are read from it rather than stored twice.
  const s = (n.snippet && typeof n.snippet === 'object' ? n.snippet : {}) as Record<string, unknown>;
  const classes = Array.isArray(s.classes) ? (s.classes as unknown[]) : [];
  const starClass = classes.find((c): c is string => typeof c === 'string' && c.startsWith('star/'));
  const hydro = s.hydrosphere;
  return {
    node_id: n.node_id, parent_id: n.parent_id, name: n.name, kind: n.kind, role_hint: n.role_hint,
    distance: n.distance ?? null, map_x: n.map_x ?? null, map_y: n.map_y ?? null,
    radius_km: typeof s.radiusKm === 'number' ? s.radiusKm : null,
    mass_kg: typeof s.massKg === 'number' ? s.massKg : null,
    star_class: starClass ? starClass.slice('star/'.length) : null,
    has_hydrosphere: !!hydro && typeof hydro === 'object' && Object.keys(hydro as object).length > 0
  };
}

export interface CoverSubject {
  title: string;
  creator: string | null;
  kind: 'starmap' | 'system';
  systems: number;
  bodies: number;
  constructs: number;
  /** The map's page, absolute, for the QR code. */
  url: string | null;
  /** The domain printed bottom-right (config `cover_label`). */
  label: string;
}

export function coverFacts(subject: CoverSubject, nodes: CoverNode[]): CoverFacts {
  return { ...subject, nodes };
}

/** Draw the card, put it in R2 if absent, register it approved. Returns the hash. */
export async function storeGeneratedCover(
  env: HubEnv, sb: Db, facts: CoverFacts, options: CoverOptions = DEFAULT_COVER_OPTIONS
): Promise<string> {
  const png = renderCover(facts, options);
  const hash = await sha256Hex(png);
  if (!(await r2.has(env, hash))) await r2.putAsset(env, hash, png, 'image/png');
  await ledger.registerGenerated(sb, hash, png.length);
  return hash;
}

/**
 * Link a generated cover to its map, so the refcount and the page's approval lookup both see it.
 *
 * THE CONFLICT TARGET MUST BE THE TABLE'S ACTUAL PRIMARY KEY, (system_id, bundle_path) - see
 * db/migrations/0001. The first version named (system_id, sha256), PostgREST refused the upsert,
 * supabase-js reported it in `error` rather than throwing, and the row silently never landed. The
 * cover then showed on the FIRST view of a page and on no view after it (0.7.1).
 */
export async function linkCover(sb: Db, systemId: string, hash: string): Promise<void> {
  const { error } = await sb.from('system_assets').upsert(
    { system_id: systemId, sha256: hash, role: 'cover', bundle_path: GENERATED_COVER_PATH, node_ref: null },
    { onConflict: SYSTEM_ASSETS_KEY, ignoreDuplicates: true }
  );
  if (error) console.warn('generated cover stored but not linked to its map', error.message);
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
  system: Pick<SystemRow, 'id' | 'cover_sha256'>,
  subject: CoverSubject,
  nodes: CoverNode[]
): Promise<string | null> {
  if (system.cover_sha256) return system.cover_sha256;
  try {
    const hash = await storeGeneratedCover(env, sb, coverFacts(subject, nodes));
    await sb.from('systems').update({ cover_sha256: hash }).eq('id', system.id);
    await linkCover(sb, system.id, hash);
    return hash;
  } catch (e) {
    console.warn('could not backfill a cover', e);
    return null;
  }
}
