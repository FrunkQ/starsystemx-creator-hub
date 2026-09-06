// Delivering what the outbox holds: role changes to the Discord server, maps to the sharing
// channel. Called by the admin's drain route (on a Cron Trigger or a button) and, right after a
// publish, in `waitUntil` so a share lands within seconds without waiting for the cron.
//
// Idempotent: an intent is marked sent only when its delivery succeeded, and a failed one waits
// for the next drain until it has failed enough times to be abandoned (outbox.ts).
import type { Db } from '../database.types';
import type { HubEnv } from '../db';
import type { Gates } from '../config';
import { sendMail, mailReady } from '../mail';
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
        // Off, or no webhook: WAITING, not broken - the same rule the role kinds follow. Nothing is
        // queued while the switch is off (share.ts), so this only catches one already in flight.
        if (!gates.discord_share_enabled || !gates.discord_share_webhook) { skipped++; continue; }
        await postShare(gates.discord_share_webhook, item.payload as unknown as SharePayload, siteName);
      } else if (item.kind === 'mail.takedown' || item.kind === 'mail.queue') {
        // Mail the hub sends itself (D-49). Same rule as the Discord kinds: with no key and no
        // from-address it is WAITING, not broken, so it stays pending for the day they are set.
        if (!mailReady(env, gates)) { skipped++; continue; }
        const p = item.payload as { to?: string; subject?: string; text?: string; replyTo?: string };
        if (!p.to || !p.subject || !p.text) throw new Error('incomplete payload');
        const result = await sendMail(env, gates, { to: p.to, subject: p.subject, text: p.text, replyTo: p.replyTo });
        if (!result.ok) throw new Error(result.reason);
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
