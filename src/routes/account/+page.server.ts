import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!locals.viewer) throw error(401, 'Sign in first.');

  const sb = db(env);
  const gates = await loadGates(sb);

  const [{ data: me }, { data: identities }, { data: badgeRows }, { data: mine }, { data: grants }] =
    await Promise.all([
      sb.from('creators').select('handle, display_name, account_tier').eq('id', locals.viewer.id).maybeSingle(),
      // NOTE the columns: never select refresh_token into a page load.
      sb.from('creator_identities').select('provider, handle, linked_at').eq('creator_id', locals.viewer.id),
      sb.from('creator_badges').select('badge, earned_at').eq('creator_id', locals.viewer.id),
      sb.from('systems').select('id, slug, title, state, hearts_count, download_count')
        .eq('creator_id', locals.viewer.id).order('updated_at', { ascending: false }),
      sb.from('entitlements').select('source, tier, expires_at, granted_at')
        .eq('creator_id', locals.viewer.id).is('revoked_at', null)
    ]);

  // Connected apps. NEVER select token_hash - nothing needs it and a page payload is serialised.
  const { data: tokens } = await sb.from('app_tokens')
    .select('id, name, created_at, last_used_at')
    .eq('creator_id', locals.viewer.id).is('revoked_at', null)
    .order('created_at', { ascending: false });

  return {
    me,
    identities: identities ?? [],
    badges: (badgeRows ?? []).map((b) => b.badge),
    systems: mine ?? [],
    grants: grants ?? [],
    tokens: tokens ?? [],
    integrations: { discord: gates.discord_enabled, patreon: gates.patreon_enabled }
  };
};

export const actions: Actions = {
  revokeToken: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const id = String((await request.formData()).get('id') ?? '');
    // Scoped to the owner: a token id is not a capability to revoke somebody else's.
    await db(env).from('app_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id).eq('creator_id', locals.viewer.id);
    return { revoked: true };
  }
};
