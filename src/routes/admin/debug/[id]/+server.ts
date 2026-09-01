// Download one debug upload. Admin only, and the ONLY way these bytes ever leave the hub.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  // 404 rather than 403: a non-admin should not learn that this id exists.
  if (locals.viewer?.role !== 'admin') throw error(404, 'not found');

  const { data } = await db(env).from('debug_uploads')
    .select('filename, storage_key').eq('id', params.id).maybeSingle();
  if (!data) throw error(404, 'not found');

  const object = await env.HUB_BUNDLES.get(data.storage_key);
  if (!object) throw error(404, 'not found');

  // The filename came from an anonymous stranger, so it is scrubbed to a safe set rather than
  // trusted into a header - a quote or a newline in there is a header-injection attempt.
  const safeName = data.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'debug-upload';

  return new Response(object.body, {
    headers: {
      // Never the real content type. An anonymous upload rendered inline by the browser is exactly
      // how a "debug file" becomes a stored XSS against the one account that matters.
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="' + safeName + '"',
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow'
    }
  });
};
