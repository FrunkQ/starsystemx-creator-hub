// SERVE AN ASSET - and only if the ledger says so.
//
// This is the single door to the private bucket. Design 6.2: "an upload is never blocked; an
// unreviewed ASSET is never served." Approve or ban is a row update and takes effect here on the
// next request, including revoking something already public - which is exactly what a
// copy-on-approve design makes slow and error-prone.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import * as r2 from '$lib/server/r2';

const HEX64 = /^[0-9a-f]{64}$/;

export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const hash = params.hash.toLowerCase();
  if (!HEX64.test(hash)) throw error(404, 'not found');

  // THE CHECK. Novel, banned, or unknown all mean the same thing here: not served.
  if (!(await ledger.isServable(db(env), hash))) {
    // 404 rather than 403: whether a given hash exists but is unreviewed is not a visitor's
    // business, and a distinguishable response turns this route into a lookup oracle for the
    // moderation queue.
    throw error(404, 'not found');
  }

  const object = await r2.getAsset(env, hash);
  if (!object) throw error(404, 'not found');

  // Safe ONLY because the key is the content hash: these bytes can never change (design 3.4).
  // The ledger check above still runs on every request, so a ban still takes effect at the edge
  // of our control - a cached copy in a visitor's browser is the accepted cost of immutability.
  setHeaders({
    'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    // Belt and braces: even an image route should not be able to run anything.
    'content-security-policy': "default-src 'none'; sandbox"
  });

  return new Response(object.body);
};
