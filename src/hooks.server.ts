// Resolve the viewer once per request. Everything else reads `locals.viewer`.
import type { Handle } from '@sveltejs/kit';
import { db, authClient } from '$lib/server/db';
import { viewerFromToken } from '$lib/server/auth';
import { creatorForToken } from '$lib/server/devicePairing';
import { ACCESS_COOKIE, REFRESH_COOKIE, setSession, clearSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.viewer = null;

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

  return resolve(event);
};
