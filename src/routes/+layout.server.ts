import type { LayoutServerLoad } from './$types';

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
export const load: LayoutServerLoad = async ({ platform, locals }) => {
  const token = (platform?.env as unknown as { PUBLIC_CF_BEACON_TOKEN?: string })?.PUBLIC_CF_BEACON_TOKEN;
  return {
    cfBeaconToken: token && /^[a-zA-Z0-9]{8,64}$/.test(token) ? token : null,
    // Only what the chrome needs. Never the whole viewer object - it carries state the nav has no
    // business knowing, and a layout payload is serialised into every page.
    viewer: locals.viewer ? { handle: locals.viewer.handle, role: locals.viewer.role } : null
  };
};
