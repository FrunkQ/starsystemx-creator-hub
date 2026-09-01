// Resolve the viewer once per request. Everything else reads `locals.viewer`.
import type { Handle } from '@sveltejs/kit';
import { db, authClient } from '$lib/server/db';
import { viewerFromToken } from '$lib/server/auth';
import { creatorForToken } from '$lib/server/devicePairing';
import { ACCESS_COOKIE, REFRESH_COOKIE, setSession, clearSession } from '$lib/server/session';
import { PUBLIC_CORS, preflight } from '$lib/server/cors';

/**
 * The endpoints the SSE app reaches CROSS-ORIGIN. All public, all uncredentialed.
 *
 * Matched here rather than per-route because a `throw error(404)` never reaches the route's own
 * header code - so a missing map would answer with no CORS headers at all, and the app would see an
 * indistinguishable-from-offline failure instead of a clean 404. Handling it in one place covers
 * the error paths, which are exactly the ones a client most needs to be able to read.
 */
function isPublicApi(pathname: string): boolean {
  return pathname === '/api/attestation'
    || pathname === '/api/maps'
    || pathname.startsWith('/api/maps/')
    || pathname.startsWith('/api/download/')
    || pathname.startsWith('/asset/');
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.viewer = null;

  // Preflight, before anything else touches the request.
  if (event.request.method === 'OPTIONS' && isPublicApi(event.url.pathname)) return preflight();

  const env = event.platform?.env;
  if (!env?.SUPABASE_URL) return resolve(event);

  const sb = db(env);
  const access = event.request.headers.get('authorization')?.replace(/^Bearer /, '')
    ?? event.cookies.get(ACCESS_COOKIE)
    ?? null;

  if (access) {
    try {
      event.locals.viewer = await viewerFromToken(sb, access);
    } catch {
      event.locals.viewer = null; // a bad token is a signed-out visitor, not an error page
    }

    // AN APP TOKEN, from device pairing. Tried only after a Supabase session fails, so a browser
    // session is never confused for one. Deliberately narrower: it identifies a creator to publish
    // AS, and carries none of a session's power over the account itself.
    if (!event.locals.viewer) {
      try {
        const creatorId = await creatorForToken(sb, access);
        if (creatorId) {
          const { data } = await sb.from('creators')
            .select('id, handle, role, state').eq('id', creatorId).maybeSingle();
          event.locals.viewer = data ?? null;
        }
      } catch {
        event.locals.viewer = null;
      }
    }
  }

  // THE REFRESH. An access token lasts an hour; exchanging a stale one is the difference between a
  // usable admin tool and one that signs you out halfway through a review pass.
  const refresh = event.cookies.get(REFRESH_COOKIE);
  if (!event.locals.viewer && refresh && env.SUPABASE_PUBLISHABLE_KEY) {
    try {
      const { data, error } = await authClient(env).auth.refreshSession({ refresh_token: refresh });
      if (!error && data.session) {
        setSession(event.cookies, data.session.access_token, data.session.refresh_token, {
          secure: event.url.protocol === 'https:'
        });
        event.locals.viewer = await viewerFromToken(sb, data.session.access_token);
      } else {
        // The refresh token is spent or revoked. Clear both rather than retrying it on every
        // request for the next month.
        clearSession(event.cookies);
      }
    } catch {
      clearSession(event.cookies);
    }
  }

  const response = await resolve(event);

  // Applied to the RESPONSE, so errors carry it too. Never applied to anything that reads
  // `locals.viewer` - upload, review, admin and the private asset route stay same-origin only.
  //
  // A CLONE, not `response.headers.set(...)`. On Workers a Response coming back from `resolve()`
  // can carry IMMUTABLE headers, and mutating those fails SILENTLY - the call returns, nothing
  // throws, and the header simply is not there. Measured against the live deploy: the first
  // version of this did nothing at all. Rebuilding the response is the only reliable way.
  if (isPublicApi(event.url.pathname)) {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(PUBLIC_CORS)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return response;
};
