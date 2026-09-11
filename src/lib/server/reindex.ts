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
// TRIGGERED three ways: the map page's first view of rows written before the current reader
// (`reindexed_at` null), the creator's button on the manage page, and an admin.
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
// RE-INDEXING SEVERAL AT ONCE, from the Config page (D-73).
//
// The owner, 2026-09-08: *"Is there a reindex button on the config admin screen like the test
// buttons?"* There was not - re-index was per-map, on the creator's own manage page, which is the
// right place for a creator and the wrong place for the owner after the READER has improved.
//
// That happens often enough to deserve a button: 0015 taught the hub about distances, 0023 about
// information density, D-48 about what a bare `.json` really is, and 0037 about custom rules. Each
// time, every map already stored needs reading again - and the standing rule (D-26) is that the hub
// re-reads its own files rather than asking anybody to upload theirs a second time.
//
// A FEW AT A TIME, AND THE NUMBER IS THE WHOLE DESIGN. Re-indexing one map fetches a bundle from
// R2, unzips it, parses the document and rewrites its rows. A Worker gets 10ms of CPU (D-53), and
// "re-index everything" on a library of any size is a 1102 rather than a long wait. So this does a
// bounded batch, says exactly what it did, and is meant to be pressed again - a button that reports
// "8 done, 12 to go" is honest about being a loop, where a spinner that dies at 30 seconds is not.
//
// OLDEST FIRST, by `reindexed_at`, so pressing it repeatedly always advances and never re-does the
// map it just did.
// ============================================================================================

export interface BatchResult {
  done: number;
  failed: number;
  /**
   * WHEN THE OLDEST MAP ON THE HUB WAS LAST READ, which is the honest signal for "press it again".
   *
   * A plain "N remaining" cannot be computed: staleness has no definition without knowing when the
   * READER last changed, and after one batch every map has a timestamp so a null-count reads zero
   * while half the library is still behind. The oldest date says what is true - if it is still old,
   * there is more to do.
   */
  oldest: string | null;
  /** The first thing that went wrong, if anything did. One example beats a list nobody reads. */
  firstProblem?: string;
}

export async function reindexBatch(
  env: HubEnv, sb: Db, site: Site, gates: Gates, limit = 8
): Promise<BatchResult> {
  // `nullsFirst` matters: a map indexed before `reindexed_at` existed has null, and those are
  // exactly the ones furthest behind the current reader.
  const { data: rows } = await sb.from('systems')
    .select('id')
    .order('reindexed_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  let done = 0;
  let failed = 0;
  let firstProblem: string | undefined;

  for (const row of rows ?? []) {
    // NEVER THROWS OUT OF THE LOOP. One map with a missing or unreadable bundle must not stop the
    // other seven - the whole point of a batch is that it makes progress.
    try {
      const result = await reindexSystem(env, sb, row.id as string, site, gates);
      if (result.ok) done++;
      else { failed++; firstProblem ??= result.message; }
    } catch (e) {
      failed++;
      firstProblem ??= (e as Error)?.message ?? 'unknown';
    }
  }

  // One row, not a count: after this batch, what is the oldest reading left on the hub?
  const { data: next } = await sb.from('systems')
    .select('reindexed_at')
    .order('reindexed_at', { ascending: true, nullsFirst: true })
    .limit(1).maybeSingle();

  return { done, failed, oldest: (next?.reindexed_at as string | null) ?? null, firstProblem };
}
