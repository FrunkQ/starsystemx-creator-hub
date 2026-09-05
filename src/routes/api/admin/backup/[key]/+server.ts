// Fetch one backup file, admin only. The key is the file's own name under backups/.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { isBackupKey, BACKUP_PREFIX } from '$lib/server/backup';

export const GET: RequestHandler = async ({ platform, locals, params }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const key = BACKUP_PREFIX + params.key;
  if (!isBackupKey(key)) throw error(400, 'bad key');

  const object = await env.HUB_BUNDLES.get(key);
  if (!object) throw error(404, 'Not found');

  return new Response(object.body, {
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': 'attachment; filename="' + params.key + '"',
      'cache-control': 'no-store'
    }
  });
};
