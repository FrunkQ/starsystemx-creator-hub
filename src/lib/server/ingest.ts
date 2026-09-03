// THE UPLOAD PIPELINE. One server path, and it controls every byte.
//
// WHY THE BYTES COME THROUGH THE WORKER rather than going direct to R2 on a presigned URL, which
// is what the owner's plan describes. The plan's security property is "a banned hash is refused
// before a presigned URL is ever issued" - but a presigned URL scoped only to a KEY and a LENGTH
// lets the client upload different bytes under a key named after an approved hash, and the ledger
// then serves unreviewed content under an approved verdict. See docs/contract-with-sse.md C-03.
//
// Two ways to close that. (a) The Worker reads the zip, hashes every member itself, and writes to
// R2 - which is this file. (b) Presign with the sha256 checksum PINNED (S3 x-amz-checksum-sha256),
// so R2 itself rejects bytes that do not match the key. (b) is the better shape at scale and is
// written up in docs/decisions.md D-04; (a) is what launches, because it is correct by
// construction and the bundles are capped at 50 MB anyway.
//
// THE LIMIT OF (a), NAMED HONESTLY: the whole bundle is read into Worker memory. `max_bundle_bytes`
// is therefore a real memory ceiling and not just a cost control, and it is why that gate defaults
// to 50 MB rather than something ambitious.
import type { Db, SystemRow, UploadEventRow } from './database.types';
import { checkBundleFormat } from '$lib/bundle/format';
import { checkProvenance, noProvenance, breachesCcBy } from '$lib/bundle/attribution';
import { tolerantWrite } from './tolerant';
import { readProvenance } from '$lib/bundle/provenance';
import { detectGmContent } from '$lib/bundle/gmContent';
import { computeFacets, deriveTags } from '$lib/bundle/facets';
import { stripGmContent } from '$lib/bundle/strip';
import { checkFreshness } from '$lib/bundle/freshness';
import { zipSync, strToU8 } from 'fflate';
import { normalise, type NormalisedNode } from '$lib/bundle/normalise';
import { readZip, BundleReadError } from '$lib/bundle/read';
import { sha256Hex, claimedHashFromModelPath } from '$lib/bundle/hash';
import {
  DOC_NAME, IMAGES_DIR, MODELS_DIR, PLAYER_IMAGES_DIR, ATTRIBUTIONS_NAME,
  MIME_BY_EXT, ALLOWED_IMAGE_EXT, extOf, isZip
} from '$lib/bundle/contract';
import type { Gates } from './config';
import type { Viewer } from './auth';
import type { HubEnv } from './db';
import * as ledger from './ledger';
import * as r2 from './r2';
import { checkZipsAllowed, checkAssetCount, shouldFlag } from './gates';

export type IngestResult =
  | { ok: false; code: string; message: string; detail?: unknown }
  | {
      ok: true;
      systemId: string;
      /** The page path component. The app needs this to link somebody to what they just published. */
      slug: string;
      novelHashes: string[];
      withheldCount: number;
      flagged: boolean;
      mayPublish: boolean;
      missingProvenance: string[];
      /** What the file turned out to be, read from the file itself. */
      gmContent: string[];
      autoTags: string[];
      /** What the hub took out, when asked to strip. */
      stripped: string[];
      /** Would re-saving in a current SSE give this map more to show? A suggestion, never a fault. */
      resave: { worthResaving: boolean; reasons: string[] };
    };

interface PendingAsset {
  path: string;
  bytes: Uint8Array;
  sha256: string;
  kind: 'model' | 'image';
  mime: string;
  role: 'model' | 'node_image' | 'player_image';
}

export async function ingest(
  env: HubEnv, sb: Db, viewer: Viewer, gates: Gates,
  input: Uint8Array,
  opts: {
    /**
     * Confirmation that the creator wants to publish a save the hub has DETECTED as carrying
     * GM-only content. Not a mode selector - the mode is a property of the file (bundle/gmContent.ts)
     * and is never asked of the uploader.
     */
    confirmGmTree?: boolean;
    /**
     * "Take the GM material out for me." The hub strips it, then RE-DETECTS over its own output and
     * refuses if anything survived - see bundle/strip.ts for why that asymmetry matters.
     */
    stripGm?: boolean;
    replacesSystemId?: string;
    /**
     * The creator has been told "this file is older than the copy already published" and wants to
     * replace it anyway. Only meaningful with `replacesSystemId`.
     */
    confirmStale?: boolean;
    /**
     * The creator's provenance attestation. REQUIRED. There is no way to disprove "I made this
     * myself", so the hub does the one thing it honestly can: it asks plainly and records the
     * answer, and responsibility sits with the person who ticked it (docs/decisions.md D-09).
     */
    attestation: { accepted: boolean; textVersion: number; textShown: string };
  }
): Promise<IngestResult> {
  // Reassigned when the creator asks the hub to strip GM material out (below).
  let bytes = input;

  if (!opts.attestation?.accepted) {
    return {
      ok: false, code: 'no-attestation',
      message: 'Please confirm you have the right to share everything in this save.'
    };
  }

  const zipped = isZip(bytes);

  const zipRefusal = checkZipsAllowed(gates, zipped);
  if (zipRefusal) return { ok: false, ...zipRefusal };

  // ---- read the container -------------------------------------------------------------------
  let members: Record<string, Uint8Array> = {};
  let docText: string;
  let docPath: string;

  if (zipped) {
    try {
      members = readZip(bytes);
    } catch (e) {
      const message = e instanceof BundleReadError ? e.message : 'That archive could not be read.';
      return { ok: false, code: 'unreadable', message };
    }
    const names = Object.keys(members);
    const found =
      names.find((n) => n.endsWith(DOC_NAME.starmap)) ?? names.find((n) => n.endsWith(DOC_NAME.system));
    if (!found) {
      return {
        ok: false, code: 'not-a-save',
        message: 'That zip is not a Star System Explorer save (no starmap.json or system.json inside).'
      };
    }
    docPath = found;
    docText = new TextDecoder().decode(members[found]);
  } else {
    docPath = DOC_NAME.starmap;
    docText = new TextDecoder().decode(bytes);
  }

  let doc: any;
  try {
    doc = JSON.parse(docText);
  } catch {
    return { ok: false, code: 'bad-json', message: 'The save data inside that file is not valid JSON.' };
  }

  // ---- THE FORMAT GATE. Refuse politely; never guess. ----------------------------------------
  const format = checkBundleFormat(doc, {
    acceptUnstamped: gates.accept_unstamped_bundles,
    unstampedAs: gates.legacy_bundle_format
  });
  if (!format.ok) return { ok: false, code: format.code, message: format.message };

  const kind: 'starmap' | 'system' = docPath.endsWith(DOC_NAME.starmap) ? 'starmap' : 'system';

  // The CAPABILITY MARKER, kept separate from the contract number - which build made this map.
  // Never a parse gate; a future SSE loads an older map fine (bundle/provenance.ts).
  const madeWith = readProvenance(doc);

  // ---- THE STALE-UPLOAD GUARD (engine R-12). ---------------------------------------------------
  // An update carrying a LOWER revision than the published copy is almost always an older export
  // found in a Downloads folder weeks later, and replacing the newer copy with it is precisely the
  // data loss the counter was added to prevent. Refuse, name both numbers, and let the creator
  // override knowingly. Absent on either side means there is nothing to compare: single-system
  // saves carry no counter, older files carry none, and a database without the column yet
  // (0014 unrun) reads as none.
  if (opts.replacesSystemId && madeWith.revision !== null && !opts.confirmStale) {
    const { data: prev } = await sb.from('systems')
      .select('revision').eq('id', opts.replacesSystemId).maybeSingle();
    const published = prev?.revision ?? null;
    if (published !== null && madeWith.revision < published) {
      return {
        ok: false, code: 'stale-revision',
        message:
          'This file is revision ' + madeWith.revision + ' of the map, but the copy already published ' +
          'is revision ' + published + ' - it looks like an older export. Upload the newer save, or ' +
          'confirm that you want to replace the newer copy with this one.',
        detail: { incoming: madeWith.revision, published }
      };
    }
  }

  // ---- DOES THIS SAVE CARRY GM-ONLY CONTENT? Read from the file, not asked of the uploader ----
  // Design 3.1's rule is "never SILENTLY publish a GM tree". Detection is what makes that rule
  // enforceable: an uploader restating the export mode could get it wrong, and the wrong answer is
  // the one that leaks their campaign. So the warning fires on evidence, names exactly what it
  // found, and only appears when there is genuinely something to lose.
  let gm = detectGmContent(doc);
  let stripped: string[] = [];

  if (gm.hasGmContent && opts.stripGm) {
    const result = stripGmContent(doc);
    if (!result.ok) {
      // The stripper does not get to declare itself successful. If the detector still finds
      // something, refuse - "we could not clean this" is a far better outcome than a leaked note.
      return {
        ok: false, code: 'strip-failed',
        message:
          'Some of the GM material in this save could not be removed safely, so nothing has been ' +
          'published. Export the player version from Star System Explorer instead.',
        detail: result.survived
      };
    }
    doc = result.doc;
    stripped = result.removed;
    gm = detectGmContent(doc);

    // THE STORED BYTES MUST CHANGE TOO. The download is reassembled from what is in R2, so leaving
    // the original in place would serve exactly the notes we just removed.
    if (zipped) {
      const rebuilt: Record<string, Uint8Array> = { ...members };
      rebuilt[docPath] = strToU8(JSON.stringify(doc));
      bytes = zipSync(rebuilt);
      members = rebuilt;
    } else {
      bytes = strToU8(JSON.stringify(doc));
    }
  }

  if (gm.hasGmContent && !opts.confirmGmTree) {
    return {
      ok: false, code: 'gm-content',
      message:
        'This save still contains things meant only for you: ' + gm.summary.join('; ') + '. ' +
        'Export the player version from Star System Explorer and upload that instead - or confirm ' +
        'below if you meant to share the full map with other GMs.',
      detail: gm.summary
    };
  }

  // ---- provenance, computed from the DOC and never from ATTRIBUTIONS.md ----------------------
  const provenance = checkProvenance(doc, doc?.modelMeta ?? {}, {
    blockCcByBreach: gates.block_cc_by_breach
  });

  // ---- collect and HASH every carried asset ---------------------------------------------------
  // The hub hashes. A model path's sha256 is a CLAIM and is verified, never trusted as a key.
  const pending: PendingAsset[] = [];
  const claimMismatches: string[] = [];

  for (const [path, raw] of Object.entries(members)) {
    if (path === ATTRIBUTIONS_NAME || path.endsWith('.json') || path.endsWith('.txt')) continue;

    const ext = extOf(path);
    const isModel = path.includes(MODELS_DIR) && ext === 'glb';
    const isPlayerImage = path.includes(PLAYER_IMAGES_DIR);
    const isNodeImage = !isPlayerImage && path.includes(IMAGES_DIR);

    if (!isModel && !isPlayerImage && !isNodeImage) continue;

    if (!isModel && !(ALLOWED_IMAGE_EXT as readonly string[]).includes(ext)) {
      // An .svg is script-bearing and is not on the allowed list. Refuse rather than quarantine.
      return {
        ok: false, code: 'bad-asset-type',
        message: 'The hub does not accept that kind of file as a picture: ' + path
      };
    }

    const computed = await sha256Hex(raw);

    if (isModel) {
      const claim = claimedHashFromModelPath(path, MODELS_DIR);
      // A mismatch is either a corrupted save or an attempt to inherit another hash's verdict.
      // Either way the bytes are what count, and a save whose own content addressing is wrong is
      // not a save we put in a public library.
      if (claim && claim !== computed) claimMismatches.push(path);
    }

    pending.push({
      path, bytes: raw, sha256: computed,
      kind: isModel ? 'model' : 'image',
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      role: isModel ? 'model' : isPlayerImage ? 'player_image' : 'node_image'
    });
  }

  if (claimMismatches.length) {
    return {
      ok: false, code: 'hash-mismatch',
      message:
        'Some files in that save do not match the names they are stored under, which means the ' +
        'save is damaged. Re-save it in Star System Explorer and upload again.',
      detail: claimMismatches
    };
  }

  const countRefusal = checkAssetCount(gates, pending.length);
  if (countRefusal) return { ok: false, ...countRefusal };

  // ---- the ledger ------------------------------------------------------------------------------
  const hashes = pending.map((p) => p.sha256);
  const known = await ledger.lookup(sb, hashes);

  // A BANNED HASH NEVER REACHES R2 (design 6.1). Refused here, before anything is written.
  const banned = pending.filter((p) => known.get(p.sha256) === 'banned');
  if (banned.length) {
    return {
      ok: false, code: 'banned-asset',
      message:
        'That save contains ' + (banned.length === 1 ? 'an image' : banned.length + ' images') +
        ' previously removed from the hub. Replace it and upload again.',
      detail: banned.map((b) => b.path)
    };
  }

  const novel = pending.filter((p) => !known.has(p.sha256));
  const accountAgeHours = await accountAge(sb, viewer.id);
  const flagged = shouldFlag(gates, novel.length, accountAgeHours);

  // ---- write bytes: HEAD-and-skip, then only what is absent (design 3.4) ----------------------
  for (const asset of pending) {
    if (await r2.has(env, asset.sha256)) continue;
    await r2.putAsset(env, asset.sha256, asset.bytes, asset.mime);
  }

  await ledger.registerNovel(
    sb,
    novel.map((n) => ({ sha256: n.sha256, kind: n.kind, byte_size: n.bytes.length, mime: n.mime })),
    flagged
  );

  // ---- rows -------------------------------------------------------------------------------------
  const shaped = normalise(doc);
  // Facets are derived from the document, so they are recomputed on every upload and can never
  // drift from what the file actually contains.
  const facets = computeFacets(doc);
  const autoTags = deriveTags(facets, { hasGmContent: gm.hasGmContent });
  const systemId = opts.replacesSystemId ?? crypto.randomUUID();
  const coverHash = pickCover(doc, pending);

  const slug = await writeRows(sb, {
    systemId, viewer, kind, format: format.format, shaped, pending, provenance,
    coverHash, publishGmTree: gm.hasGmContent,
    sourceBytes: bytes.length, isUpdate: !!opts.replacesSystemId, flagged, novelCount: novel.length,
    createdWith: madeWith.createdWith, legacyStamped: format.legacyStamped,
    revision: madeWith.revision, exportMode: madeWith.exportMode,
    attestation: opts.attestation, facets, autoTags
  });

  // The original zip is kept for provenance and re-packing, NEVER served raw - serving it would
  // hand out the very bytes being withheld (design 6.2).
  await r2.putBundle(env, systemId, bytes);

  return {
    ok: true,
    systemId,
    slug,
    novelHashes: novel.map((n) => n.sha256),
    withheldCount: pending.filter((p) => known.get(p.sha256) !== 'approved').length,
    flagged,
    mayPublish: provenance.mayPublish,
    missingProvenance: provenance.missing.map((m) => m.path),
    gmContent: gm.summary,
    autoTags,
    stripped,
    resave: checkFreshness({
      createdWith: madeWith.createdWith,
      legacyStamped: format.legacyStamped,
      recommendBelow: gates.recommend_resave_below_version
    })
  };
}

async function accountAge(sb: Db, id: string): Promise<number> {
  const { data } = await sb.from('creators').select('created_at').eq('id', id).maybeSingle();
  return data?.created_at ? (Date.now() - Date.parse(data.created_at)) / 36e5 : 1e6;
}

/**
 * THE COVER IMAGE (design 7.4; docs/decisions.md Q-03).
 *
 * THE CREATOR'S CHOICE FIRST. Since engine v3.0.259 a save can carry `coverAssetId`, pointing at one
 * of the campaign's own player graphics - the star beside a picture in the app's library. Absent
 * means "guess, exactly as before". A pointer at something the bundle does not carry (the engine
 * refuses built-ins, but a hand-edited save can say anything) falls through to the guess rather
 * than to a broken cover, because a cover that 404s is worse than none.
 *
 * Then the guess: the map background, because a GM's sector map is the picture they already chose
 * to represent the campaign; then any player-view graphic; then the first body picture. A bundle
 * with no picture at all gets no cover here, and the page renders a generated card instead.
 */
function pickCover(doc: any, pending: PendingAsset[]): string | null {
  const byPath = new Map(pending.map((p) => [p.path, p.sha256]));
  const playerAsset = (id: unknown) =>
    id ? (doc?.playerAssets ?? []).find((a: any) => a?.id === id) : undefined;
  const carried = (asset: any) => (asset?.dataUrl ? byPath.get(asset.dataUrl) : undefined);

  const chosen = carried(playerAsset(doc?.coverAssetId));
  if (chosen) return chosen;

  if (doc?.mapBackground?.source === 'asset') {
    const hit = carried(playerAsset(doc.mapBackground.assetId));
    if (hit) return hit;
  }
  const player = pending.find((p) => p.role === 'player_image');
  if (player) return player.sha256;
  const node = pending.find((p) => p.role === 'node_image');
  return node?.sha256 ?? null;
}

interface WriteArgs {
  systemId: string;
  viewer: Viewer;
  kind: 'starmap' | 'system';
  format: number;
  shaped: ReturnType<typeof normalise>;
  pending: PendingAsset[];
  provenance: ReturnType<typeof checkProvenance>;
  coverHash: string | null;
  publishGmTree: boolean;
  sourceBytes: number;
  isUpdate: boolean;
  flagged: boolean;
  novelCount: number;
  createdWith: string | null;
  legacyStamped: boolean;
  revision: number | null;
  exportMode: string | null;
  facets: ReturnType<typeof computeFacets>;
  autoTags: string[];
  attestation: { accepted: boolean; textVersion: number; textShown: string };
}

async function writeRows(sb: Db, a: WriteArgs): Promise<string> {
  const { systemId, viewer, kind, format, shaped, pending, provenance, coverHash } = a;

  const slug = await uniqueSlug(sb, shaped.title, systemId);

  // A TOLERANT write: the columns added by 0014 (`revision`, `export_mode`) exist in the code the
  // moment it deploys and in the database the moment the owner runs the migration, and those are
  // not the same moment. See tolerant.ts - the row lands either way.
  const { error: sysError } = await tolerantWrite({
    id: systemId,
    slug,
    creator_id: viewer.id,
    title: shaped.title,
    summary: shaped.summary,
    description: shaped.description,
    tags: shaped.tags,
    kind,
    bundle_format: format,
    published_gm_tree: a.publishGmTree,
    // Drafts until the creator publishes. The provenance gate decides whether they CAN.
    state: 'draft',
    cover_sha256: coverHash,
    source_bytes: a.sourceBytes,
    created_with: a.createdWith,
    legacy_stamped: a.legacyStamped,
    auto_tags: a.autoTags,
    system_count: a.facets.systemCount,
    body_count: a.facets.bodyCount,
    construct_count: a.facets.constructCount,
    carried_images: a.facets.carriedImages,
    carried_models: a.facets.carriedModels,
    role_counts: a.facets.roleCounts,
    tag_namespaces: a.facets.tagNamespaces,
    facet_results: a.facets.rules,
    revision: a.revision,
    export_mode: a.exportMode
  }, (row) => Promise.resolve(sb.from('systems').upsert(row as Partial<SystemRow>)));
  if (sysError) throw new Error('could not save the map: ' + sysError.message);

  // Replace-in-place on an update: the rows are derived, so rewriting them is simpler and safer
  // than diffing, and the stable URL is the `systems` row which is not touched.
  await sb.from('system_assets').delete().eq('system_id', systemId);
  await sb.from('asset_claims').delete().eq('system_id', systemId);
  await sb.from('bodies').delete().eq('system_id', systemId);
  await sb.from('constructs').delete().eq('system_id', systemId);

  if (pending.length) {
    await sb.from('system_assets').insert(pending.map((p) => ({
      system_id: systemId, sha256: p.sha256, role: p.role, bundle_path: p.path, node_ref: null
    })));
  }

  const byPath = new Map(pending.map((p) => [p.path, p.sha256]));

  const claims = provenance.entries
    .map((e) => ({
      system_id: systemId,
      sha256: byPath.get(e.path),
      title: e.title ?? null, credit: e.credit ?? null,
      license: e.license ?? null, source_url: e.sourceUrl ?? null,
      // The same two predicates the gate uses - ONE definition, so the reviewer's card and the
      // publish gate can never disagree about what "missing" means (C-07 changed it once already).
      no_provenance: noProvenance(e),
      cc_by_breach: breachesCcBy(e)
    }))
    .filter((c) => !!c.sha256);
  if (claims.length) await sb.from('asset_claims').insert(claims);

  const nodeRow = (n: NormalisedNode) => ({
    id: crypto.randomUUID(), system_id: systemId,
    node_id: n.node_id, parent_id: n.parent_id, name: n.name, kind: n.kind,
    role_hint: n.role_hint, snippet: n.snippet, tags: n.tags,
    image_sha256: n.image_path ? byPath.get(n.image_path) ?? null : null
  });

  if (shaped.bodies.length) await sb.from('bodies').insert(shaped.bodies.map(nodeRow));
  if (shaped.constructs.length) {
    await sb.from('constructs').insert(shaped.constructs.map((n) => ({
      ...nodeRow(n),
      // The claim was verified against the bytes above, so by here it is safe to record.
      model_sha256: n.model_hash_claim ?? null
    })));
  }

  // APPEND-ONLY, and re-taken on every upload including an update. If the wording ever changes,
  // an old row still shows what was actually agreed to at the time - which is the only thing that
  // makes it worth anything if a claim is ever disputed.
  await sb.from('attestations').insert({
    id: crypto.randomUUID(),
    system_id: systemId,
    creator_id: viewer.id,
    text_version: a.attestation.textVersion,
    text_shown: a.attestation.textShown
  });

  // Tolerant for the same reason as the systems row - and this one MATTERS before 0014 runs: the
  // daily-allowance gate counts these rows, so a silently failed insert would be an uncounted upload.
  await tolerantWrite({
    id: crypto.randomUUID(), creator_id: viewer.id, system_id: systemId,
    novel_hashes: a.novelCount, total_hashes: pending.length,
    bytes: a.sourceBytes, is_update: a.isUpdate, flagged: a.flagged,
    outcome: 'ok', reason: null
  }, (row) => Promise.resolve(sb.from('upload_events').insert(row as Partial<UploadEventRow>)));

  return slug;
}

async function uniqueSlug(sb: Db, title: string, systemId: string): Promise<string> {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'system';
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : base + '-' + (i + 1);
    const { data } = await sb.from('systems').select('id').eq('slug', slug).maybeSingle();
    if (!data || data.id === systemId) return slug;
  }
  return base + '-' + systemId.slice(0, 8);
}
