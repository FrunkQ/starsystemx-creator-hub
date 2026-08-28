// Provenance, computed from the DOCUMENT. Never read out of ATTRIBUTIONS.md.
//
// ============================================================================================
// THE MOST IMPORTANT THING IN THIS DIRECTORY. READ BEFORE CHANGING ANY OF IT.
// ============================================================================================
// The public-sharing gate is `missing.length === 0` (design 3.3), and it is tempting to get that
// number by reading `ATTRIBUTIONS.md` out of the bundle - the engine already wrote it, it already
// contains the literal string `_No provenance recorded._`, and it already prints a count.
//
// THAT WOULD BE A GATE ANYBODY COULD OPEN. `ATTRIBUTIONS.md` is a generated file sitting inside a
// zip that a stranger uploaded. Deleting nine lines of markdown from it passes the gate while the
// assets underneath remain completely uncredited. The engine's own header calls it a WORKING
// DOCUMENT for a GM to read - it was never a control surface, and the moment a second codebase
// treats it as one it becomes one.
//
// So the hub recomputes provenance from the node fields, mirroring `collectAttributions`
// (engine `src/lib/io/attributions.ts`). ATTRIBUTIONS.md is still shown to the reviewer - as THE
// CREATOR'S CLAIM, beside the image, which is exactly how design 6.4 frames it. A claim, never a
// fact. Design 6.4 already treats it that way for review; the gate must treat it the same.
// ============================================================================================
import { IMAGES_DIR, MODELS_DIR, PLAYER_IMAGES_DIR } from './contract';

export interface AttributionEntry {
  path: string;
  kind: 'model' | 'image';
  usedBy: string[];
  title?: string;
  credit?: string;
  license?: string;
  sourceUrl?: string;
}

/** Every node, with the name of the system holding it. Mirrors the engine's `nodesWithSystem`. */
export function* nodesWithSystem(doc: any): Generator<{ node: any; systemName: string }> {
  if (Array.isArray(doc?.nodes)) {
    for (const node of doc.nodes) yield { node, systemName: '' };
  }
  for (const entry of doc?.systems ?? []) {
    const systemName = String(entry?.name ?? entry?.system?.name ?? '');
    for (const node of entry?.system?.nodes ?? []) yield { node, systemName };
  }
}

const label = (node: any, systemName: string) => {
  const name = String(node?.name ?? node?.id ?? 'unnamed');
  return systemName ? `${name} (${systemName})` : name;
};

/**
 * What the bundle carries and what provenance the creator recorded for it.
 *
 * Mirrors the engine's `collectAttributions`, including its two subtleties:
 *  - one hull used by several ships is listed ONCE and credited once (models keyed by hash);
 *  - a remote http(s) image url is someone else's hosting and is not ours to credit, so only
 *    assets the bundle actually CARRIES are collected.
 */
export function collectAttributions(doc: any, modelMeta: Record<string, any> = {}): AttributionEntry[] {
  const models = new Map<string, AttributionEntry>();
  const images: AttributionEntry[] = [];

  for (const { node, systemName } of nodesWithSystem(doc)) {
    const who = label(node, systemName);

    const hash: unknown = node?.model?.hash;
    if (typeof hash === 'string' && hash) {
      const meta = { ...(node.model ?? {}), ...(modelMeta[hash] ?? {}) };
      const existing = models.get(hash);
      if (existing) {
        existing.usedBy.push(who);
      } else {
        models.set(hash, {
          path: `${MODELS_DIR}${hash}.glb`, kind: 'model', usedBy: [who],
          title: meta.title || meta.name, credit: meta.credit, license: meta.license, sourceUrl: meta.sourceUrl
        });
      }
    }

    const url: unknown = node?.image?.url;
    // NOTE the engine's trap: PLAYER_IMAGES_DIR starts with IMAGES_DIR, so player assets must be
    // excluded EXPLICITLY here rather than by luck.
    if (typeof url === 'string' && url.startsWith(IMAGES_DIR) && !url.startsWith(PLAYER_IMAGES_DIR)) {
      const img = node.image;
      images.push({
        path: url, kind: 'image', usedBy: [who],
        title: img.title, credit: img.credit, license: img.license, sourceUrl: img.sourceUrl
      });
    }
  }

  for (const a of doc?.playerAssets ?? []) {
    const url: unknown = a?.dataUrl;
    if (typeof url !== 'string' || !url.startsWith(PLAYER_IMAGES_DIR)) continue;
    images.push({
      path: url, kind: 'image', usedBy: [String(a?.name ?? a?.id ?? 'player asset')],
      title: a.name, credit: a.credit, license: a.license, sourceUrl: a.sourceUrl
    });
  }

  return [...models.values(), ...images];
}

/** Nothing recorded at all. Mirrors the engine's `isBlank`. */
export const noProvenance = (e: AttributionEntry) => !e.credit && !e.license && !e.sourceUrl;

/** CC-BY without a name: the one combination that is actively wrong, not merely unrecorded. */
export const breachesCcBy = (e: AttributionEntry) =>
  /cc[- ]?by/i.test(e.license ?? '') && !e.credit;

export interface ProvenanceVerdict {
  entries: AttributionEntry[];
  missing: AttributionEntry[];
  breaches: AttributionEntry[];
  /** THE PUBLIC-SHARING GATE (design 3.3). Computed here, from the doc. */
  mayPublish: boolean;
}

/**
 * The gate.
 *
 * `missing.length === 0` is the gate the design specifies and it is the DEFAULT. The CC-BY breach
 * is reported separately and gated by config, because blocking on it is STRICTER than the design
 * says and that is not a call to make quietly - see docs/decisions.md Q-02, which recommends
 * turning it on and asks. The engine calls a CC-BY breach "the one combination that is actively
 * wrong, not merely unrecorded", so there is a real argument for it; the argument is the owner's
 * to accept.
 */
export function checkProvenance(
  doc: any,
  modelMeta: Record<string, any> = {},
  opts: { blockCcByBreach?: boolean } = {}
): ProvenanceVerdict {
  const entries = collectAttributions(doc, modelMeta);
  const missing = entries.filter(noProvenance);
  const breaches = entries.filter(breachesCcBy);
  // A bundle carrying no uploaded assets at all has nothing to attribute and publishes freely -
  // which is also the shape the `zips_allowed: false` kill switch reduces everything to.
  const mayPublish = missing.length === 0 && (!opts.blockCcByBreach || breaches.length === 0);
  return { entries, missing, breaches, mayPublish };
}
