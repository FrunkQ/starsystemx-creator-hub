// ONE MAP, RE-READ FROM THE FILE THE HUB ALREADY HOLDS (D-87).
//
// POST { id } - STAFF. Re-reads one map and says what it found. The map page's Moderator panel
// calls it for the map being looked at (owner, 2026-09-11: "does it make sense that the mod/admin
// controls on each map let you run it for just that 1 map to fix"), and the Config page calls it
// once per map to walk the library. A moderator gets it because it changes nothing anybody made -
// it rebuilds what the hub derives from a file it already holds - and doing it twice is harmless.
//
// GET - ADMIN. The maps the running build has not read yet, for the Config page to walk.
//
// ONE MAP A REQUEST, NEVER A LIST: a free Worker has the CPU for one and not for eight (reindex.ts).
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isAdmin, isStaff } from '$lib/server/auth';
import { reindexSystem, mapsBehind, builtAt } from '$lib/server/reindex';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import * as audit from '$lib/server/audit';

const NO_STORE = { 'cache-control': 'no-store, private' };
const ID = /^[0-9a-f-]{36}$/;

export const GET: RequestHandler = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env || !isAdmin(locals.viewer)) throw error(404, 'not found');
  const maps = await mapsBehind(db(env));
  return json(
    { builtAt: builtAt(), maps: maps.map(({ id, slug, title }) => ({ id, slug, title })) },
    { headers: NO_STORE }
  );
};

export const POST: RequestHandler = async ({ request, platform, locals, url }) => {
  const env = platform?.env;
  if (!env || !isStaff(locals.viewer)) throw error(404, 'not found');
  const viewerId = locals.viewer.id;

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' && ID.test(body.id) ? body.id : null;
  if (!id) return json({ ok: false, message: 'Which map?' }, { status: 400, headers: NO_STORE });

  const sb = db(env);
  const { data: system } = await sb.from('systems').select('id, title').eq('id', id).maybeSingle();
  if (!system) return json({ ok: false, message: 'No such map.' }, { status: 404, headers: NO_STORE });

  const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
  const result = await reindexSystem(env, sb, id, site, gates);
  if (!result.ok) {
    return json({ ok: false, title: system.title, message: result.message }, { status: 500, headers: NO_STORE });
  }

  // WHAT IT FOUND, not just "done". A re-index that succeeds and stores nothing looks exactly like
  // one that did nothing, and that is the confusion this route exists to end.
  const [{ count: bodies }, { count: constructs }] = await Promise.all([
    sb.from('bodies').select('id', { count: 'exact', head: true }).eq('system_id', id),
    sb.from('constructs').select('id', { count: 'exact', head: true }).eq('system_id', id)
  ]);
  await audit.record(sb, viewerId, 'system.reindex', 'system:' + id);
  return json({ ok: true, title: system.title, bodies: bodies ?? null, constructs: constructs ?? null }, { headers: NO_STORE });
};
