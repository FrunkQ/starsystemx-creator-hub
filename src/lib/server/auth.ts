// THREE ROLES (design 6.7, and D-39). `user`, `moderator`, `admin`. The first version of this file
// said a moderator tier was "easy to add later and pointless before there is a queue worth
// sharing" - which held until 2026-09-06, when the owner had both a queue and somebody to give it
// to. It was indeed easy: an enum value (migration 0028), `isStaff` below, and the tier already
// declared on every admin area in `src/lib/adminNav.ts`.
//
// THE LINE BETWEEN THE TWO STAFF ROLES, in one sentence: a moderator judges CONTENT, and everything
// they can do can be undone. Ending an account, changing a gate, reading raw debug uploads and
// taking backups are the owner's.
import type { Db } from './database.types';

export type Role = 'user' | 'moderator' | 'admin';

export interface Viewer {
  id: string;
  handle: string;
  role: Role;
  /**
   * `pending` until the email is confirmed (0035, D-67). It is NOT a punishment and not the same
   * thing as suspended: a suspended account did something, a pending one has done nothing yet.
   */
  state: 'pending' | 'active' | 'suspended' | 'banned';
  /**
   * When they last looked at the comments on their maps (D-33). Carried on the viewer because the
   * chrome puts a number circle on their own name, and this row is already being read - one more
   * column on a query that happens anyway, rather than a second query on every page.
   */
  comments_seen_at?: string | null;
}

/** Resolve the signed-in creator from a Supabase access token. Null when signed out. */
export async function viewerFromToken(sb: Db, token: string | null): Promise<Viewer | null> {
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await sb.from('creators')
    .select('id, handle, role, state, comments_seen_at').eq('id', data.user.id).maybeSingle();
  return (row as Viewer) ?? null;
}

export function requireAdmin(v: Viewer | null): Viewer {
  if (!v || v.role !== 'admin') throw new Error('admin only');
  return v;
}

/**
 * Staff: a moderator or an admin. What the moderation pages ask for.
 *
 * A TYPE PREDICATE, not a boolean, because it replaced `viewer?.role !== 'admin'` at every guard
 * and that comparison was also doing the null check for the rest of the function. A helper that
 * loses the narrowing turns one clear guard into a page full of `!`.
 */
export function isStaff<T extends { role?: string }>(v: T | null | undefined): v is T {
  return v?.role === 'admin' || v?.role === 'moderator';
}

/** The owner. What the config, the usage, the backups and the debug uploads ask for. */
export function isAdmin<T extends { role?: string }>(v: T | null | undefined): v is T {
  return v?.role === 'admin';
}

/**
 * A suspended, banned or UNCONFIRMED creator may still read; they may not upload, heart or report.
 *
 * This one line is the whole of D-67's enforcement, and that is not luck - it has always been
 * `state === 'active'` and every upload, comment, star, report and Discord link already asks it. A
 * fourth state therefore needed no new guard anywhere; what it needed was `whyNotContributing`.
 */
export function mayContribute(v: Viewer | null): boolean {
  return !!v && v.state === 'active';
}

/**
 * WHY THEY CANNOT, in words for the person reading it - or null when they can.
 *
 * ONE SENTENCE IN ONE PLACE, because there are six guards and the owner's rule is that a control
 * which will not do the thing says so where it is: *"if you click a button and it wont do the thing
 * you expect it should tell you there."* Before this, every one of those guards said "Sign in to
 * share a map" - which is actively misleading to somebody who IS signed in and is waiting on an
 * email, and which would have been the first thing anybody hit after joining.
 *
 * Deliberately says nothing about suspension beyond the fact of it: the reason is a matter between
 * that person and whoever suspended them, and an API response is not where that conversation goes.
 */
export function whyNotContributing(v: Viewer | null): string | null {
  if (!v) return 'Sign in first.';
  switch (v.state) {
    case 'active': return null;
    case 'pending':
      return 'Confirm your email first - we sent you a link when you joined. '
        + 'You can send yourself a fresh one from your account page.';
    default:
      return 'This account cannot do that at the moment.';
  }
}
