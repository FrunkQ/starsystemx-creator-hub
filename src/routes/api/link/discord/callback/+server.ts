// Finish linking a Discord account.
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { exchangeCode, linkIdentity } from '$lib/server/integrations/discord';
import { mayContribute } from '$lib/server/auth';
import * as badges from '$lib/server/integrations/badges';
import * as audit from '$lib/server/audit';

export const GET: RequestHandler = async ({ platform, locals, cookies, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!mayContribute(locals.viewer)) throw error(401, 'Sign in first.');

  const sb = db(env);
  const gates = await loadGates(sb);
  if (!gates.discord_enabled) throw error(404, 'Not found');

  const expected = cookies.get('discord_oauth_state');
  const got = url.searchParams.get('state');
  cookies.delete('discord_oauth_state', { path: '/' });

  // Fail closed on a missing OR mismatched state. Without this the flow can be completed in
  // somebody else's browser and link the wrong account.
  if (!expected || !got || expected !== got) throw error(400, 'That link attempt expired. Please try again.');

  const code = url.searchParams.get('code');
  if (!code) throw error(400, 'Discord did not return a sign-in code.');

  const secrets = env as unknown as {
    DISCORD_CLIENT_ID?: string; DISCORD_CLIENT_SECRET?: string;
  };

  let linked;
  try {
    linked = await exchangeCode(secrets, code, url.origin + '/api/link/discord/callback');
  } catch (e) {
    console.error('discord link failed', e);
    throw error(502, 'Discord could not be reached. Please try again.');
  }

  try {
    await linkIdentity(sb, locals.viewer!.id, linked.user, linked.refreshToken);
  } catch (e) {
    // The unique index on (provider, provider_user_id) fires here when a Discord account is
    // already attached to a different hub account. That is a real answer, not a server error.
    console.error('discord link rejected', e);
    throw error(409, 'That Discord account is already linked to another Creator Hub account.');
  }

  await audit.record(sb, locals.viewer!.id, 'identity.link', 'discord:' + linked.user.id);

  // Newly linked: push any badge they have already earned, rather than making them wait for their
  // next publish to notice.
  await badges.reconcile(sb, gates, locals.viewer!.id);

  redirect(303, '/account?linked=discord');
};
