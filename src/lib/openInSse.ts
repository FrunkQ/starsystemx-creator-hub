// "Open in Star System Explorer" (D-35, engine R-17): the engine's URL prefix from config with the
// map's download URL appended, percent-encoded. Null until the prefix is set, so nothing shows
// before the engine can receive it. Pure, and used on both sides: the pages and the cards.
//
// ============================================================================================
// AND NULL FOR A SINGLE SYSTEM, WHICH IS NOT AN OVERSIGHT. Measured against the engine's own code
// (stream L, `src/routes/+page.svelte`, `openHubBytes`) on 2026-09-06: a map arriving by `?open=`
// is classified, and anything that is not a starmap is refused with
//
//   "That link points at a single system rather than a campaign. Download it from the hub and
//    open it with Load System."
//
// That is a decent message, but it is the answer to a button that PROMISED to open the map. A
// control that cannot keep its promise should not be offered - so the hub shows it only where it
// works, and the download beside it is the honest route for the rest.
//
// This is a gate on the ENGINE'S CURRENT SHAPE, not a decision about what belongs in the app.
// R-18 asks for the single-system door; the day it ships, delete `kind` from this function and the
// button returns everywhere. Until then the hub's own library is mostly single systems, and every
// one of them would have been a dead end.
// ============================================================================================
// `kind` is REQUIRED, and an unknown kind gets no link: a caller who cannot say what the map is
// cannot be promised that the app will open it.
export function openLink(
  prefix: string | null | undefined, siteUrl: string, slug: string, kind: string | null | undefined
): string | null {
  if (!prefix) return null;
  if (kind !== 'starmap') return null;
  return prefix + encodeURIComponent(siteUrl + '/api/download/' + slug);
}
