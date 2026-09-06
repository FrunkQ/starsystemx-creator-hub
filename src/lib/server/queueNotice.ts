// "SOMETHING IS WAITING FOR YOU" (D-49). The nudge that makes a review queue get read.
//
// ============================================================================================
// The owner, 2026-09-06: *"i can start getting mails to approve stuff."* The queues have always
// been visible - a number circle in the banner (D-38) - but only to somebody already looking at
// the site, and a queue is read when it comes to you rather than when you remember it.
//
// THREE RULES, and each one is about not becoming noise:
//
//   1. IT ONLY WRITES WHEN SOMETHING IS ACTUALLY WAITING. An empty queue sends nothing. A mail
//      that arrives to say "nothing to do" teaches you to filter the sender.
//   2. AT MOST ONE EVERY SIX HOURS, through the outbox's own dedupe key - four a day at the very
//      worst, and only on days when there is work. No new table, no "last sent" column: the key IS
//      the record, which is what the outbox was built for.
//   3. IT WAITS FOR THE WORK TO SETTLE. A picture uploaded a minute ago is not a backlog; the
//      admin who is about to look at it does not need telling. Nothing under `SETTLE_MINUTES` old
//      counts toward the nudge.
//
// It rides the same cron as everything else (worker/index.mjs, every fifteen minutes), so there is
// no new schedule and no new secret.
// ============================================================================================
import type { Db } from './database.types';
import type { Gates } from './config';
import { enqueue } from './integrations/outbox';
import { mailReady, adminAddresses, type MailSecrets } from './mail';

/** Work younger than this is not a backlog, it is something that just happened. */
const SETTLE_MINUTES = 30;
/** One nudge per six-hour bucket, enforced by the outbox's unique dedupe key. */
const BUCKET_HOURS = 6;

export interface Waiting {
  pictures: number;
  tags: number;
  reports: number;
}

/** What has been waiting long enough to be worth telling somebody about. */
export async function waitingWork(sb: Db): Promise<Waiting> {
  const since = new Date(Date.now() - SETTLE_MINUTES * 60_000).toISOString();
  const [pictures, tags, reports] = await Promise.all([
    count(sb, 'assets', (q: any) => q.eq('review_state', 'novel').lt('first_seen_at', since)),
    count(sb, 'tag_proposals', (q: any) => q.eq('state', 'pending').lt('created_at', since)),
    count(sb, 'reports', (q: any) => q.eq('state', 'open').lt('created_at', since))
  ]);
  return { pictures, tags, reports };
}

async function count(sb: Db, table: string, where: (q: any) => any): Promise<number> {
  try {
    const { count: n, error } = await where((sb as any).from(table).select('*', { count: 'exact', head: true }));
    return error || typeof n !== 'number' ? 0 : n;
  } catch {
    return 0;
  }
}

/** The bucket a moment falls in. Exported so a test can name one rather than wait six hours. */
export const bucketOf = (at: Date): string =>
  at.toISOString().slice(0, 10) + ':' + Math.floor(at.getUTCHours() / BUCKET_HOURS);

/** Plain words. A count with no noun is a puzzle, and this arrives in a mail client, not a table. */
export function noticeText(waiting: Waiting, siteUrl: string): { subject: string; text: string } {
  const parts: string[] = [];
  if (waiting.pictures) parts.push(waiting.pictures + (waiting.pictures === 1 ? ' picture' : ' pictures') + ' to review');
  if (waiting.tags) parts.push(waiting.tags + (waiting.tags === 1 ? ' tag' : ' tags') + ' to look at');
  if (waiting.reports) parts.push(waiting.reports + (waiting.reports === 1 ? ' report' : ' reports') + ' still open');
  const summary = parts.join(', ');
  return {
    subject: 'Waiting on the hub: ' + summary,
    text: [
      summary + '.',
      '',
      waiting.pictures ? siteUrl + '/admin/review' : '',
      waiting.tags ? siteUrl + '/admin/tags' : '',
      waiting.reports ? siteUrl + '/admin/reports' : '',
      '',
      '--',
      'Sent at most once every ' + BUCKET_HOURS + ' hours, and only when something has been waiting',
      'more than ' + SETTLE_MINUTES + ' minutes.'
    ].filter((l) => l !== '').join('\n')
  };
}

/**
 * Queue a nudge if one is due. Returns what it decided, so the cron's report says so out loud.
 *
 * NEVER THROWS: this runs inside the outbox drain, and a queue nudge that broke the drain would
 * take the Discord posts down with it.
 */
export async function queueNotice(
  env: MailSecrets, sb: Db, gates: Gates, siteUrl: string
): Promise<{ sent: boolean; reason: string }> {
  try {
    if (!mailReady(env as MailSecrets & { RESEND_API_KEY?: string }, gates)) {
      return { sent: false, reason: 'mail is not configured' };
    }
    const to = await adminAddresses(sb, gates);
    if (!to.length) return { sent: false, reason: 'there is no admin address to write to' };
    const waiting = await waitingWork(sb);
    if (!waiting.pictures && !waiting.tags && !waiting.reports) {
      return { sent: false, reason: 'nothing is waiting' };
    }
    const { subject, text } = noticeText(waiting, siteUrl);
    // One intent per ADMIN per bucket: two admins both hear, and neither hears twice.
    for (const address of to) {
      await enqueue(sb, {
        kind: 'mail.queue',
        creatorId: null,
        payload: { to: address, subject, text },
        // The dedupe key IS the rate limit: a second nudge in the same six-hour bucket is refused.
        dedupeKey: 'queue:' + bucketOf(new Date()) + ':' + address
      });
    }
    return { sent: true, reason: subject };
  } catch (e) {
    return { sent: false, reason: 'could not check: ' + ((e as Error)?.message ?? String(e)) };
  }
}
