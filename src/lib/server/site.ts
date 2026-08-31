// Who the site says it is, and where it says it lives.
//
// Both are config rows because the hub is going to move hosts more than once. The name shows in
// titles; the URL is what makes Open Graph previews work.
//
// THE FALLBACK IS THE IMPORTANT PART: with `site_url` unset, the request's own origin is used. That
// means the hub is correct on workers.dev, on a custom domain, and on localhost with no
// configuration whatsoever - and setting the row only becomes necessary when you want previews
// pinned to a canonical host that differs from the one being served.
import type { Db } from './database.types';

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

  return { name, url: normalise(url) || requestUrl.origin };
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
