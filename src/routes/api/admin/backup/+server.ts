// Take a backup now (D-33). An admin's button, or an external scheduler with the cron key - the
// same key the outbox drain accepts - because a Worker has no clock of its own.
//
//   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/admin/backup
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { writeBackup } from '$lib/server/backup';
import * as audit from '$lib/server/audit';

export const POST: RequestHandler = async ({ platform, locals, request }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const cronKey = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const offered = request.headers.get('x-cron-key');
  const isCron = !!cronKey && !!offered && offered === cronKey;
  if (!isCron && locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const report = await writeBackup(env, sb);
  await audit.record(sb, locals.viewer?.id ?? null, 'backup.write', report.key, isCron ? 'scheduled' : 'by hand',
    { bytes: report.bytes, problems: report.problems });
  return json({ ok: true, ...report });
};
