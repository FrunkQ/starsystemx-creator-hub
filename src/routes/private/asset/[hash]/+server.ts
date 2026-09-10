// THE ONE ROUTE THAT SERVES AN UNREVIEWED ASSET. There must never be a second.
//
// `/asset/[hash]` is the public door and it consults the ledger on every request: novel, banned or
// unknown all mean "not served". This is the single, deliberate exception, and it exists because
// two people legitimately need to see bytes before anyone else does:
//
//   STAFF        - somebody has to look at the picture in order to review it. A MODERATOR as much
//                  as an admin: judging pictures is the whole of what the role was created for
//                  (D-39), and this line said `admin` for four days after it existed, so the one
//                  person the queue was built for could not see a single image in it (D-75).
//   THE CREATOR  - they need to see the screenshot they just added to their own map. This leaks
//                  nothing: they uploaded those bytes, they already have them on disk.
//
// One route with two branches, rather than two routes. The moment this becomes two, the rule in
// design 6.2 stops being checkable by reading one file. See docs/decisions.md D-06.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as r2 from '$lib/server/r2';
import { isStaff } from '$lib/server/auth';

const HEX64 = /^[0-9a-f]{64}$/;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  // Every refusal here is a 404, never a 403. Whether a given hash exists but is unreviewed is not
  // a visitor's business, and a distinguishable response turns this into a lookup oracle for the
  // moderation queue.
  const viewer = locals.viewer;
  if (!viewer) throw error(404, 'not found');

  const hash = params.hash.toLowerCase();
  if (!HEX64.test(hash)) throw error(404, 'not found');

  const sb = db(env);

  // `isStaff`, not a hard-coded comparison against the admin role. That comparison predates the
  // moderator role and silently excluded it - the same shape of miss as the explorers list's badge.
  // The helper is a type predicate for exactly this reason: ONE place decides who staff are.
  //
  // The id is read BEFORE the check, deliberately. `isStaff` is a type predicate (`v is T`), so a
  // negated call narrows `viewer` to `never` for the rest of the expression - and TypeScript tracks
  // that through an intermediate boolean too. Taking the id first sidesteps the whole question.
  const viewerId = viewer.id;
  if (!isStaff(viewer) && !(await ownsAssetUse(sb, viewerId, hash))) {
    throw error(404, 'not found');
  }

  const object = await r2.getAsset(env, hash);
  if (!object) throw error(404, 'not found');

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // Never cached and never indexed: this is a pre-publication view, not a public URL.
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox"
    }
  });
};

/** True when this creator owns a map that references these bytes - as a bundled asset or a screenshot. */
async function ownsAssetUse(sb: ReturnType<typeof db>, creatorId: string, hash: string): Promise<boolean> {
  const { data: mine } = await sb.from('systems').select('id').eq('creator_id', creatorId);
  const ids = (mine ?? []).map((m) => m.id);
  if (!ids.length) return false;

  const [{ data: asAsset }, { data: asShot }] = await Promise.all([
    sb.from('system_assets').select('sha256').eq('sha256', hash).in('system_id', ids).limit(1),
    sb.from('system_screenshots').select('sha256').eq('sha256', hash).in('system_id', ids).limit(1)
  ]);
  return !!(asAsset?.length || asShot?.length);
}
