// The format gate. Refuse politely; never guess.
//
// Design 4.3: "this bundle was made with a newer SSE; update the hub" - rather than parsing
// something it does not understand into a public database.
import { KNOWN_BUNDLE_FORMATS } from './contract';

export type FormatVerdict =
  | { ok: true; format: number; legacyStamped: boolean }
  | { ok: false; code: 'no-parser-yet' | 'unstamped' | 'too-new' | 'unknown'; message: string; format: number | null };

export interface FormatGateOptions {
  /**
   * config: accept_unstamped_bundles. ANSWERED by the owner 2026-08-28 - true. Saves made before
   * the engine stamped anything are accepted as LEGACY and base-stamped by the hub.
   */
  acceptUnstamped: boolean;
  /** config: legacy_bundle_format - what an unstamped save is base-stamped as. */
  unstampedAs: number;
}

/**
 * Read the format integer off a parsed document and decide whether this deploy understands it.
 *
 * The doc is user-supplied, so `bundleFormat` is a claim like anything else - but it is a claim
 * that can only make us MORE cautious (a wrong high number is refused, a wrong low number is
 * checked against the fixture-verified parser), which is why it is safe to trust this far.
 */
export function checkBundleFormat(doc: unknown, opts: FormatGateOptions): FormatVerdict {
  const raw = (doc as { bundleFormat?: unknown } | null)?.bundleFormat;

  if (raw === undefined || raw === null) {
    if (!opts.acceptUnstamped) {
      return {
        ok: false, code: 'unstamped', format: null,
        message:
          'This save does not record which bundle format it uses. It was probably made with a ' +
          'version of Star System Explorer from before the hub existed. Re-save it in a current ' +
          'version and upload again.'
      };
    }
    // LEGACY BASE-STAMPING. The pre-stamp layout is known and stable, so an unstamped save is
    // treated as the legacy format rather than refused - refusing it would close the hub to every
    // save anyone currently has. Flagged so the assumption stays visible in the database rather
    // than becoming invisible the moment it is made.
    return gateAgainstKnown(opts.unstampedAs, true);
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return {
      ok: false, code: 'unknown', format: null,
      message: 'This save records a bundle format the hub cannot read. It may be damaged.'
    };
  }

  // A save that carries its own stamp is never restamped.
  return gateAgainstKnown(raw, false);
}

function gateAgainstKnown(format: number, legacyStamped: boolean): FormatVerdict {
  if (KNOWN_BUNDLE_FORMATS.length === 0) {
    return {
      ok: false, code: 'no-parser-yet', format,
      message:
        'Uploads are not open yet. The hub has not been given a reference save to test its reader ' +
        'against, and it will not read a format it has never seen into a public library.'
    };
  }
  if (KNOWN_BUNDLE_FORMATS.includes(format)) return { ok: true, format, legacyStamped };

  const newest = Math.max(...KNOWN_BUNDLE_FORMATS);
  if (format > newest) {
    return {
      ok: false, code: 'too-new', format,
      message:
        'This save was made with a newer Star System Explorer than the hub understands. ' +
        'The hub will be updated shortly - please try again in a day or two.'
    };
  }
  return {
    ok: false, code: 'unknown', format,
    message: 'The hub no longer reads saves in this format. Re-save it in a current version of Star System Explorer.'
  };
}
