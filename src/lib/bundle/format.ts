// The format gate. Refuse politely; never guess.
//
// Design 4.3: "this bundle was made with a newer SSE; update the hub" - rather than parsing
// something it does not understand into a public database.
import { KNOWN_BUNDLE_FORMATS } from './contract';

export type FormatVerdict =
  | { ok: true; format: number }
  | { ok: false; code: 'no-parser-yet' | 'unstamped' | 'too-new' | 'unknown'; message: string; format: number | null };

export interface FormatGateOptions {
  /** config: accept_unstamped_bundles. See docs/decisions.md Q-01 - an OPEN question for the owner. */
  acceptUnstamped: boolean;
  /** config: the integer this deploy treats an unstamped bundle as, when accepting them at all. */
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
    return gateAgainstKnown(opts.unstampedAs);
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return {
      ok: false, code: 'unknown', format: null,
      message: 'This save records a bundle format the hub cannot read. It may be damaged.'
    };
  }

  return gateAgainstKnown(raw);
}

function gateAgainstKnown(format: number): FormatVerdict {
  if (KNOWN_BUNDLE_FORMATS.length === 0) {
    return {
      ok: false, code: 'no-parser-yet', format,
      message:
        'Uploads are not open yet. The hub has not been given a reference save to test its reader ' +
        'against, and it will not read a format it has never seen into a public library.'
    };
  }
  if (KNOWN_BUNDLE_FORMATS.includes(format)) return { ok: true, format };

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
