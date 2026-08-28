// Drain the integration outbox.
//
// Deliberately a route rather than a background loop: Workers have no long-lived process, so this
// is driven by a Cloudflare Cron Trigger (see docs/deployment.md) or by an admin pressing a button
// when something looks stuck.
//
// Idempotent, so running it twice is harmless.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import * as outbox from '$lib/server/integrations/outbox';
import { applyRole, settingsFrom } from '$lib/server/integrations/discord';

export const POST: RequestHandler = async ({ platform, locals, request }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  // Either an admin, or the cron secret. The cron has no session, so it needs its own key - and
  // that key is compared in full rather than by prefix.
  const cronKey = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const offered = request.headers.get('x-cron-key');
  const isCron = !!cronKey && !!offered && offered === cronKey;
  if (!isCron && locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const gates = await loadGates(sb);
  const settings = settingsFrom(gates);

  if (!settings.enabled) return json({ ok: true, drained: 0, note: 'discord integration is off' });

  const secrets = env as unknown as { DISCORD_BOT_TOKEN?: string };
  const pending = await outbox.claimPending(sb, 25);

  let sent = 0, failed = 0;
  for (const item of pending) {
    const payload = item.payload as { discordUserId?: string; roleId?: string };
    try {
      if (item.kind === 'discord.role.add' || item.kind === 'discord.role.remove') {
        if (!payload.discordUserId || !payload.roleId) throw new Error('incomplete payload');
        await applyRole(
          secrets, settings,
          item.kind === 'discord.role.add' ? 'add' : 'remove',
          payload.discordUserId, payload.roleId
        );
      } else {
        throw new Error('unknown kind: ' + item.kind);
      }
      await outbox.markSent(sb, item.id);
      sent++;
    } catch (e) {
      await outbox.markFailed(sb, item.id, item.attempts, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  return json({ ok: true, sent, failed, considered: pending.length });
};
