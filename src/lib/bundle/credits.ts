// A CREDIT TYPED ON THE HUB, PUT BACK INTO THE FILE (D-62).
//
// ============================================================================================
// The owner, 2026-09-06: *"their manage page is an ideal place for them to fix and update licence
// info... that is then written back to the file for publication as this is the first time the user
// is challenged."* And on being asked what next: *"do the credit write-back - that is critical."*
//
// D-55 gave a creator the fields. It did not close the loop: the credit lived in `asset_claims`,
// the download was reassembled from the stored bytes, and the person who downloaded the map got a
// picture with nobody's name on it while the map's page said who made it. **The hub was saying
// something true on a web page and shipping a file that did not agree.** For a hub whose whole
// argument is "credit the artists whose work you use", that is the wrong way round.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS PATCHES THE DOWNLOAD AND NOT THE STORED BUNDLE, which was the obvious plan and is worse:
//
//   1. THE STORED BYTES ARE EVIDENCE. They are what was uploaded and what the attestation was made
//      about. Rewriting them means the hub no longer holds the thing the creator swore to, and a
//      moderator looking at a map cannot tell which parts a machine changed.
//   2. THE CLAIMS ARE ALREADY THE TRUTH. `asset_claims` is what the publish gate reads, what the
//      map page prints, and what the review tool shows. Copying that truth into a second place
//      creates two answers to one question - the exact fault D-58 refused on the clip envelope.
//   3. IT CANNOT DRIFT. Patch on the way out and the download is current by construction: edit a
//      credit and the very next download has it, with nothing to re-run and no job to fail
//      silently in the background.
//   4. IT COSTS NO EXTRA CPU. `packForDownload` already unzips and re-zips (Workers get 10ms -
//      D-53 is what happens when that is forgotten). This adds a JSON parse and stringify to work
//      already being done, rather than a second re-zip somewhere else.
//
// A re-upload from the app overwrites the doc with whatever the creator exported, which is right:
// the app is where the save is authored, and the hub's job is to make sure nothing leaves it
// uncredited in the meantime.
// ============================================================================================
import { IMAGES_DIR, MODELS_DIR, PLAYER_IMAGES_DIR, DOC_NAME, type BundleKind } from './contract';
import { collectAttributions, noProvenance, type AttributionEntry } from './attribution';

/** What the creator typed, keyed by the path the asset has INSIDE the bundle. */
export interface CreditClaim {
  title?: string | null;
  credit?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
}

/**
 * KEYED ON THE BUNDLE PATH, never on a hash, and that is deliberate.
 *
 * A model's path is `assets/models/<hash>.glb` where the hash is the ENGINE'S - and the hub hashes
 * bytes itself, because a hash supplied by a path is a claim from a stranger's zip (see
 * `claimedHashFromModelPath`). The two are normally equal and must not be ASSUMED equal: matching
 * on the path matches what `collectAttributions` actually reads, so the patch and the gate can
 * never disagree about which asset is which.
 */
export type ClaimsByPath = Map<string, CreditClaim>;

/** Only the fields the engine's own attribution reader looks at. Nothing else is touched. */
const FIELDS = ['title', 'credit', 'license', 'sourceUrl'] as const;

/**
 * Copy a claim onto an asset record, leaving anything the creator did not fill in ALONE.
 *
 * An empty field is "not answered", not "delete what is there". The manage page refuses a claim
 * with nothing in it at all (`noProvenance`), so a blank here is always a partial answer - and
 * blanking a credit the app recorded, because the hub form had one box empty, would be the hub
 * destroying provenance while claiming to improve it.
 */
function applyTo(target: Record<string, unknown>, claim: CreditClaim): boolean {
  let changed = false;
  for (const f of FIELDS) {
    const value = claim[f];
    if (typeof value !== 'string' || !value) continue;
    if (target[f] === value) continue;
    target[f] = value;
    changed = true;
  }
  return changed;
}

/**
 * Put every claim onto every node that uses that asset.
 *
 * MUTATES `doc`. Callers hold a freshly parsed copy - the stored bytes are never touched (above).
 *
 * The three shapes are the three `collectAttributions` reads, in the same order and by the same
 * rules, including the player-image trap: `PLAYER_IMAGES_DIR` starts with `IMAGES_DIR`, so a player
 * asset has to be excluded explicitly rather than by luck.
 */
export function applyCredits(doc: any, claims: ClaimsByPath): { patched: number } {
  if (!claims.size) return { patched: 0 };
  let patched = 0;

  const nodes: any[] = [];
  if (Array.isArray(doc?.nodes)) nodes.push(...doc.nodes);
  for (const entry of doc?.systems ?? []) {
    if (Array.isArray(entry?.system?.nodes)) nodes.push(...entry.system.nodes);
  }

  for (const node of nodes) {
    const hash: unknown = node?.model?.hash;
    if (typeof hash === 'string' && hash) {
      const claim = claims.get(MODELS_DIR + hash + '.glb');
      if (claim && applyTo(node.model, claim)) patched++;
    }

    const url: unknown = node?.image?.url;
    if (typeof url === 'string' && url.startsWith(IMAGES_DIR) && !url.startsWith(PLAYER_IMAGES_DIR)) {
      const claim = claims.get(url);
      if (claim && applyTo(node.image, claim)) patched++;
    }
  }

  for (const asset of doc?.playerAssets ?? []) {
    const url: unknown = asset?.dataUrl;
    if (typeof url !== 'string' || !url.startsWith(PLAYER_IMAGES_DIR)) continue;
    const claim = claims.get(url);
    if (claim && applyTo(asset, claim)) patched++;
  }

  return { patched };
}

// ============================================================================================
// ATTRIBUTIONS.md, REGENERATED.
//
// The file is the GM-readable copy of what the doc says, and the doc has just changed - so leaving
// it alone would ship a save whose own attributions file contradicted its own nodes. It is a
// working document and NEVER a gate (see the header of `attribution.ts`): nothing reads this back,
// which is why regenerating it is safe and why getting the format slightly wrong costs nothing.
//
// The shape mirrors what the engine writes, so a creator who opens one after the other sees the
// same file. THE ONE ADDED LINE says the hub filled some of it in - because the engine's own text
// claims the file was "written automatically on export", and letting that stand over credits typed
// on a web page would be a small lie that costs somebody an hour later.
// ============================================================================================

/** British spelling in the prose, and the engine's own heading words. */
export function renderAttributions(entries: AttributionEntry[], kind: BundleKind, hubEdited = false): string {
  const models = entries.filter((e) => e.kind === 'model');
  const images = entries.filter((e) => e.kind === 'image');
  const missing = entries.filter(noProvenance);

  const out: string[] = [
    '# Attributions',
    '',
    'Every uploaded asset carried by this save (`' + DOC_NAME[kind] + '`), what uses it, and the',
    'provenance recorded for it.',
    '',
    '**' + count(models.length, 'model') + ', ' + count(images.length, 'image') + '.**',
    ''
  ];

  if (missing.length) {
    out.push(
      '> ' + count(missing.length, 'asset') + (missing.length === 1 ? ' has' : ' have')
        + ' no provenance recorded at all.',
      '> That is fine for art you made yourself. For anything downloaded, fill it in.',
      ''
    );
  }

  if (models.length) {
    out.push('## 3D models', '');
    for (const e of models) out.push(...entryLines(e));
  }
  if (images.length) {
    out.push('## Images', '');
    for (const e of images) out.push(...entryLines(e));
  }

  out.push('---', '');
  if (hubEdited) {
    out.push(
      'Some of this was filled in on the hub rather than in the app, so a save exported from Star',
      'System Explorer may not have it yet. Copy it across in the app to keep the two in step.',
      ''
    );
  }
  out.push(
    'Edit the provenance in the app (the model dialog, or the picture controls beside it) and',
    'export again to refresh this file. Bundled starter models from NASA are public domain.',
    ''
  );

  return out.join('\n');
}

function entryLines(e: AttributionEntry): string[] {
  const lines = ['### ' + e.path, '- Used by: ' + (e.usedBy.join(', ') || 'nothing in this save')];
  if (e.title) lines.push('- Title: ' + e.title);
  if (e.credit) lines.push('- Credit: ' + e.credit);
  if (e.license) lines.push('- Licence: ' + e.license);
  if (e.sourceUrl) lines.push('- Source: ' + e.sourceUrl);
  // The engine's own words for the case, kept verbatim: a reader who has seen one has seen both.
  if (noProvenance(e)) lines.push('- _No provenance recorded._');
  else if (e.capturedInApp && !e.credit && !e.license && !e.sourceUrl) {
    lines.push('- A screenshot this app took of the map itself.');
  }
  lines.push('');
  return lines;
}

const count = (n: number, noun: string) => n + ' ' + noun + (n === 1 ? '' : 's');

/**
 * Patch a whole save: the doc, then the attributions file that describes it.
 *
 * Returns null when nothing changed, so a caller can leave the original bytes completely alone -
 * an unchanged download should be byte-identical to the one before it.
 */
export function creditedDoc(
  doc: any, kind: BundleKind, claims: ClaimsByPath, modelMeta: Record<string, any> = {}
): { doc: any; attributions: string } | null {
  const { patched } = applyCredits(doc, claims);
  if (!patched) return null;
  return { doc, attributions: renderAttributions(collectAttributions(doc, modelMeta), kind, true) };
}
