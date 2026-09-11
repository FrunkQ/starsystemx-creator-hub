// "Open in Star System Explorer" and "Add System to SSE" (D-35, D-92; engine R-17, R-18): an engine
// URL prefix from config with the map's download URL appended, percent-encoded. Pure, and used on
// both sides: the pages, the cards and the app's list.
//
// ============================================================================================
// TWO BUTTONS, TWO PREFIXES, because they are two promises kept by two different builds.
//
//   a CAMPAIGN   "Open in Star System Explorer"  `open_in_sse_url`       opens it
//   a SYSTEM     "Add System to SSE"             `add_system_in_sse_url`  offers to place it
//
// Until R-18 a system got no link at all, and that was right: the engine refused one through
// `?open=` ("That link points at a single system rather than a campaign"), and a button that
// cannot keep its promise should not be offered. The engine's beta now takes a single system and
// asks the GM where to put it - so it is not "opened", it is ADDED, and the owner named the button
// for what it does: "instead of it saying 'Open Map in SSE' - it would be 'Add System to SSE'".
//
// SEPARATE PREFIXES because production (v3.1.48) still refuses a system while it opens campaigns:
// pointing both at one host would either break the campaign button or show every visitor the old
// refusal. The system prefix stays on beta until the owner releases R-18 and sets the row.
// ============================================================================================
import { isHttpUrl } from './addresses';

export interface SsePrefixes {
  /** Where a campaign opens: `open_in_sse_url`. */
  open: string | null | undefined;
  /** Where a single system is added: `add_system_in_sse_url`. */
  addSystem: string | null | undefined;
}

export interface SseLink {
  href: string;
  /** The words on the button, in full. */
  label: string;
  /** For a card, where the full words will not fit. */
  short: string;
  /** What it does, for a title attribute. */
  title: string;
}

/**
 * The link for this map, or null. `kind` is REQUIRED, and an unknown kind gets nothing: a caller who
 * cannot say what the map is cannot be promised the app will take it.
 */
export function sseLink(prefixes: SsePrefixes, siteUrl: string, slug: string, kind: string | null | undefined): SseLink | null {
  const download = encodeURIComponent(siteUrl + '/api/download/' + slug);
  // Not an address, no link: that is what makes "off" in a config row a working off switch, and the
  // guard against a half-typed row shipping a link to nowhere.
  if (kind === 'starmap' && isHttpUrl(prefixes.open)) {
    return {
      href: prefixes.open.trim() + download,
      label: 'Open in Star System Explorer',
      short: 'Open in SSE',
      title: 'Open this map in Star System Explorer, in a new tab'
    };
  }
  if (kind === 'system' && isHttpUrl(prefixes.addSystem)) {
    return {
      href: prefixes.addSystem.trim() + download,
      label: 'Add System to SSE',
      short: 'Add System to SSE',
      title: 'Add this system to a campaign in Star System Explorer, in a new tab'
    };
  }
  return null;
}

/** Just the address, for the app's list (`openUrl`). */
export const openLink = (prefixes: SsePrefixes, siteUrl: string, slug: string, kind: string | null | undefined): string | null =>
  sseLink(prefixes, siteUrl, slug, kind)?.href ?? null;

/** No prefixes at all: a page that could not read its config offers no link rather than a wrong one. */
export const NO_PREFIXES: SsePrefixes = { open: null, addSystem: null };

/** The two prefixes, from the gates. One place, so no caller can pass the campaign prefix for a system. */
export const ssePrefixes = (gates: { open_in_sse_url: string; add_system_in_sse_url: string }): SsePrefixes =>
  ({ open: gates.open_in_sse_url, addSystem: gates.add_system_in_sse_url });
