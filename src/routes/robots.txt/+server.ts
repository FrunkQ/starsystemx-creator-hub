// What crawlers may read: the public pages, not the admin, the manage pages, the account or the
// downloads (a crawler fetching every bundle is bandwidth for nobody's benefit).
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { loadSite } from '$lib/server/site';

/** Named one per line in the file, so each crawler finds itself. Google-Extended and
 * Applebot-Extended are tokens, not agents: they opt the site out of AI training only and leave
 * normal search alone. */
const AI_AND_BULK = [
  'GPTBot', 'OAI-SearchBot', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended',
  'Applebot-Extended', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'FacebookBot',
  'PerplexityBot', 'cohere-ai', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'YouBot', 'Timpibot',
  'PetalBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'DataForSeoBot', 'BLEXBot',
  'Barkrowler', 'Baiduspider', 'Sogou', 'YisouSpider', '360Spider'
];

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  const base = env?.SUPABASE_URL ? (await loadSite(db(env), url)).url : url.origin;
  const text = [
    // AI TRAINING AND BULK-DATA CRAWLERS ARE TURNED AWAY WHOLE (D-95). The ones that ignore this
    // are refused by agent in the Worker (server/guard.ts) and, best, by Cloudflare before it.
    ...AI_AND_BULK.map((bot) => 'User-agent: ' + bot),
    'Disallow: /',
    '',
    'User-agent: *',
    'Crawl-delay: 10',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /manage/',
    'Disallow: /account',
    'Disallow: /api/',
    'Disallow: /private/',
    // Covers and screenshots are reached from the pages; a crawler has no need to walk them.
    'Disallow: /asset/',
    '',
    'Sitemap: ' + base + '/sitemap.xml',
    ''
  ].join('\n');
  setHeaders({ 'cache-control': 'public, max-age=86400' });
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
