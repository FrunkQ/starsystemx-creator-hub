// CORS for the public read endpoints.
//
// ============================================================================================
// WHY THIS EXISTS, and it was a real measured bug rather than a precaution. The SSE app fetches
// `GET /api/download/<slug>` CROSS-ORIGIN - from starsystemx.com, from beta., from a pages.dev
// verification build, and from localhost during development. Without these headers the browser
// refuses the response before the Worker's answer is ever read, so `?hub=<slug>` could not open a
// single map. The funnel's one-click promise was broken end to end.
//
// AND IT FAILED IN THE WORST AVAILABLE WAY: a CORS refusal is indistinguishable from being offline,
// so the app could not even tell the person what went wrong.
// ============================================================================================
//
// `*` IS THE RIGHT ANSWER HERE, not a shortcut. These endpoints are public, need no account, and
// are read by anyone who wants them - the download is deliberately uncredentialed, which is the
// entire point of "one click, no account needed". There is no cookie to leak because there is no
// cookie: the app sends `credentials: 'omit'`, and `*` cannot be combined with credentials anyway,
// so the wildcard actively FORBIDS the case that would be dangerous.
//
// NEVER put these on an endpoint that reads `locals.viewer`. Upload, review, admin and the private
// asset route are all same-origin-only, and must stay that way.

export const PUBLIC_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
};

/** Merge CORS onto a header set. */
export const withCors = (headers: Record<string, string> = {}) => ({ ...headers, ...PUBLIC_CORS });

/**
 * The preflight answer. A browser sends OPTIONS before a cross-origin request it considers
 * non-simple, and a 404 there fails the real request just as surely as a missing header would.
 */
export const preflight = () => new Response(null, { status: 204, headers: PUBLIC_CORS });
