import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { inspectBytes } from '$lib/bundle/inspect';

// A report on one debug upload (D-35): what the file is, where it breaks, what it needs. Read on
// demand, admin only; the bytes stay where they are and nothing is stored from the reading.
export const load: PageServerLoad = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const { data: row } = await db(env).from('debug_uploads')
    .select('id, filename, byte_size, user_note, uploaded_at, storage_key').eq('id', params.id).maybeSingle();
  if (!row) throw error(404, 'Not found');

  const object = await env.HUB_BUNDLES.get(row.storage_key);
  if (!object) throw error(404, 'The stored file is missing.');

  const report = inspectBytes(new Uint8Array(await object.arrayBuffer()));
  return {
    upload: { id: row.id, filename: row.filename, bytes: row.byte_size, note: row.user_note, uploadedAt: row.uploaded_at },
    report
  };
};
