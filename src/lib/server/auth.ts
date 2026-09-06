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
  state: 'active' | 'suspended' | 'banned';
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

/** A suspended or banned creator may still read; they may not upload, heart or report. */
export function mayContribute(v: Viewer | null): boolean {
  return !!v && v.state === 'active';
}
