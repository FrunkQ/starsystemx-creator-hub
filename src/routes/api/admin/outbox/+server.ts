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

export const POST: RequestHandler = async ({ platform, locals, request, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  // Either an admin, or the cron secret. The cron has no session, so it needs its own key - and
  // that key is compared in full rather than by prefix.
  const cronKey = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const offered = request.headers.get('x-cron-key');
  const isCron = !!cronKey && !!offered && offered === cronKey;
  if (!isCron && locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
  const report = await drainOutbox(env, sb, gates, site.name);
  return json({ ok: true, ...report });
};
