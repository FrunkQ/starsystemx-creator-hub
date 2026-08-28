// Resolve the viewer once per request. Everything else reads `locals.viewer`.
import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { viewerFromToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.viewer = null;

  const env = event.platform?.env;
  if (env?.SUPABASE_URL) {
    const auth = event.request.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : event.cookies.get('sb-access-token') ?? null;
    if (token) {
      try {
        event.locals.viewer = await viewerFromToken(db(env), token);
      } catch {
        event.locals.viewer = null; // a bad token is a signed-out visitor, not an error page
      }
    }
  }

  return resolve(event);
};
