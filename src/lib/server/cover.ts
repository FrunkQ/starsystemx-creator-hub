// Generated covers: what the card needs to know, how it is stored, how it is redrawn, and the
// lazy backfill.
//
// ONE PLACE for every caller - ingest on upload, the map page on first view, the designer on the
// manage page and its live preview, re-indexing, a title or display-name change - so none of them
// can disagree about what a generated cover is or how it enters the ledger (D-21, D-22).
import type { Db, SystemRow } from './database.types';
import type { HubEnv } from './db';
import type { Gates } from './config';
import type { Site } from './site';
import * as ledger from './ledger';
import * as r2 from './r2';
import { sha256Hex } from '$lib/bundle/hash';
import { tolerantWrite } from './tolerant';
import {
  renderCover, coverOptionsFrom, DEFAULT_COVER_OPTIONS, COVER_W, COVER_H,
  type CoverFacts, type CoverNode, type CoverOptions
} from '$lib/cover/generate';
import { decodeImage, coverFit, type DecodedImage } from '$lib/cover/image';

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

export function coverFacts(subject: CoverSubject, nodes: CoverNode[], baseImage: DecodedImage | null = null): CoverFacts {
  return { ...subject, nodes, baseImage };
}

/**
 * THE CREATOR'S OWN PICTURE AS THE BASE - only one of THIS map's screenshots, and only one the
 * ledger has approved: the card is stored auto-approved (D-21) because the hub drew it, and that
 * holds only if everything it drew over had already been looked at. Decoded and fitted here, or
 * null when it cannot be (WebP, GIF, a broken file), in which case the card falls back to itself.
 */
export async function loadBaseImage(env: HubEnv, sb: Db, systemId: string, sha256: string | null): Promise<DecodedImage | null> {
  if (!sha256) return null;
  const { data: mine } = await sb.from('system_screenshots')
    .select('sha256').eq('system_id', systemId).eq('sha256', sha256).maybeSingle();
  if (!mine || !(await ledger.isServable(sb, sha256))) return null;
  const obj = await r2.getAsset(env, sha256);
  if (!obj) return null;
  const decoded = decodeImage(new Uint8Array(await obj.arrayBuffer()));
  return decoded ? coverFit(decoded, COVER_W, COVER_H) : null;
}

/** Everything the card needs for one map, from the rows, with the picture loaded if chosen. */
export async function factsFor(
  env: HubEnv, sb: Db, system: SystemRow, site: Site, gates: Gates, options: CoverOptions
): Promise<CoverFacts> {
  const [{ data: bodies }, { data: constructs }, { data: creator }] = await Promise.all([
    sb.from('bodies').select('*').eq('system_id', system.id),
    sb.from('constructs').select('*').eq('system_id', system.id),
    sb.from('creators').select('handle, display_name').eq('id', system.creator_id).maybeSingle()
  ]);
  const baseImage = options.base === 'image' ? await loadBaseImage(env, sb, system.id, options.baseImage) : null;
  return coverFacts({
    // The byline is the DISPLAY name when there is one: what the person chose to be called.
    title: system.title, creator: creator?.display_name ?? creator?.handle ?? null, kind: system.kind,
    systems: system.system_count, bodies: system.body_count, constructs: system.construct_count,
    url: site.url + '/s/' + system.slug, label: gates.cover_label
  }, [...(bodies ?? []), ...(constructs ?? [])].map(coverNodeFrom), baseImage);
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

/** Is this map's cover a picture the creator chose, rather than a card the hub drew? */
export async function coverIsScreenshot(sb: Db, system: Pick<SystemRow, 'id' | 'cover_sha256'>): Promise<boolean> {
  if (!system.cover_sha256) return false;
  const { data } = await sb.from('system_screenshots')
    .select('sha256').eq('system_id', system.id).eq('sha256', system.cover_sha256).maybeSingle();
  return !!data;
}

/**
 * REDRAW a map's generated cover from current facts and its stored choices - after a re-index,
 * a title change, a display-name change. A chosen screenshot is left alone: that was a decision.
 * Returns the new hash, or null when there was nothing to redraw. Never throws: a cover is
 * decoration and must not fail the action that asked for it.
 */
export async function regenerateGeneratedCover(
  env: HubEnv, sb: Db, systemId: string, site: Site, gates: Gates
): Promise<string | null> {
  try {
    const { data: system } = await sb.from('systems').select('*').eq('id', systemId).maybeSingle();
    if (!system || (await coverIsScreenshot(sb, system))) return null;
    const options = coverOptionsFrom(system.cover_options);
    const hash = await storeGeneratedCover(env, sb, await factsFor(env, sb, system, site, gates, options), options);
    if (hash !== system.cover_sha256) {
      await tolerantWrite({ cover_sha256: hash },
        (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', systemId)));
      await linkCover(sb, systemId, hash);
    }
    return hash;
  } catch (e) {
    console.warn('could not redraw a cover', e);
    return null;
  }
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
