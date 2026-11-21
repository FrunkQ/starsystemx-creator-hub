// THE FLOOD GUARD (D-95). 160,000 requests in a day for a dozen files took the owner's whole
// Cloudflare account down; these pin what the Worker does about it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isScraper, withinLimit, edgeCacheable, edgeSeconds, forEdge, EDGE_MAX_S } from '../src/lib/server/guard';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const req = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request('https://explorers.starsystemx.com' + path, { method, headers });
const res = (cc: string | null, status = 200, extra: Record<string, string> = {}) =>
  new Response('x', { status, headers: { ...(cc ? { 'cache-control': cc } : {}), ...extra } });

describe('scrapers', () => {
  it('refuses AI and bulk crawlers, bare HTTP libraries and an empty agent', () => {
    for (const ua of ['Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
      'CCBot/2.0 (https://commoncrawl.org/faq/)', 'python-requests/2.32.3', 'Go-http-client/1.1', '', '  '])
      expect(isScraper(ua), ua).toBe(true);
    expect(isScraper(null)).toBe(true);
  });

  it('lets people, search engines, link previews and curl in', () => {
    for (const ua of [CHROME, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'facebookexternalhit/1.1', 'curl/8.5.0'])
      expect(isScraper(ua), ua).toBe(false);
  });

  it('is skipped for the Worker\'s own clock calls, which carry no address and no agent', () => {
    const hook = readFileSync('src/hooks.server.ts', 'utf8');
    expect(hook).toContain(": event.request.headers.get('cf-connecting-ip');");
    expect(hook.indexOf('if (ip) {')).toBeLessThan(hook.indexOf('isScraper('));
  });
});

describe('webhooks', () => {
  it('are never refused as scrapers or rate limited, whatever agent the sender uses', () => {
    const hook = readFileSync('src/hooks.server.ts', 'utf8');
    expect(hook).toContain("const ip = event.url.pathname.startsWith('/api/webhooks/')\n    ? null");
    expect(readFileSync('docs/flood-protection.md', 'utf8')).toContain('not starts_with(http.request.uri.path, "/api/webhooks/")');
  });
});

describe('rate limit', () => {
  it('passes when there is no limiter, no address, or the limiter breaks', async () => {
    expect(await withinLimit(undefined, '1.2.3.4')).toBe(true);
    expect(await withinLimit({ limit: async () => ({ success: false }) }, null)).toBe(true);
    expect(await withinLimit({ limit: async () => { throw new Error('down'); } }, '1.2.3.4')).toBe(true);
  });
  it('refuses when the limiter says so, keyed on the address', async () => {
    let key = '';
    expect(await withinLimit({ limit: async (o) => { key = o.key; return { success: false }; } }, '1.2.3.4')).toBe(false);
    expect(key).toBe('1.2.3.4');
  });
  it('is bound in wrangler.toml under the name the hook reads', () => {
    expect(readFileSync('wrangler.toml', 'utf8')).toMatch(/\[\[ratelimits\]\]\s*\nname = "PUBLIC_LIMIT"/);
  });
});

describe('the edge copy', () => {
  it('only for a signed-out GET', () => {
    expect(edgeCacheable(req('/s/sol'), '/s/sol')).toBe(true);
    expect(edgeCacheable(req('/s/sol', { cookie: 'theme=dark' }), '/s/sol')).toBe(true);
    expect(edgeCacheable(req('/s/sol', { cookie: 'theme=dark; sb-access-token=abc' }), '/s/sol')).toBe(false);
    expect(edgeCacheable(req('/s/sol', { cookie: 'sb-refresh-token=abc' }), '/s/sol')).toBe(false);
    expect(edgeCacheable(req('/api/maps', { authorization: 'Bearer x' }), '/api/maps')).toBe(false);
    expect(edgeCacheable(req('/s/sol', {}, 'POST'), '/s/sol')).toBe(false);
  });
  it('never for the private or account side', () => {
    for (const p of ['/admin/review', '/private/asset/ab', '/manage/1', '/account', '/api/upload', '/api/admin/backup', '/api/device/poll'])
      expect(edgeCacheable(req(p), p), p).toBe(false);
  });
  it('only what the route calls public, capped so a ban still lands', () => {
    expect(edgeSeconds(res('public, max-age=60'))).toBe(60);
    expect(edgeSeconds(res('public, max-age=31536000, immutable'))).toBe(EDGE_MAX_S);
    expect(EDGE_MAX_S).toBeLessThanOrEqual(600);
    expect(edgeSeconds(res('no-store'))).toBe(0);
    expect(edgeSeconds(res('private, max-age=60'))).toBe(0);
    expect(edgeSeconds(res(null))).toBe(0);
    expect(edgeSeconds(res('public, max-age=60', 404))).toBe(0);
    expect(edgeSeconds(res('public, max-age=60', 200, { 'set-cookie': 'a=b' }))).toBe(0);
  });
  it('the stored copy carries the edge lifetime and leaves the browser\'s alone', () => {
    const c = forEdge(res('public, max-age=31536000, immutable'), 600);
    expect(c.headers.get('cache-control')).toBe('public, max-age=31536000, immutable, s-maxage=600');
  });
  it('downloads stay uncached', () => {
    expect(readFileSync('src/routes/api/download/[slug]/+server.ts', 'utf8')).toContain("'cache-control': 'no-store'");
  });
});

describe('robots.txt', () => {
  it('turns AI crawlers away whole and keeps crawlers off the assets', () => {
    const r = readFileSync('src/routes/robots.txt/+server.ts', 'utf8');
    for (const bot of ["'GPTBot'", "'CCBot'", "'Bytespider'", "'Google-Extended'"]) expect(r).toContain(bot);
    expect(r).toContain("'Disallow: /asset/'");
    expect(r).toContain("'Crawl-delay: 10'");
  });
});
