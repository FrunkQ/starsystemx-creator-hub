// "Open in Star System Explorer" (D-35, engine R-17): the engine's URL prefix from config with the
// map's download URL appended, percent-encoded. Null until the prefix is set, so nothing shows
// before the engine can receive it. Pure, and used on both sides: the pages and the cards.
export function openLink(prefix: string | null | undefined, siteUrl: string, slug: string): string | null {
  if (!prefix) return null;
  return prefix + encodeURIComponent(siteUrl + '/api/download/' + slug);
}
