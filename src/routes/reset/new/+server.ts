// Turning the browser's recovery session into the hub's own sign-in cookie (D-68).
//
// The page has just proved possession of a valid recovery token by using it to change a password.
// This takes the resulting Supabase session and sets it the way every other sign-in is set, so the
// rest of the hub - which is server-rendered and reads a cookie - simply works.
//
// THE TOKEN IS VERIFIED, NOT TRUSTED. Anybody can POST a string here, so the access token is handed
// to Supabase and must come back as a real user with a `creators` row before any cookie is written.
// Without that check this endpoint would be a way to mint a session out of nothing.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setSession } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, platform, cookies, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const body = (await request.json().catch(() => null)) as
    { access_token?: unknown; refresh_token?: unknown } | null;
  const access = String(body?.access_token ?? '');
  const refresh = String(body?.refresh_token ?? '');
  if (!access || !refresh) throw error(400, 'no session');

  const sb = db(env);
  const { data, error: authError } = await sb.auth.getUser(access);
  if (authError || !data?.user) throw error(401, 'that session is not valid');

  const { data: creator } = await sb.from('creators')
    .select('id, state').eq('id', data.user.id).maybeSingle();
  if (!creator) throw error(403, 'that account has no profile');
  if (creator.state === 'banned') throw error(403, 'that account cannot sign in');

  // Somebody who can read a mailbox has proved the address as surely as the confirmation link does,
  // so a completed reset finishes a pending account rather than leaving it half-made (D-67).
  if (creator.state === 'pending') {
    await sb.from('creators').update({ state: 'active' }).eq('id', data.user.id);
  }

  setSession(cookies, access, refresh, { secure: url.protocol === 'https:' });
  return json({ ok: true });
};
