// Delivering what the outbox holds: role changes to the Discord server, maps to the sharing
// channel. Called by the admin's drain route (on a Cron Trigger or a button) and, right after a
// publish, in `waitUntil` so a share lands within seconds without waiting for the cron.
//
// Idempotent: an intent is marked sent only when its delivery succeeded, and a failed one waits
// for the next drain until it has failed enough times to be abandoned (outbox.ts).
import type { Db } from '../database.types';
import type { HubEnv } from '../db';
import type { Gates } from '../config';
import * as outbox from './outbox';
import { applyRole, postShare, settingsFrom } from './discord';
import type { SharePayload } from './share';

export interface DrainReport { considered: number; sent: number; failed: number; skipped: number }

export async function drainOutbox(env: HubEnv, sb: Db, gates: Gates, siteName: string, limit = 25): Promise<DrainReport> {
  const settings = settingsFrom(gates);
  const secrets = env as unknown as { DISCORD_BOT_TOKEN?: string };
  const pending = await outbox.claimPending(sb, limit);

  let sent = 0, failed = 0, skipped = 0;
  for (const item of pending) {
    try {
      if (item.kind === 'discord.role.add' || item.kind === 'discord.role.remove') {
        // Left pending, not failed, while the integration is off: it is waiting, not broken.
        if (!settings.enabled) { skipped++; continue; }
        const p = item.payload as { discordUserId?: string; roleId?: string };
        if (!p.discordUserId || !p.roleId) throw new Error('incomplete payload');
        await applyRole(secrets, settings, item.kind === 'discord.role.add' ? 'add' : 'remove', p.discordUserId, p.roleId);
      } else if (item.kind === 'discord.share') {
        if (!gates.discord_share_webhook) { skipped++; continue; }
        await postShare(gates.discord_share_webhook, item.payload as unknown as SharePayload, siteName);
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
  return { considered: pending.length, sent, failed, skipped };
}
