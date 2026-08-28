// Discord: identity in, badges out.
//
// TWO SEPARATE THINGS, and only one of them is the hub's job.
//
//   IDENTITY (in)  "Sign in with Discord" / link an existing hub account to a Discord user.
//                  OAuth2, `identify` scope only. No guild management needed for this.
//
//   BADGES (out)   The hub assigns a role in the community server when someone earns it here -
//                  published their first map, and so on. THIS IS THE PART ONLY THE HUB CAN DO,
//                  because neither Patreon nor Discord knows anything about published maps.
//
// WHAT NOT TO BUILD: Patreon has its own native Discord integration that assigns supporter roles
// directly from a pledge. If the hub also mirrors the Pro tier into a Discord role, two systems
// own the same role and they will disagree - usually at cancellation, which is the worst moment.
// `discord_role_pro` exists in config but should stay blank unless the owner deliberately wants
// the hub to own it. See docs/integrations.md.
//
// EVERYTHING HERE IS INERT until `discord_enabled` is true and the secrets are set.
import type { Db } from './../database.types';
import type { Gates } from './../config';

const API = 'https://discord.com/api/v10';

export interface DiscordSecrets {
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  /** A bot token, needed only for the outbound role assignment - not for sign-in. */
  DISCORD_BOT_TOKEN?: string;
}

export interface DiscordSettings {
  enabled: boolean;
  guildId: string;
  roleCreator: string;
  rolePro: string;
}

export function settingsFrom(gates: Gates): DiscordSettings {
  return {
    enabled: gates.discord_enabled,
    guildId: gates.discord_guild_id,
    roleCreator: gates.discord_role_creator,
    rolePro: gates.discord_role_pro
  };
}

// --- identity ---------------------------------------------------------------------------------

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // `identify` alone. Ask for the narrowest scope that does the job: a link that can read a
    // person's email or servers is a link that has to be explained, and it does not need to.
    scope: 'identify',
    state
  });
  return 'https://discord.com/oauth2/authorize?' + p.toString();
}

export interface DiscordUser {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export async function exchangeCode(
  secrets: DiscordSecrets, code: string, redirectUri: string
): Promise<{ user: DiscordUser; refreshToken: string | null }> {
  if (!secrets.DISCORD_CLIENT_ID || !secrets.DISCORD_CLIENT_SECRET) {
    throw new Error('Discord is not configured');
  }

  const res = await fetch(API + '/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secrets.DISCORD_CLIENT_ID,
      client_secret: secrets.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) throw new Error('Discord rejected the sign-in (' + res.status + ')');

  const token = (await res.json()) as { access_token: string; refresh_token?: string };

  const me = await fetch(API + '/users/@me', {
    headers: { authorization: 'Bearer ' + token.access_token }
  });
  if (!me.ok) throw new Error('Could not read the Discord account (' + me.status + ')');

  const u = (await me.json()) as { id: string; username: string; avatar: string | null };
  return {
    user: {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatar ? 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + '.png' : null
    },
    refreshToken: token.refresh_token ?? null
  };
}

export async function linkIdentity(
  sb: Db, creatorId: string, user: DiscordUser, refreshToken: string | null
): Promise<void> {
  // The unique index on (provider, provider_user_id) is what stops one Discord account being
  // linked to several hub accounts - which, once a tier is attached to a link, would be one pledge
  // buying Pro for a dozen accounts.
  const { error } = await sb.from('creator_identities').upsert({
    creator_id: creatorId,
    provider: 'discord',
    provider_user_id: user.id,
    handle: user.username,
    avatar_url: user.avatarUrl,
    refresh_token: refreshToken,
    scopes: ['identify'],
    last_synced_at: new Date().toISOString()
  }, { onConflict: 'creator_id,provider' });
  if (error) throw new Error('could not link that Discord account: ' + error.message);
}

// --- badges out ---------------------------------------------------------------------------------

/** Deliver one queued role change. Called by the outbox drain, never from a page request. */
export async function applyRole(
  secrets: DiscordSecrets, settings: DiscordSettings,
  op: 'add' | 'remove', discordUserId: string, roleId: string
): Promise<void> {
  if (!settings.enabled) throw new Error('Discord integration is off');
  if (!secrets.DISCORD_BOT_TOKEN) throw new Error('no bot token');
  if (!settings.guildId || !roleId) throw new Error('guild or role not configured');

  const url = API + '/guilds/' + settings.guildId + '/members/' + discordUserId + '/roles/' + roleId;
  const res = await fetch(url, {
    method: op === 'add' ? 'PUT' : 'DELETE',
    headers: {
      authorization: 'Bot ' + secrets.DISCORD_BOT_TOKEN,
      'x-audit-log-reason': 'StarSystemX Creator Hub'
    }
  });

  // 404 on remove means they already do not have it, or have left the server. That is the desired
  // end state, so treat it as success rather than retrying forever against someone who left.
  if (res.status === 404 && op === 'remove') return;
  if (!res.ok) throw new Error('Discord role ' + op + ' failed (' + res.status + ')');
}
