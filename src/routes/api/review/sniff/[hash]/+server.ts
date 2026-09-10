// WHAT THE BYTES SAY, for the card a reviewer is looking at (D-76).
//
// ============================================================================================
// The owner: *"We need more file details - name, apparent type, size, guess from first few bytes."*
//
// ON DEMAND, PER CARD, rather than computed for the whole queue on load. Sixty cards would be sixty
// R2 reads before the page painted, in a Worker with 10ms of CPU (D-53) - to answer a question
// about the one picture somebody is actually looking at. The page asks as the reviewer moves.
//
// A RANGE READ of the first bytes, never the whole object: pulling a 4 MB screenshot down to look
// at eight bytes of it is the same mistake in a smaller key.
//
// STAFF ONLY, and 404 rather than 403 for the same reason as the private asset route: whether a
// given hash is in the queue is not a visitor's business, and a distinguishable answer turns this
// into a lookup oracle for the moderation queue.
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/auth';
import * as r2 from '$lib/server/r2';
import { sniff, mismatch, SNIFF_BYTES } from '$lib/bundle/sniff';

const HEX64 = /^[0-9a-f]{64}$/;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'not found');

  const hash = params.hash.toLowerCase();
  if (!HEX64.test(hash)) throw error(404, 'not found');

  const sb = db(env);
  const { data: asset } = await sb.from('assets')
    .select('sha256, mime, byte_size, kind, first_seen_at').eq('sha256', hash).maybeSingle();
  if (!asset) throw error(404, 'not found');

  const head = await r2.getAssetHead(env, hash, SNIFF_BYTES);
  const found = sniff(head);

  return json({
    declared: asset.mime ?? null,
    byteSize: asset.byte_size ?? null,
    kind: asset.kind ?? null,
    format: found.format,
    expected: found.expected,
    // The one thing here that asks a reviewer to look harder. False for anything unrecognised -
    // the pattern list is short on purpose and "we do not know" must never read as "this is wrong".
    mismatch: mismatch(asset.mime, found),
    /** Null when the object is missing from R2 entirely, which is itself worth showing. */
    readable: !!head
  }, { headers: { 'cache-control': 'private, max-age=60' } });
};
