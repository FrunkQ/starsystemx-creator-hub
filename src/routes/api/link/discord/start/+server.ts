// Begin linking a Discord account.
//
// The `state` parameter is CSRF protection, not decoration: without it, an attacker can complete
// an OAuth flow in a victim's browser and link THEIR Discord account to the victim's hub account.
// A random value goes into a short-lived, httpOnly cookie and must come back unchanged.
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { authorizeUrl } from '$lib/server/integrations/discord';
import { mayContribute } from '$lib/server/auth';

export const GET: RequestHandler = async ({ platform, locals, cookies, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!mayContribute(locals.viewer)) throw error(401, 'Sign in first.');

  const gates = await loadGates(db(env));
  if (!gates.discord_enabled) throw error(404, 'Not found');

  const clientId = (env as unknown as { DISCORD_CLIENT_ID?: string }).DISCORD_CLIENT_ID;
  if (!clientId) throw error(503, 'Discord linking is not configured yet.');

  const state = crypto.randomUUID();
  cookies.set('discord_oauth_state', state, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600
  });

  redirect(302, authorizeUrl(clientId, url.origin + '/api/link/discord/callback', state));
};
