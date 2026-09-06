// Drain the integration outbox.
//
// Deliberately a route rather than a background loop: Workers have no long-lived process, so this
// is driven by a Cloudflare Cron Trigger (see docs/deployment.md) or by an admin pressing a button
// when something looks stuck. A publish also drains in `waitUntil` so a share lands promptly.
//
// Idempotent, so running it twice is harmless. The delivery itself is integrations/deliver.ts.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import { drainOutbox } from '$lib/server/integrations/deliver';
import { queueNotice } from '$lib/server/queueNotice';

export const POST: RequestHandler = async ({ platform, locals, request, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  // An admin; the Worker's own clock (worker/index.mjs calls this in-process, and such a request
  // never crossed Cloudflare's edge, so it carries neither `cf-connecting-ip` nor `request.cf` -
  // a pair no outside caller can leave off); or an external scheduler with the cron secret,
  // compared in full rather than by prefix.
  const internal = !platform?.cf && !request.headers.get('cf-connecting-ip');
  const cronKey = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const offered = request.headers.get('x-cron-key');
  const isCron = !!cronKey && !!offered && offered === cronKey;
  if (!internal && !isCron && locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);

  // BEFORE the drain, so anything it queues goes out in the same pass rather than waiting fifteen
  // minutes for the next one (D-49). It never throws: a queue nudge that broke the drain would
  // take the Discord posts down with it.
  const notice = await queueNotice(env, sb, gates, site.url);

  const report = await drainOutbox(env, sb, gates, site.name);
  return json({ ok: true, ...report, notice });
};
