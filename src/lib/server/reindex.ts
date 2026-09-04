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
import { normalise, creditSlugs } from '$lib/bundle/normalise';
import { computeFacets, deriveTags } from '$lib/bundle/facets';
import { detectGmContent } from '$lib/bundle/gmContent';
import { tolerantWrite } from './tolerant';
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
  const facets = computeFacets(doc);
  const autoTags = deriveTags(facets, { hasGmContent: detectGmContent(doc).hasGmContent });

  // Node images are keyed by bundle path; the link table remembers which hash sits at each.
  const { data: assets } = await sb.from('system_assets').select('sha256, bundle_path').eq('system_id', systemId);
  const byPath = new Map((assets ?? []).map((a) => [a.bundle_path as string, a.sha256 as string]));

  await sb.from('bodies').delete().eq('system_id', systemId);
  await sb.from('constructs').delete().eq('system_id', systemId);
  await writeNodeRows(sb, systemId, shaped, byPath);

  const { error } = await tolerantWrite({
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
    reindexed_at: new Date().toISOString()
  }, (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', systemId)));
  if (error) return { ok: false, message: 'could not update the map: ' + error.message };

  // The card was drawn from the old rows; draw it again from the new ones.
  await regenerateGeneratedCover(env, sb, systemId, site, gates);
  return { ok: true };
}
