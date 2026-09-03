// The CAPABILITY MARKER: which build of Star System Explorer made this map.
//
// ============================================================================================
// TWO VERSIONS, TWO JOBS. Do not conflate them.
//
//   bundleFormat   a CONTRACT number (format.ts). "Can this parser read this layout at all?"
//                  Bumped only on a breaking layout change. A number we do not understand is a
//                  refusal.
//
//   appVersion     a CAPABILITY MARKER (this file). "What could the app do when this was made?"
//                  NEVER a parse gate - a newer SSE loads an older map fine, and that is the whole
//                  point. It tells a reader which features to expect, and it lets us find every
//                  map made before some capability existed.
// ============================================================================================
//
// Mirrored from the engine's `src/lib/map/provenance.ts`. Two things that file tells us and that
// are easy to get wrong here:
//
//  1. `appVersion` is stamped on an EXPLICIT save only - the rail's Download and the Save modal -
//     and deliberately NOT on the IndexedDB autosave. An upload is an explicit save, so it should
//     normally be present; absent is legitimate for old files and is not an error.
//  2. `baseMapVersion` is NEVER invented. A map built from scratch has no base and carries none.
//     Absent is meaningful, so do not default it to anything.

export interface BundleProvenance {
  /** The engine build that wrote this save. Null when the file predates the stamp. */
  createdWith: string | null;
  /** Which edition of the bundled starter maps this campaign descends from, if any. */
  baseMapVersion: number | null;
  /**
   * The campaign's own save counter (engine R-12, v3.0.247): one higher on every explicit save.
   * Null for a single-system save - a system is a slice of a campaign and carries no counter of
   * its own - and for every file written before the counter existed. Null means "nothing to
   * compare", never zero.
   */
  revision: number | null;
  /**
   * The label the app wrote at export time (engine R-10). A LABEL, recorded and shown, and never
   * consulted as a gate: the hub reads the file itself to decide what it contains (gmContent.ts).
   */
  exportMode: 'gm' | 'player' | null;
}

export function readProvenance(doc: unknown): BundleProvenance {
  const d = doc as {
    appVersion?: unknown; baseMapVersion?: unknown; revision?: unknown; exportMode?: unknown
  } | null;

  const v = d?.appVersion;
  // Length-capped: it is displayed, and it arrives from a file a stranger wrote.
  const createdWith = typeof v === 'string' && v.length > 0 && v.length <= 40 ? v : null;

  const b = d?.baseMapVersion;
  const baseMapVersion = typeof b === 'number' && Number.isInteger(b) && b >= 0 ? b : null;

  const r = d?.revision;
  const revision = typeof r === 'number' && Number.isInteger(r) && r >= 0 ? r : null;

  const m = d?.exportMode;
  const exportMode = m === 'gm' || m === 'player' ? m : null;

  return { createdWith, baseMapVersion, revision, exportMode };
}
