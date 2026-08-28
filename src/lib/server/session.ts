// The session cookies, and the refresh that makes them usable.
//
// WHY A REFRESH PATH EXISTS AT ALL. A Supabase access token lasts an hour. Without refresh, an
// admin clearing a review queue gets signed out mid-pass and loses their place - which is exactly
// the friction that makes a moderation queue stop being cleared. So both tokens are stored, and a
// stale access token is quietly exchanged rather than treated as a logout.
//
// Both cookies are httpOnly: the browser never reads them, only sends them. There is no client-side
// Supabase client in this app at all, so nothing needs script access to a token.
import type { Cookies } from '@sveltejs/kit';

export const ACCESS_COOKIE = 'sb-access-token';
export const REFRESH_COOKIE = 'sb-refresh-token';

interface CookieOpts {
  secure: boolean;
}

export function setSession(
  cookies: Cookies, accessToken: string, refreshToken: string, opts: CookieOpts
): void {
  const base = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: opts.secure
  };
  // The access token is short-lived by design; the refresh token carries the actual session length.
  cookies.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: 60 * 60 });
  cookies.set(REFRESH_COOKIE, refreshToken, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(cookies: Cookies): void {
  cookies.delete(ACCESS_COOKIE, { path: '/' });
  cookies.delete(REFRESH_COOKIE, { path: '/' });
}
