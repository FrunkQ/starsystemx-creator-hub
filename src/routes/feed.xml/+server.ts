// An Atom feed of the newest public maps (D-33): what a Discord bot, a reader or a friend's
// script subscribes to. Thirty entries, the same facts the cards show.
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { loadSite } from '$lib/server/site';

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);

export const GET: RequestHandler = async ({ platform, url, setHeaders }) => {
  const env = platform?.env;
  let base = url.origin;
  let siteName = 'StarSystemX Explorers';
  const entries: string[] = [];
  let latest = new Date(0).toISOString();

  if (env?.SUPABASE_URL) {
    const sb = db(env);
    const [site, { data: maps }] = await Promise.all([
      loadSite(sb, url),
      sb.from('systems').select('slug, title, blurb, summary, kind, created_at, updated_at, creator_id')
        .eq('state', 'public').eq('visibility', 'public')
        .order('created_at', { ascending: false }).limit(30)
    ]);
    base = site.url;
    siteName = site.name;

    const ids = [...new Set((maps ?? []).map((m) => m.creator_id))];
    const { data: people } = ids.length
      ? await sb.from('creators').select('id, handle, display_name').in('id', ids)
      : { data: [] as { id: string; handle: string; display_name: string | null }[] };
    const name = new Map((people ?? []).map((p) => [p.id, p.display_name ?? p.handle]));

    for (const m of maps ?? []) {
      const link = base + '/s/' + m.slug;
      if (m.updated_at > latest) latest = m.updated_at;
      entries.push(
        '<entry>'
        + '<title>' + esc(m.title) + '</title>'
        + '<link href="' + esc(link) + '"/>'
        + '<id>' + esc(link) + '</id>'
        + '<published>' + m.created_at + '</published>'
        + '<updated>' + m.updated_at + '</updated>'
        + '<author><name>' + esc(name.get(m.creator_id) ?? 'an explorer') + '</name></author>'
        + '<category term="' + esc(m.kind) + '"/>'
        + '<summary>' + esc(m.blurb ?? m.summary ?? 'A ' + (m.kind === 'starmap' ? 'campaign starmap' : 'star system') + ' for Star System Explorer, free to download.') + '</summary>'
        + '</entry>'
      );
    }
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<feed xmlns="http://www.w3.org/2005/Atom">\n'
    + '<title>' + esc(siteName) + ' - new maps</title>\n'
    + '<link href="' + esc(base + '/feed.xml') + '" rel="self"/>\n'
    + '<link href="' + esc(base) + '"/>\n'
    + '<id>' + esc(base + '/feed.xml') + '</id>\n'
    + '<updated>' + latest + '</updated>\n'
    + entries.join('\n') + '\n</feed>\n';

  setHeaders({ 'cache-control': 'public, max-age=900' });
  return new Response(xml, { headers: { 'content-type': 'application/atom+xml; charset=utf-8' } });
};
