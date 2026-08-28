// THE ONE PLACE AN UNREVIEWED ASSET IS SERVED, and it exists because somebody has to look at the
// picture in order to review it.
//
// This is a deliberate, single exception to the rule in /asset/[hash] ("an unreviewed asset is
// never served"). It is admin-only, it is never cached, it is noindex, and it is the ONLY route
// that reads R2 without consulting the ledger. If a second one ever appears, the rule is gone.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import * as r2 from '$lib/server/r2';

const HEX64 = /^[0-9a-f]{64}$/;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  // Not `requireAdmin`'s thrown Error - a non-admin gets the same 404 a visitor would, so this
  // route does not confirm that a hash exists to anyone who is not entitled to know.
  if (locals.viewer?.role !== 'admin') throw error(404, 'not found');

  const hash = params.hash.toLowerCase();
  if (!HEX64.test(hash)) throw error(404, 'not found');

  const object = await r2.getAsset(env, hash);
  if (!object) throw error(404, 'not found');

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox"
    }
  });
};
