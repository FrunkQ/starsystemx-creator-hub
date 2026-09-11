// EVERY ADDRESS THE HUB KNOWS, in one file.
//
// ============================================================================================
// The owner, 2026-09-06: *"URL is actually https://starsystemx-creator-hub.orange-tree-847c.workers.dev/
// at the moment - have it a base config item - so its easy to change later - work off a variable
// just now so we can test."*
//
// So: these are the DEFAULTS, and a config row overrides each one. Changing where the hub lives, or
// pointing it at a released production engine, is one row on the Gates page - or, before anybody has
// set a row, one line here. Nothing else in the codebase should contain an address (the engine keeps
// the same rule on its side, in `src/lib/hub/hubConfig.ts`).
//
// WHY A DEFAULT AT ALL, when `loadSite` used to fall back to the request's own origin: because the
// hub EMBEDS its address in links other software fetches - the download URL inside an "Open in SSE"
// link, the Open Graph tags, the QR code on a generated cover. The request origin is right for the
// page being served and wrong for a link that outlives it, and the engine's allow-list only accepts
// hosts it has been told about. A named default is a thing you can check; an origin is whatever the
// visitor typed.
//
// THE DNS MOVED, 2026-09-06 (owner: "all dns setup right - https://explorers.starsystemx.com/
// works for you now"), AND THIS IS WHY THE FILE EXISTS. For a day this was a trap written in
// capitals here: `explorers.starsystemx.com` answered 404 from Vercel while the workers.dev origin
// served the hub, so anything built from the agreed name would have failed for every visitor. The
// cutover cost ONE LINE - the constant below - because no other file in the hub holds an address.
//
// Measured after the change: `explorers.starsystemx.com` answers 200 with `x-hub-version: 0.23.1`,
// and `/api/download/<slug>` answers 200 with `access-control-allow-origin: *`. The workers.dev
// origin still answers and is still on the engine's allow-list, so links already posted to a
// Discord keep working; nothing has to be rewritten and no engine release was needed.
// ============================================================================================

/**
 * Where the hub answers, and the name it puts in every link it embeds. Overridden by the `site_url`
 * config row. The workers.dev origin below still serves the hub and is kept only as evidence of
 * that - point nothing at it.
 */
export const HUB_ORIGIN = 'https://explorers.starsystemx.com';

/** The origin the hub was born on. Still answering; no longer the address it gives out. */
export const HUB_WORKERS_ORIGIN = 'https://starsystemx-creator-hub.orange-tree-847c.workers.dev';

/**
 * The engine, beta and production.
 *
 * THE PROD RULE, stated once (SEAM PROTOCOL, D-37): production is a read-tree release of beta on the
 * owner's explicit word. Nothing here points the hub at production for a feature until he has said
 * the release is made - a button that sends people to a build without the feature is worse than no
 * button. R-13 and R-17 are on BETA ONLY as of 2026-09-06.
 */
export const SSE_BETA_ORIGIN = 'https://beta.starsystemx.com';
export const SSE_PROD_ORIGIN = 'https://starsystemx.com';

/** Which engine the hub talks to today. One edit here moves both defaults below to production. */
export const SSE_ORIGIN = SSE_BETA_ORIGIN;

/** R-17: what the percent-encoded download URL is appended to. Overridden by `open_in_sse_url`. */
export const DEFAULT_OPEN_IN_SSE_URL = SSE_ORIGIN + '/?open=';

/**
 * R-18: the same, for a SINGLE SYSTEM - "Add System to SSE" (D-92). Overridden by
 * `add_system_in_sse_url`. BETA BY NAME, not `SSE_ORIGIN`: production (v3.1.48) still refuses a
 * single system, so moving the campaign default to production must not move this one with it. It
 * moves when the owner releases R-18 and sets the row.
 */
export const DEFAULT_ADD_SYSTEM_IN_SSE_URL = SSE_BETA_ORIGIN + '/?open=';

/** R-13: what the engine says it ships. Overridden by `sse_manifest_url`. */
export const DEFAULT_SSE_MANIFEST_URL = SSE_ORIGIN + '/shipped-content.json';

/**
 * WHO THE HUB SENDS AS (D-50). Overridden by the `mail_from` row.
 *
 * It has to be on the domain verified with Resend, which is `starsystemx.com` - NOT the hostname
 * the hub is served from, because a verified domain does not carry its subdomains. That is the one
 * fact this default encodes, and it is why the default is a guess worth making: a wrong sender is
 * refused loudly by the mail service and reported on the button, where a missing one was a row the
 * owner had to be told to fill.
 */
export const MAIL_DOMAIN = 'starsystemx.com';

/**
 * `keeper@`, the owner's choice (2026-09-06: *"keeper@starsystemx.com is the mail... from the
 * site - you started it!"*) - and he is right that it came from here. **Keeper** is the hub's own
 * badge for the person running the place: *"Keeps the lights on and the celestial bodies
 * clothed."* The site had already named the role; the mailbox may as well use its name.
 *
 * THIS IS ALSO THE ADDRESS THE TAKEDOWN PAGE GIVES OUT, as of 2026-09-07 - the owner: *"we should
 * go to keeper@starsystemx.com (it gets to the same place)."* It used to be a personal address
 * written into `TakedownAddress.svelte` as a second copy, which is exactly how it came to be wrong:
 * the hub's mail moved and the one page carrying a legal address did not move with it.
 *
 * (An earlier note here said nothing arrives at this address. That was true when the Resend domain
 * was send-only and it is no longer the owner's arrangement - a stale comment about where copyright
 * claims go is worse than no comment, so it is corrected rather than left.)
 */
export const DEFAULT_MAIL_FROM = 'keeper@' + MAIL_DOMAIN;

/**
 * THE ADDRESS ON THE TAKEDOWN PAGE (D-16, corrected 2026-09-07). One source of truth with the
 * sender above, because two copies of an address is the bug this replaces.
 *
 * ASSEMBLED, NEVER WRITTEN WHOLE. D-16's rule is that the address must not appear as text in
 * anything the hub serves, and the page still reveals it only on a click - so it is never in the
 * HTML at all. This keeps the other half true as well: the JavaScript bundle contains `keeper@` and
 * `starsystemx.com` as separate strings, and the pattern a harvester looks for matches neither.
 *
 * Be honest about the limit, as the component always has been: this defeats crawlers that regex
 * page source, which is the actual volume threat. It does not defeat a person who runs the script
 * and looks, and nothing rendered client-side ever could.
 */
export const TAKEDOWN_ADDRESS = 'keeper' + '@' + MAIL_DOMAIN;

/** An address a link may be built from. `"off"` in a config row is therefore a working off switch. */
export const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/./.test(value.trim());
