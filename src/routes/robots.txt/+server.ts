// What crawlers may read: the public pages, not the admin, the manage pages, the account or the
// downloads (a crawler fetching every bundle is bandwidth for nobody's benefit).
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { loadSite } from '$lib/server/site';

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  const base = env?.SUPABASE_URL ? (await loadSite(db(env), url)).url : url.origin;
  const text = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /manage/',
    'Disallow: /account',
    'Disallow: /api/',
    'Disallow: /private/',
    '',
    'Sitemap: ' + base + '/sitemap.xml',
    ''
  ].join('\n');
  setHeaders({ 'cache-control': 'public, max-age=86400' });
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
