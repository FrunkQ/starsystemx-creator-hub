// DOES THIS SAVE CONTAIN GM-ONLY CONTENT? Read from the file, never asked of the uploader.
//
// ============================================================================================
// WHY THIS REPLACED A RADIO BUTTON. The GM/Player choice is made in Star System Explorer at
// EXPORT time, so by the time a file reaches the hub the answer is already a property of the
// bytes. Asking the uploader again was asking them to restate a fact they could get wrong - and
// the wrong answer is the one that leaks somebody's campaign secrets.
//
// THE INFERENCE IS ASYMMETRIC, AND THAT IS THE WHOLE DESIGN:
//
//   markers present  -> DEFINITELY a GM tree. Certain, because `computePlayerSnapshot` removes
//                       every one of them.
//   markers absent   -> a player export, OR a GM export of a campaign with no secrets in it.
//                       Genuinely indistinguishable - and it does not matter, because a GM tree
//                       with nothing hidden in it has nothing to leak.
//
// So the hub does not try to recover the export MODE. It answers the question that actually
// protects someone: is there anything in here they would not want published? Which means the
// warning is rare, specific and worth reading, instead of a checkbox everybody clicks past.
// ============================================================================================
//
// Every marker below is mirrored from the engine's `computePlayerSnapshot`
// (`src/lib/system/utils.ts`) and `redactTagsForPlayers` (`src/lib/tags/tagLifecycle.ts`).
import { nodesWithSystem } from './attribution';

export interface GmFinding {
  kind: 'gmNotes' | 'hiddenNode' | 'secretTag' | 'anomalyOverride' | 'hiddenDescription' | 'undoHistory';
  /** How many nodes carry it. Counted so the warning can be specific rather than vague. */
  count: number;
  /** A few example names, for a warning a person can act on. */
  examples: string[];
}

export interface GmContentReport {
  /** True when the save definitely carries GM-only content. */
  hasGmContent: boolean;
  findings: GmFinding[];
  /** One line per finding, ready to show. */
  summary: string[];
}

const LABEL: Record<GmFinding['kind'], (n: number) => string> = {
  gmNotes: (n) => `GM notes on ${n} ${n === 1 ? 'object' : 'objects'}`,
  hiddenNode: (n) => `${n} ${n === 1 ? 'object that is' : 'objects that are'} hidden from players`,
  secretTag: (n) => `secret tags on ${n} ${n === 1 ? 'object' : 'objects'}`,
  anomalyOverride: (n) => `GM bookkeeping (anomaly reasons) on ${n} ${n === 1 ? 'object' : 'objects'}`,
  hiddenDescription: (n) => `${n} ${n === 1 ? 'description' : 'descriptions'} marked hidden from players`,
  undoHistory: () =>
    'an undo history, which records what was changed and deleted while building the map'
};

export function detectGmContent(doc: any): GmContentReport {
  const hits = new Map<GmFinding['kind'], { count: number; examples: string[] }>();

  const note = (kind: GmFinding['kind'], name: string) => {
    const e = hits.get(kind) ?? { count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3 && name) e.examples.push(name);
    hits.set(kind, e);
  };

  // Map-level and system-level GM notes. `computePlayerSnapshot` deletes both.
  if (nonEmpty(doc?.gmNotes)) note('gmNotes', 'the map itself');
  for (const entry of doc?.systems ?? []) {
    if (nonEmpty(entry?.system?.gmNotes)) note('gmNotes', String(entry?.name ?? 'a system'));
  }

  // THE UNDO HISTORY. `UNDO_HISTORY_KEY` is 'undoHistory' and the engine strips it on EVERY
  // outbound path - export, single-system save, and the player snapshot alike - because it records
  // what a GM changed and deliberately DELETED: a name they redacted, a secret they thought better
  // of.
  //
  // So its presence does not distinguish a GM export from a player one. It means the file never
  // went through a normal export at all - a raw autosave, or something hand-assembled. Worth
  // flagging on its own terms: the engine's own note says to treat it exactly as `gmNotes`.
  if (hasUndoHistory(doc)) note('undoHistory', '');
  for (const entry of doc?.systems ?? []) {
    if (hasUndoHistory(entry) || hasUndoHistory(entry?.system)) note('undoHistory', '');
  }

  for (const { node, systemName } of nodesWithSystem(doc)) {
    const name = String(node?.name ?? node?.id ?? 'unnamed') + (systemName ? ` (${systemName})` : '');

    if (nonEmpty(node?.gmNotes)) note('gmNotes', name);

    // A player snapshot DELETES hidden nodes outright, so seeing the flag at all is conclusive.
    if (node?.object_playerhidden) note('hiddenNode', name);

    // `redactTagsForPlayers` drops any tag marked secret. One surviving here is conclusive.
    // (Player-hidden CATEGORIES are also redacted there, but that needs the GM's category config,
    // which does not travel - so it is deliberately not checked. Missing a marker is safe; the
    // report only ever needs to be right when it says YES.)
    if (Array.isArray(node?.tags) && node.tags.some((t: any) => t?.secret)) note('secretTag', name);

    // The map from an override to its stated reason is GM bookkeeping and never travels (G37).
    if (node?.overrides?.anomalies) note('anomalyOverride', name);

    // The FLAG survives redaction; the description does not. So the flag alone proves nothing -
    // only the flag WITH the text still attached does.
    if (node?.description_playerhidden && nonEmpty(node?.description)) note('hiddenDescription', name);
  }

  const findings: GmFinding[] = [...hits.entries()].map(([kind, v]) => ({ kind, ...v }));
  return {
    hasGmContent: findings.length > 0,
    findings,
    summary: findings.map((f) => LABEL[f.kind](f.count))
  };
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/**
 * The engine allows exactly one spelling: `UNDO_HISTORY_KEY = 'undoHistory'`, and its own comment
 * says "nothing else may spell it". Mirrored here as a single literal for the same reason.
 */
const UNDO_HISTORY_KEY = 'undoHistory';

function hasUndoHistory(o: any): boolean {
  if (!o || typeof o !== 'object') return false;
  const h = o[UNDO_HISTORY_KEY];
  return Array.isArray(h) ? h.length > 0 : h != null;
}
