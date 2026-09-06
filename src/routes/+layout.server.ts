import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { loadSite, DEFAULT_SITE_NAME } from '$lib/server/site';
import { outstandingCounts, newCommentsFor, EMPTY_COUNTS } from '$lib/server/outstanding';
import { isStaff } from '$lib/server/auth';

// Analytics, and deliberately the smallest possible amount of it.
//
// The hub only ever runs on Cloudflare, so unlike the engine there is no "which provider" question
// here (see docs/sse-requirements.md R-09 for the engine's version of this problem, which is real
// because it runs on two hosts at once during the migration window).
//
// TWO WAYS TO TURN THIS ON, and the first one needs no code at all:
//   1. Cloudflare Pages > the project > Web Analytics. Cloudflare injects the beacon itself.
//   2. Set PUBLIC_CF_BEACON_TOKEN and the token below is used instead. Useful if the hub ever moves,
//      or if the beacon needs to be conditional on something.
//
// Absent token = no script tag at all. A page whose job is to LOAD FAST does not get a third-party
// script it did not ask for.
export const load: LayoutServerLoad = async ({ platform, locals, url, depends }) => {
  // A NAMED DEPENDENCY so a page that changes the numbers can refresh JUST this load.
  //
  // The review queue decides by `fetch` rather than by a form action, so nothing re-ran the layout
  // and the badge kept its load-time number until a full page load - the owner watched a (1) sit
  // there after clearing the queue (D-43). Every other staff page posts a real form, and SvelteKit
  // re-runs every load after an action, which is why only this one was wrong.
  //
  // `invalidate('hub:counts')` re-runs this load and NOT the page's own, so a reviewer holding down
  // A pays for four head counts rather than for the queue as well.
  depends('hub:counts');
  const env = platform?.env;
  const token = (env as unknown as { PUBLIC_CF_BEACON_TOKEN?: string })?.PUBLIC_CF_BEACON_TOKEN;
  // Site identity, so a host change is a config edit rather than a release.
  const site = env?.SUPABASE_URL
    ? await loadSite(db(env), url)
    : { name: DEFAULT_SITE_NAME, url: url.origin };

  // OUTSTANDING WORK, for the number circles (D-38). The staff counts are for staff only - three
  // counts on every page view, and nobody else's nav has anywhere to put them. The new-comments
  // count is for anybody signed in: it is the one thing waiting for an ordinary Explorer, and it
  // was previously visible only by going to the page that clears it.
  const [counts, newComments] = await Promise.all([
    isStaff(locals.viewer) && env?.SUPABASE_URL
      ? outstandingCounts(db(env))
      : Promise.resolve(EMPTY_COUNTS),
    locals.viewer && env?.SUPABASE_URL
      ? newCommentsFor(db(env), locals.viewer.id, locals.viewer.comments_seen_at)
      : Promise.resolve(null)
  ]);

  return {
    site,
    cfBeaconToken: token && /^[a-zA-Z0-9]{8,64}$/.test(token) ? token : null,
    // Only what the chrome needs. Never the whole viewer object - it carries state the nav has no
    // business knowing, and a layout payload is serialised into every page.
    viewer: locals.viewer ? { handle: locals.viewer.handle, role: locals.viewer.role } : null,
    counts,
    newComments
  };
};
