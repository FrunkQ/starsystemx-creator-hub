import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listBackups, writeBackup, KEEP } from '$lib/server/backup';
import * as audit from '$lib/server/audit';

// The backups that exist, and a button to take one (D-33).
export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');
  return { backups: await listBackups(env), keep: KEEP, hasCronKey: !!(env as unknown as { CRON_SECRET?: string }).CRON_SECRET };
};

export const actions: Actions = {
  run: async ({ platform, locals }) => {
    const env = platform?.env;
    if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');
    const sb = db(env);
    try {
      const report = await writeBackup(env, sb);
      await audit.record(sb, locals.viewer.id, 'backup.write', report.key, 'by hand', { bytes: report.bytes, problems: report.problems });
      return { report };
    } catch (e) {
      return fail(500, { message: (e as Error).message });
    }
  }
};
