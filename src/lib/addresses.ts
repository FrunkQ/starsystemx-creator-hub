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

/** R-13: what the engine says it ships. Overridden by `sse_manifest_url`. */
export const DEFAULT_SSE_MANIFEST_URL = SSE_ORIGIN + '/shipped-content.json';

/** An address a link may be built from. `"off"` in a config row is therefore a working off switch. */
export const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/./.test(value.trim());
