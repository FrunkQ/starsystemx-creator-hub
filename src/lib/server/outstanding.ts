// HOW MUCH WORK IS WAITING, counted for the chrome.
//
// The owner, 2026-09-06: *"have the report/messages, etc have remainder of outstanding work on
// them (number circles usual)."*
//
// THREE HEAD COUNTS, and they are head counts on purpose: `count: 'exact', head: true` asks
// PostgREST for the number and NO ROWS, so this costs three counts on an indexed predicate rather
// than three lists the nav would throw away. It runs in the ROOT layout load, on every page an
// admin sees, so cheap is the whole specification.
//
// NULL IS NOT ZERO. A count that could not be taken - the table is behind a migration, the
// database is unreachable - returns null and the badge is simply absent. A nav that says "0
// reports" when it does not know is worse than one that says nothing: it is the same shape as the
// truth and it is wrong.
//
// AND IT NEVER THROWS. Every page on the hub renders through this layout. A counting failure that
// took the site down would be an absurd way to lose it.
import type { Db } from './database.types';
import type { AdminCounts } from '$lib/adminNav';
import { EMPTY_COUNTS } from '$lib/adminNav';

export async function outstandingCounts(sb: Db): Promise<AdminCounts> {
  const [review, reports, debug] = await Promise.all([
    // The review queue: exactly `ledger.queue`'s predicate, so the badge and the page agree.
    count(sb, 'assets', (q) => q.eq('review_state', 'novel')),
    count(sb, 'reports', (q) => q.eq('state', 'open')),
    // Debug uploads are DELETED when they have been dealt with, so what is stored is what is left.
    count(sb, 'debug_uploads', (q) => q)
  ]);
  return { review, reports, debug };
}

/**
 * NEW COMMENTS ON YOUR OWN MAPS - the number circle on a signed-in person's own name.
 *
 * This is the hub's only notification while there is no SMTP (D-33), and until now it was only
 * visible by GOING to the account page, which is the one place you do not go to find out whether
 * you need to. Reading it there moves the clock, so the badge clears by being looked at.
 *
 * ONE head count, with an inner join to the maps, so it costs a signed-in page view one query and
 * an anonymous one nothing. Your own comments are not news, and a removed comment is not either.
 */
export async function newCommentsFor(
  sb: Db, creatorId: string, seenAt: string | null | undefined
): Promise<number | null> {
  try {
    let q = (sb as any).from('comments')
      .select('id, systems!inner(creator_id)', { count: 'exact', head: true })
      .eq('systems.creator_id', creatorId)
      .is('removed_at', null)
      .or('creator_id.is.null,creator_id.neq.' + creatorId);
    if (seenAt) q = q.gt('created_at', seenAt);
    const { count: n, error } = await q;
    return error || typeof n !== 'number' ? null : n;
  } catch {
    return null;
  }
}

/** One count, or null. `head: true` returns no rows at all - the number is in the response header. */
async function count(sb: Db, table: string, where: (q: any) => any): Promise<number | null> {
  try {
    const { count: n, error } = await where(
      (sb as any).from(table).select('*', { count: 'exact', head: true })
    );
    return error || typeof n !== 'number' ? null : n;
  } catch {
    return null;
  }
}

export { EMPTY_COUNTS };
