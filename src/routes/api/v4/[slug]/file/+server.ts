// THE V4 FILE ITSELF, exactly as stored (D-98). No account, CORS open, never cached: whether it may
// be served depends on its state, and a hold must take effect at once.
//
// `x-sse-sha256` carries the hash of the body, so a reader can check what arrived without asking
// the listing again.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { withCors, preflight } from '$lib/server/cors';
import { v4Key } from '$lib/server/v4';
import { fanWorkHeader } from '$lib/fanWork';

export const GET: RequestHandler = async ({ platform, params }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');
  const sb = db(env);
  const { data: item } = await sb.from('v4_items')
    .select('id, slug, kind, state, sha256, fan_setting, download_count, pack_id, pack_version').eq('slug', params.slug).maybeSingle();
  if (!item || item.state !== 'public') throw error(404, 'not found');
  const object = await env.HUB_BUNDLES.get(v4Key(item.sha256));
  if (!object) throw error(404, 'not found');

  // A count, not a ledger: read and write, and a lost increment under a race costs nothing.
  platform?.context?.waitUntil?.(Promise.resolve(
    sb.from('v4_items').update({ download_count: item.download_count + 1 }).eq('id', item.id)
  ).then(() => undefined, () => undefined));

  const name = item.kind === 'pack' ? `${item.pack_id}-${item.pack_version}.pack.json` : `${item.slug}.sse4.json`;
  return new Response(object.body, {
    headers: withCors({
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${name}"`,
      'x-sse-sha256': item.sha256,
      'x-fan-work': fanWorkHeader(item.fan_setting),
      'access-control-expose-headers': 'x-fan-work, x-sse-sha256, content-disposition',
      'cache-control': 'no-store'
    })
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
