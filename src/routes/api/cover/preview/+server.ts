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
import { factsFor } from '$lib/server/cover';
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

  const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
  const options = coverOptionsFrom(Object.fromEntries(url.searchParams));
  // The same facts the stored card is drawn from - picture, display name and all - so the preview
  // is byte-for-byte what "Use this cover" keeps.
  const png = renderCover(await factsFor(env, sb, system, site, gates, options), options);

  return new Response(png as unknown as ArrayBuffer, {
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
  });
};
