// REMOVE THE GM-ONLY CONTENT, on the creator's instruction.
//
// ============================================================================================
// THE ASYMMETRY THAT MAKES THIS DIFFERENT FROM DETECTION, and it is the whole reason this file
// is careful where `gmContent.ts` is relaxed:
//
//   DETECTION only has to be right when it says YES. A missed marker means a missing warning.
//   STRIPPING has to be right when it says ALL CLEAR. A missed marker means a PUBLISHED SECRET.
//
// So this does not trust itself. It strips, then re-runs the detector over its own output, and
// REFUSES if anything survived. The failure mode is "we could not clean this, re-export the player
// version" - never "we think it is clean".
//
// It is also deliberately blunt. Where the engine surgically removes a field, this removes the
// whole structure it lived in wherever that is safe: a slightly emptier map is a fine outcome, and
// a leaked GM note is not.
// ============================================================================================
//
// Mirrored from `computePlayerSnapshot` and `computePlayerStarmapSnapshot`
// (engine `src/lib/system/utils.ts`).
import { detectGmContent } from './gmContent';

export interface StripResult {
  ok: boolean;
  doc: any;
  /** What was taken out, in the creator's terms. */
  removed: string[];
  /** Set when the re-check found something the strip missed. The upload is then refused. */
  survived?: string[];
}

const UNDO_HISTORY_KEY = 'undoHistory';

export function stripGmContent(input: any): StripResult {
  // Not a document at all. It cannot carry GM content, and `ingest` has already refused anything
  // that is not parseable JSON long before this - but a stripper that throws is a stripper that
  // fails open somewhere upstream, so it is guarded here too.
  if (!input || typeof input !== 'object') return { ok: true, doc: input, removed: [] };

  // Never mutate the caller's document - it is also what gets hashed and stored.
  const doc = JSON.parse(JSON.stringify(input));
  const removed: string[] = [];
  let hiddenNodes = 0, notes = 0, secretTags = 0, anomalies = 0, hiddenDescriptions = 0;
  let droppedSystems = 0;

  const cleanSystem = (sys: any) => {
    if (!sys || !Array.isArray(sys.nodes)) return;

    // 1. Hidden nodes, and their whole subtree. A child of a hidden parent is hidden too, or the
    //    moon of a secret planet survives its parent.
    const hidden = new Set<string>();
    for (const n of sys.nodes) if (n?.object_playerhidden) hidden.add(String(n.id));

    const children = new Map<string, string[]>();
    for (const n of sys.nodes) {
      if (n?.parentId) {
        const list = children.get(String(n.parentId)) ?? [];
        list.push(String(n.id));
        children.set(String(n.parentId), list);
      }
    }
    const hideSubtree = (id: string) => {
      hidden.add(id);
      for (const c of children.get(id) ?? []) if (!hidden.has(c)) hideSubtree(c);
    };
    for (const id of [...hidden]) hideSubtree(id);

    hiddenNodes += hidden.size;
    sys.nodes = sys.nodes.filter((n: any) => !hidden.has(String(n?.id)));

    // 2. Everything else, per surviving node.
    for (const n of sys.nodes) {
      if (typeof n?.gmNotes === 'string' && n.gmNotes.trim()) { delete n.gmNotes; notes++; }
      else delete n.gmNotes;

      if (Array.isArray(n?.tags)) {
        const before = n.tags.length;
        n.tags = n.tags.filter((t: any) => !t?.secret);
        secretTags += before - n.tags.length;
      }

      if (n?.overrides?.anomalies) {
        delete n.overrides.anomalies;
        anomalies++;
        if (Object.keys(n.overrides).length === 0) delete n.overrides;
      }

      if (n?.description_playerhidden) {
        if (typeof n.description === 'string' && n.description.trim()) hiddenDescriptions++;
        delete n.description;
      }
    }

    delete sys.gmNotes;
    delete sys[UNDO_HISTORY_KEY];
  };

  // A single-system save.
  if (Array.isArray(doc?.nodes)) cleanSystem(doc);

  // A campaign. A system whose ROOT node is player-hidden is the GM's "hide this system" lever and
  // the whole system goes - mirroring computePlayerStarmapSnapshot.
  if (Array.isArray(doc?.systems)) {
    const keptIds = new Set<string>();
    doc.systems = doc.systems.filter((entry: any) => {
      const nodes = entry?.system?.nodes ?? [];
      const root = nodes.find((n: any) => n?.kind === 'barycenter' && !n?.parentId)
        ?? nodes.find((n: any) => !n?.parentId);
      if (root?.object_playerhidden) { droppedSystems++; return false; }
      keptIds.add(String(entry?.id));
      return true;
    });
    for (const entry of doc.systems) {
      cleanSystem(entry?.system);
      delete entry[UNDO_HISTORY_KEY];
    }
    // A route to a system that no longer exists would dangle. Drop those too.
    if (Array.isArray(doc.routes)) {
      doc.routes = doc.routes.filter(
        (r: any) => (!r?.fromId || keptIds.has(String(r.fromId))) && (!r?.toId || keptIds.has(String(r.toId)))
      );
    }
  }

  delete doc.gmNotes;
  delete doc[UNDO_HISTORY_KEY];

  if (droppedSystems) removed.push(`${droppedSystems} hidden system${droppedSystems === 1 ? '' : 's'}`);
  if (hiddenNodes) removed.push(`${hiddenNodes} hidden object${hiddenNodes === 1 ? '' : 's'}`);
  if (notes) removed.push(`GM notes from ${notes} object${notes === 1 ? '' : 's'}`);
  if (secretTags) removed.push(`${secretTags} secret tag${secretTags === 1 ? '' : 's'}`);
  if (anomalies) removed.push(`GM bookkeeping from ${anomalies} object${anomalies === 1 ? '' : 's'}`);
  if (hiddenDescriptions) removed.push(`${hiddenDescriptions} hidden description${hiddenDescriptions === 1 ? '' : 's'}`);

  // THE RE-CHECK. This is the point of the whole file: the stripper does not get to declare itself
  // successful. If the detector still finds anything, the upload is refused rather than published.
  const after = detectGmContent(doc);
  if (after.hasGmContent) return { ok: false, doc, removed, survived: after.summary };

  return { ok: true, doc, removed };
}
