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
// THE TRAP THIS FILE EXISTS TO KEEP OUT OF THE CODE, measured 2026-09-06 and confirmed by the
// engine's own status report: `explorers.starsystemx.com` DOES NOT REACH THE HUB. It answers 404
// from Vercel (`X-Vercel-Error: DEPLOYMENT_NOT_FOUND`) while the workers.dev origin answers 200.
// It is the agreed final name and it is already on the engine's allow-list, so the day the DNS
// moves, this constant changes (or the `site_url` row is set) and nothing else does.
// ============================================================================================

/** Where the hub actually answers. Overridden by the `site_url` config row. */
export const HUB_ORIGIN = 'https://starsystemx-creator-hub.orange-tree-847c.workers.dev';

/** The agreed final name. NOT yet serving the hub - do not point anything at it until it does. */
export const HUB_FINAL_ORIGIN = 'https://explorers.starsystemx.com';

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

/** R-13: what the engine says it ships. Overridden by `sse_manifest_url`. */
export const DEFAULT_SSE_MANIFEST_URL = SSE_ORIGIN + '/shipped-content.json';

/** An address a link may be built from. `"off"` in a config row is therefore a working off switch. */
export const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/./.test(value.trim());
