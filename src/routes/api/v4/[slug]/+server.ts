// ONE V4 ITEM'S LISTING, as data (D-98, contract C-09): everything SSE4 needs before it fetches the
// file - what it is, who made it, the hash to check the bytes against, and the credit chain to write
// onto what it places.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { PUBLIC_CORS, preflight } from '$lib/server/cors';
import { loadSite } from '$lib/server/site';
import { creditChain } from '$lib/server/v4';
import { shelfOf } from '$lib/v4/read';
import { fanWorkHeader } from '$lib/fanWork';

export const GET: RequestHandler = async ({ platform, params, url, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);
  const { data: item } = await sb.from('v4_items').select('*').eq('slug', params.slug).maybeSingle();
  if (!item || item.state !== 'public') throw error(404, 'not found');
  const { data: maker } = await sb.from('creators').select('handle, display_name').eq('id', item.creator_id).maybeSingle();
  const site = await loadSite(sb, url);

  setHeaders({ 'cache-control': 'public, max-age=60', ...PUBLIC_CORS });
  return json({
    generation: 'v4',
    kind: item.kind,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    shelf: item.kind === 'pack' ? shelfOf(item.pack_kinds) : 'campaign',
    pack: item.kind === 'pack' ? {
      id: item.pack_id, version: item.pack_version, kinds: item.pack_kinds, fictional: item.fictional,
      licence: item.licence, kernelRange: item.kernel_range, requires: item.requires, provides: item.provides
    } : null,
    campaign: item.kind === 'campaign' ? {
      root: item.universe_root, stateHash: item.state_hash, events: item.event_count, stack: item.stack
    } : null,
    // THE BYTES' HASH (SHA-256, hex). Check a download against it before using it.
    sha256: item.sha256,
    byteSize: item.byte_size,
    fanWork: item.fan_setting ? fanWorkHeader(item.fan_setting) : null,
    creator: maker ? { name: maker.display_name ?? maker.handle, handle: maker.handle } : null,
    source: { site: 'Explorers', title: item.title, url: `${site.url}/v/${item.slug}`, creditChain: creditChain(item, maker, site.url) },
    url: `${site.url}/v/${item.slug}`,
    fileUrl: `${site.url}/api/v4/${item.slug}/file`,
    publishedAt: item.created_at
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
