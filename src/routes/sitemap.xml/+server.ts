// The sitemap: every public map page, so search engines find the funnel's front doors (D-33).
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { loadSite } from '$lib/server/site';

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  let base = url.origin;
  const maps: string[] = [];

  if (env?.SUPABASE_URL) {
    const sb = db(env);
    const [site, { data }] = await Promise.all([
      loadSite(sb, url),
      sb.from('systems').select('slug, updated_at')
        .eq('state', 'public').eq('visibility', 'public')
        .order('updated_at', { ascending: false }).limit(5000)
    ]);
    base = site.url;
    for (const s of data ?? []) {
      maps.push('<url><loc>' + esc(base + '/s/' + s.slug) + '</loc><lastmod>' + s.updated_at.slice(0, 10) + '</lastmod></url>');
    }
  }

  const statics = ['/', '/browse', '/terms'].map((p) => '<url><loc>' + esc(base + p) + '</loc></url>');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + [...statics, ...maps].join('\n') + '\n</urlset>\n';

  setHeaders({ 'cache-control': 'public, max-age=3600' });
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
