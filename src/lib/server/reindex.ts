// RE-INDEX: rebuild everything the hub DERIVES from a save, from the bundle it already holds.
//
// ============================================================================================
// WHY. The reader improves - node tags, distances and positions, small objects, credits, the
// snippet that keeps app-shipped models - and every map uploaded before an improvement still
// shows the old reading. Asking creators to re-upload is asking them to do the hub's work. The
// hub kept the bytes (r2.putBundle) precisely so it could read them again.
//
// WHAT IT TOUCHES: the tree rows, the counts and facets, the derived pills, the credits, and a
// generated cover (redrawn from the new rows). WHAT IT NEVER TOUCHES: the creator's title, blurb,
// description and tags, the publish state, the ledger, the assets, a chosen screenshot cover. It
// reads the STORED bytes, which are already the stripped version when GM material was stripped on
// upload, so nothing withheld can come back through here.
//
// TRIGGERED four ways: the map page's first view of rows written before the current reader
// (`reindexed_at` null), the creator's button on the manage page, a moderator's button on the map
// page, and the Config page walking every map an older build read (`/api/reindex`, D-87).
// ============================================================================================
import type { Db, SystemRow } from './database.types';
import type { HubEnv } from './db';
import type { Gates } from './config';
import type { Site } from './site';
import * as r2 from './r2';
import { openBundle } from '$lib/bundle/open';
import { detectKind } from '$lib/bundle/contract';
import { normalise, creditSlugs } from '$lib/bundle/normalise';
import { computeFacets, deriveTags } from '$lib/bundle/facets';
import { shippedManifest } from './shippedContent';
import { informationDensity } from '$lib/bundle/density';
import { detectGmContent } from '$lib/bundle/gmContent';
import { tolerantWrite } from './tolerant';
import { rulePackOverridesOf } from '$lib/bundle/overrides';
import { writeNodeRows } from './ingest';
import { regenerateGeneratedCover } from './cover';

export async function reindexSystem(
  env: HubEnv, sb: Db, systemId: string, site: Site, gates: Gates
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: system } = await sb.from('systems').select('*').eq('id', systemId).maybeSingle();
  if (!system) return { ok: false, message: 'No such map.' };

  const stored = await r2.getBundle(env, systemId);
  if (!stored) return { ok: false, message: 'The stored file for this map is missing.' };
  const opened = openBundle(new Uint8Array(await stored.arrayBuffer()));
  if (!opened.ok) return { ok: false, message: opened.message };
  const doc = opened.doc;

  const shaped = normalise(doc);
  // The engine's shipped-content manifest, cached (R-13, D-36). A re-index is how a map uploaded
  // against a stale baseline gets an accurate one - which is the whole point of keeping the bytes.
  const facets = computeFacets(doc, undefined, await shippedManifest(env, gates.sse_manifest_url));
  const autoTags = deriveTags(facets, { hasGmContent: detectGmContent(doc).hasGmContent });
  const density = informationDensity(doc);

  // Node images are keyed by bundle path; the link table remembers which hash sits at each.
  const { data: assets } = await sb.from('system_assets').select('sha256, bundle_path').eq('system_id', systemId);
  const byPath = new Map((assets ?? []).map((a) => [a.bundle_path as string, a.sha256 as string]));

  await sb.from('bodies').delete().eq('system_id', systemId);
  await sb.from('constructs').delete().eq('system_id', systemId);
  try {
    await writeNodeRows(sb, systemId, shaped, byPath);
  } catch (e) {
    // Said, not thrown: the manage page's button and the Config batch both report a message, and a
    // re-index that could not store the rows must not go on to stamp the map as freshly read (D-86).
    return { ok: false, message: (e as Error).message };
  }

  const { error } = await tolerantWrite({
    // THE KIND IS RE-READ, not left as uploaded (D-48). Every plain `.json` upload before 0.28.0
    // was labelled a starmap by a guess, and this is how those rows come right without asking
    // anybody to upload the file again (D-26).
    kind: detectKind(doc, opened.docPath),
    system_count: facets.systemCount,
    body_count: facets.bodyCount,
    construct_count: facets.constructCount,
    carried_images: facets.carriedImages,
    carried_models: facets.carriedModels,
    role_counts: facets.roleCounts,
    tag_namespaces: facets.tagNamespaces,
    facet_results: facets.rules,
    auto_tags: autoTags,
    content_credits: shaped.contentCredits.length ? shaped.contentCredits : null,
    content_credit_slugs: creditSlugs(shaped.contentCredits),
    info_density: density.raw,
    info_detail: { total: density.total, described: density.described, avgLength: density.avgLength },
    // The GM's custom rules (0037, D-71). RE-READ here as well as on upload, because every map
    // published before this column existed has null in it - and the standing rule is that when the
    // reader improves the hub re-indexes rather than asking anybody to upload their file again
    // (D-26). The stored bundle already holds them; nothing else has to happen.
    rule_overrides: rulePackOverridesOf(doc),
    reindexed_at: new Date().toISOString()
  }, (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', systemId)));
  if (error) return { ok: false, message: 'could not update the map: ' + error.message };

  // The card was drawn from the old rows; draw it again from the new ones.
  await regenerateGeneratedCover(env, sb, systemId, site, gates);
  return { ok: true };
}

// ============================================================================================
// EVERY MAP, AFTER THE READER CHANGES - ONE MAP PER REQUEST (D-73, rebuilt as D-87).
//
// The owner asked on 2026-09-08 for a re-index button beside the Config page's test buttons, and got
// one that re-read eight maps a press. On 2026-09-11 he pressed it after a reader fix and *"nothing
// appeared to happen"*: two maps were re-read, the rest were not, and no message came back.
// Measured afterwards, ONE map costs 20-45ms of CPU, nearly all of it drawing the cover - so eight
// in one request is 200-350ms against a free Worker's 10ms, the same wall D-53 hit decoding a single
// screenshot. The old comment's "a few at a time" was the right idea at the wrong size. The size
// that fits is one.
//
// SO THE SERVER DOES ONE MAP A REQUEST AND THE BROWSER DOES THE LOOP (`/api/reindex`), naming the
// map it is on. A loop that stops part-way now stops visibly, on a named map, and the next press
// starts from whatever is still behind.
//
// AND "BEHIND" MEANS READ BY AN OLDER BUILD. The old button compared the oldest reading with TODAY,
// which is wrong on precisely the day it is needed: a map uploaded this morning, a reader fixed this
// afternoon, and it would report "nothing is behind". `__HUB_BUILT_AT__` is when the running code
// was built (vite.config.ts).
// ============================================================================================

export interface MapToRead { id: string; slug: string; title: string; reindexed_at: string | null }

/** When the running code was built. */
export const builtAt = (): string => __HUB_BUILT_AT__;

/**
 * The maps last read before `since`, oldest first, never-read ones before all of them.
 *
 * A reading that will not parse counts as behind: re-reading a map that did not need it costs a
 * moment, and calling a stale one current is the fault this replaced.
 */
export function behind(rows: MapToRead[], since: string): MapToRead[] {
  const cutoff = Date.parse(since);
  const at = (r: MapToRead) => {
    const t = r.reindexed_at ? Date.parse(r.reindexed_at) : 0;
    return Number.isFinite(t) ? t : 0;
  };
  return rows.filter((r) => !(at(r) >= cutoff)).sort((a, b) => at(a) - at(b));
}

/** Every map the running build has not read yet. The table is small, and the rule stays testable in JS. */
export async function mapsBehind(sb: Db, since: string = builtAt()): Promise<MapToRead[]> {
  const { data } = await sb.from('systems').select('id, slug, title, reindexed_at').limit(5000);
  return behind((data ?? []) as MapToRead[], since);
}

