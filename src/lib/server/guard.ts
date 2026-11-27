// THE FLOOD GUARD (D-95): what stops a crawler from spending the whole Cloudflare account.
//
// ============================================================================================
// WHAT HAPPENED (owner, 2026-11-21): about 160,000 requests in a day, from firms in the US and
// China, for a dozen of the hub's files. Workers' free plan allows 100,000 requests a DAY for the
// WHOLE ACCOUNT, so the flood on the hub took every Worker the owner runs down with it.
//
// WHAT THIS FILE CAN AND CANNOT DO, stated plainly because it is easy to believe otherwise:
//
//   - Every request that reaches this code has ALREADY been counted against the Workers limit.
//     Nothing written in the Worker reduces that count. Only Cloudflare's own rules in the
//     dashboard (bot blocking, WAF rules, rate limiting) stop a request before it is counted, and
//     the docs/flood-protection.md checklist says which ones to switch on.
//   - What this file DOES do is make each counted request cheap: a known scraper gets a 403
//     before any database or bucket is touched, a single address that hammers gets a 429, and a
//     signed-out visitor asking for something public gets the edge's copy instead of a fresh read
//     of Supabase and R2. That protects the Supabase and R2 allowances, and keeps the hub up for
//     people while a crawl is going on.
// ============================================================================================

/**
 * Crawlers that collect pages for AI training or bulk SEO data, and bare HTTP libraries. They are
 * also named in robots.txt; this is for the ones that read robots.txt and fetch anyway.
 *
 * NOT here, on purpose: search engines (Googlebot, Bingbot, DuckDuckBot), link previews
 * (Discordbot, Slackbot, Twitterbot, facebookexternalhit, which make the share cards work), and
 * curl (how a deploy is checked, by its `x-hub-version` header). The SSE app runs in a browser and sends a
 * browser's agent, so nothing here can catch it.
 */
const SCRAPER = new RegExp([
  'GPTBot', 'OAI-SearchBot', 'CCBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Bytespider',
  'Amazonbot', 'meta-externalagent', 'meta-externalfetcher', 'FacebookBot', 'PerplexityBot',
  'cohere-ai', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'omgili', 'YouBot', 'Timpibot', 'img2dataset',
  'PetalBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'DataForSeoBot', 'BLEXBot',
  'Barkrowler', 'serpstatbot', 'Sogou', 'YisouSpider', '360Spider', 'Baiduspider',
  'python-requests', 'python-urllib', 'aiohttp', 'httpx', 'Scrapy', 'Go-http-client',
  'okhttp', 'node-fetch', 'axios', 'libwww-perl', 'Java/'
].map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'i');

/** True when the agent is one this hub refuses outright. An empty agent is refused too. */
export function isScraper(userAgent: string | null): boolean {
  const ua = (userAgent ?? '').trim();
  if (!ua) return true;
  return SCRAPER.test(ua);
}

/**
 * Cloudflare's rate limiting binding (wrangler.toml `[[ratelimits]]`). Optional: a build without
 * it, local dev and tests just skip the check.
 */
export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** False when this address has gone over its allowance. Never throws: a broken limiter lets people in. */
export async function withinLimit(limiter: RateLimiter | undefined, ip: string | null): Promise<boolean> {
  if (!limiter || !ip) return true;
  try {
    return (await limiter.limit({ key: ip })).success;
  } catch {
    return true;
  }
}

// ============================================================================================
// THE EDGE COPY. A signed-out GET of a public thing is answered from Cloudflare's cache in this
// data centre when it can be, so a crawler asking for the same dozen files 160,000 times reads
// Supabase and R2 a few hundred times instead.
//
// ONLY WHEN NOBODY IS SIGNED IN: no Authorization header and neither session cookie. The pages say
// `public, max-age=60` to signed-in browsers too (their own cache, their own page), but a signed-in
// page carries that person's name and buttons and must never be handed to anyone else.
//
// ONLY WHAT THE ROUTE ALREADY CALLS PUBLIC: the response's own Cache-Control decides, so a route
// that says `no-store` (downloads, a held map's notice) is never stored. A response that sets a
// cookie is never stored either.
//
// HOW LONG. The route's own max-age, but never more than EDGE_MAX_S. Assets say a year (their
// bytes can never change), but a ban must still reach new visitors (design 6.2), so the edge keeps
// an asset ten minutes at most: a ban takes up to ten minutes to reach every visitor, instead of
// the next request. A visitor's own browser could already keep it a year; that was accepted then.
// ============================================================================================

export const EDGE_MAX_S = 600;

const SESSION_COOKIE = /(?:^|;\s*)sb-(?:access|refresh)-token=/;

/** Whether this request may be answered from, and stored in, the shared edge cache. */
export function edgeCacheable(request: Request, pathname: string): boolean {
  if (request.method !== 'GET') return false;
  if (request.headers.has('authorization')) return false;
  if (SESSION_COOKIE.test(request.headers.get('cookie') ?? '')) return false;
  // Never the private, account, admin, manage or upload side, whatever a response says.
  if (/^\/(admin|api\/admin|private|manage|account|upload|login|logout|join|reset|link|debug|api\/debug|api\/device|api\/link|api\/upload|api\/review|api\/webhooks)(\/|$)/.test(pathname)) return false;
  return true;
}

/** The seconds the edge may keep this response, or 0 for not at all. */
export function edgeSeconds(response: Response): number {
  if (response.status !== 200) return 0;
  if (response.headers.has('set-cookie')) return 0;
  const cc = (response.headers.get('cache-control') ?? '').toLowerCase();
  if (!/\bpublic\b/.test(cc) || /\b(no-store|no-cache|private)\b/.test(cc)) return 0;
  const m = /\bmax-age=(\d+)/.exec(cc);
  const age = m ? Number(m[1]) : 0;
  return Math.max(0, Math.min(EDGE_MAX_S, age));
}

/**
 * THE EDGE COPY'S KEY CARRIES THE BUILD (27 Nov 2026). Keyed on the bare URL, a copy written by one
 * build was served after the next deploy, and its HTML named script chunks the new build no longer
 * had, so `/shelves` turned into the error page for signed-out visitors. With the build in the key a
 * deploy starts a fresh set of copies and the old ones simply age out unread.
 */
export function edgeKey(request: Request, build: string): Request {
  const url = new URL(request.url);
  url.searchParams.set('__hub', build);
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * NO ZONE CACHE FOR PAGES. The Worker keeps its own, versioned copy (above); a second copy in the
 * zone's cache, under a Cache Rule's own lifetime, is the one that outlived a deploy by hours. This
 * header asks Cloudflare's cache in front of the Worker not to keep the HTML. A Cache Rule set to
 * override the origin's lifetime still wins over it, so that rule has to be checked too.
 */
export const ZONE_NO_STORE: [string, string] = ['cloudflare-cdn-cache-control', 'no-store'];

/** The copy that goes into the edge cache: same body and headers, the edge's own lifetime. */
export function forEdge(response: Response, seconds: number): Response {
  const headers = new Headers(response.headers);
  headers.delete(ZONE_NO_STORE[0]);
  // The Cache API reads `cache-control` for the lifetime of what it stores; `s-maxage` wins over
  // `max-age` there, so the browser-facing max-age (a year, for an asset) is left as it was.
  const cc = headers.get('cache-control') ?? 'public';
  headers.set('cache-control', cc.replace(/,?\s*s-maxage=\d+/i, '') + ', s-maxage=' + seconds);
  return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
}
