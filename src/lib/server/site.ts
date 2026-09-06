// Who the site says it is, and where it says it lives.
//
// Both are config rows because the hub is going to move hosts more than once. The name shows in
// titles; the URL is what makes Open Graph previews work.
//
// THE FALLBACK IS THE IMPORTANT PART, and it changed in 0.21.0: with `site_url` unset, `HUB_ORIGIN`
// from `$lib/addresses` is used, and only then the request's own origin. The origin fallback made
// the hub correct on any host with no configuration at all, which is a fine property for a page and
// the wrong one for a URL the hub EMBEDS in a link somebody else fetches - the download URL inside
// an "Open in Star System Explorer" link, an Open Graph tag, a cover's QR code. Those outlive the
// request, and the engine only fetches hosts on its allow-list. So the address is a named default
// with a row over it (the owner, 2026-09-06: "have it a base config item - so its easy to change
// later"), and the request origin survives only as the last resort.
import type { Db } from './database.types';
import { HUB_ORIGIN } from '$lib/addresses';

export interface Site {
  name: string;
  /** Absolute, no trailing slash. Always usable for building canonical and og: urls. */
  url: string;
}

export const DEFAULT_SITE_NAME = 'StarSystemX Explorers';

export async function loadSite(sb: Db, requestUrl: URL): Promise<Site> {
  let name = DEFAULT_SITE_NAME;
  let url = '';

  try {
    const { data } = await sb.from('config').select('key, value').in('key', ['site_name', 'site_url']);
    for (const row of data ?? []) {
      if (row.key === 'site_name' && typeof row.value === 'string' && row.value.trim()) name = row.value.trim();
      if (row.key === 'site_url' && typeof row.value === 'string') url = row.value.trim();
    }
  } catch {
    // A site that cannot read its own name should still render. Names are not a control surface.
  }

  return { name, url: normalise(url) || normalise(HUB_ORIGIN) || requestUrl.origin };
}

/** Absolute, http(s) only, no trailing slash. A malformed row falls back rather than breaking every page. */
function normalise(value: string): string {
  if (!value) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

/** Build an absolute URL for a path. Open Graph ignores relative ones. */
export const absolute = (site: Site, path: string) =>
  site.url + (path.startsWith('/') ? path : '/' + path);
