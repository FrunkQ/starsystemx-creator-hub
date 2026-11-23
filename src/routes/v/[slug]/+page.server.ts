// ONE V4 ITEM'S PAGE (D-98): what the manifest says, who made it, and how to take it.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/auth';
import { loadSite } from '$lib/server/site';
import { shelfOf, SHELVES } from '$lib/v4/read';

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);
  const { data: item } = await sb.from('v4_items').select('*').eq('slug', params.slug).maybeSingle();
  const staff = isStaff(locals.viewer);
  const mine = !!item && locals.viewer?.id === item.creator_id;
  if (!item || (item.state !== 'public' && !staff && !mine)) throw error(404, 'Not found');

  const { data: maker } = await sb.from('creators').select('handle, display_name').eq('id', item.creator_id).maybeSingle();
  // Other versions of the same pack, newest first.
  const { data: versions } = item.kind === 'pack'
    ? await sb.from('v4_items').select('slug, pack_version, created_at').eq('kind', 'pack').eq('pack_id', item.pack_id!)
      .eq('state', 'public').order('created_at', { ascending: false }).limit(20)
    : { data: [] };
  const { count: openReports } = staff
    ? await sb.from('v4_reports').select('id', { count: 'exact', head: true }).eq('item_id', item.id).eq('state', 'open')
    : { count: 0 };
  const site = await loadSite(sb, url);
  const shelf = item.kind === 'pack' ? SHELVES.find((s) => s.id === shelfOf(item.pack_kinds)) : null;

  return {
    item, maker, versions: versions ?? [], staff, mine, openReports: openReports ?? 0,
    shelfTitle: shelf?.title ?? 'Campaigns',
    signedIn: !!locals.viewer,
    metaUrl: `${site.url}/api/v4/${item.slug}`,
    fileUrl: `${site.url}/api/v4/${item.slug}/file`
  };
};
