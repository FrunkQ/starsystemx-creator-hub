// A LIVE PREVIEW of a designed cover: drawn on request, never stored.
//
// The manage page points an <img> at this with the current choices in the query string, so every
// tick of a box redraws the card. Owner (or admin) only - the picture is not secret, but drawing
// one is a few dozen milliseconds of CPU and there is no reason to offer that to the internet.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import { coverNodeFrom, coverFacts } from '$lib/server/cover';
import { renderCover, coverOptionsFrom } from '$lib/cover/generate';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  const viewer = locals.viewer;
  if (!viewer) throw error(401, 'Sign in first.');

  const systemId = url.searchParams.get('systemId') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(systemId)) throw error(400, 'Which map?');

  const sb = db(env);
  const { data: system } = await sb.from('systems').select('*').eq('id', systemId).maybeSingle();
  if (!system || (system.creator_id !== viewer.id && viewer.role !== 'admin')) throw error(404, 'Not found');

  const [gates, site, { data: bodies }, { data: constructs }, { data: creator }] = await Promise.all([
    loadGates(sb),
    loadSite(sb, url),
    sb.from('bodies').select('*').eq('system_id', systemId),
    sb.from('constructs').select('*').eq('system_id', systemId),
    sb.from('creators').select('handle').eq('id', system.creator_id).maybeSingle()
  ]);

  const png = renderCover(
    coverFacts({
      title: system.title, creator: creator?.handle ?? null, kind: system.kind,
      systems: system.system_count, bodies: system.body_count, constructs: system.construct_count,
      url: site.url + '/s/' + system.slug, label: gates.cover_label
    }, [...(bodies ?? []), ...(constructs ?? [])].map(coverNodeFrom)),
    coverOptionsFrom(Object.fromEntries(url.searchParams))
  );

  return new Response(png as unknown as ArrayBuffer, {
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
  });
};
