// THE BROWSER PREPARES THE PICTURE; THE WORKER JUST KEEPS IT (D-54).
//
// ============================================================================================
// The owner, 2026-09-06, choosing between a paid plan and this: *"move to browser... i dont wanna
// be on the hook for any runaway cost."*
//
// So the expensive half moves to the one machine in this system with CPU to spare. A browser
// decodes and rescales a 4-megapixel screenshot in single-digit milliseconds using the graphics
// hardware it already has; the same work in pure JavaScript on a Worker was measured at 168ms
// against a free plan's 10ms budget (D-53), and Cloudflare's answer to that is a 1102.
//
// WHAT ARRIVES HERE IS RAW RGB - not a PNG - and that is the entire point. A PNG would have to be
// DECODED, which is the cost being avoided; raw pixels are stored exactly as they arrive and
// handed to the rasteriser later with no work at all in between. 1200 x 630 x 3 is 2.27 MB, sent
// once per picture per crop, which is a fair trade for never spending CPU on it again.
//
// THE VALIDATION IS THE LENGTH, and it is exact. There is no way to send "nearly" the right number
// of pixels, so anything else is not a fitted cover and is refused without being looked at.
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import { COVER_W, COVER_H } from '$lib/cover/generate';
import { fitKey } from '$lib/server/cover';

const EXPECTED = COVER_W * COVER_H * 3;
const HEX64 = /^[0-9a-f]{64}$/;

export const POST: RequestHandler = async ({ request, platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!locals.viewer) throw error(401, 'Sign in first.');

  const systemId = url.searchParams.get('systemId') ?? '';
  const sha256 = (url.searchParams.get('sha256') ?? '').toLowerCase();
  const focusX = Number(url.searchParams.get('focusX') ?? '0.5');
  const focusY = Number(url.searchParams.get('focusY') ?? '0.5');
  if (!HEX64.test(sha256)) throw error(400, 'not a hash');

  const sb = db(env);

  // THE SAME THREE CHECKS `loadBaseImage` MAKES, because this writes what that reads: the map is
  // yours, the picture is on it, and the picture has been approved. A cover is stored auto-approved
  // (D-21) on the grounds that the hub drew it - which holds only if everything under the words had
  // already been looked at, and that is as true of pixels a browser sent as of pixels it decoded.
  const { data: system } = await sb.from('systems').select('id, creator_id').eq('id', systemId).maybeSingle();
  if (!system || system.creator_id !== locals.viewer.id) throw error(404, 'not found');

  const { data: mine } = await sb.from('system_screenshots')
    .select('sha256').eq('system_id', systemId).eq('sha256', sha256).maybeSingle();
  if (!mine) throw error(404, 'not found');
  if (!(await ledger.isServable(sb, sha256))) throw error(409, 'that picture has not been approved yet');

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== EXPECTED) {
    throw error(400, 'expected ' + EXPECTED + ' bytes of RGB, got ' + bytes.length);
  }

  await env.HUB_BUNDLES.put(fitKey(sha256, focusX, focusY), bytes as unknown as ArrayBuffer, {
    // The key carries the hash AND the crop, so these bytes can never mean anything else.
    httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' }
  });

  return json({ ok: true, bytes: bytes.length });
};
