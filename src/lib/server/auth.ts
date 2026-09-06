// Two roles only at launch: `user` and `admin` (design 6.7). A moderator tier is easy to add later
// and pointless before there is a queue worth sharing. The owner is admin.
import type { Db } from './database.types';

export interface Viewer {
  id: string;
  handle: string;
  role: 'user' | 'admin';
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

/** A suspended or banned creator may still read; they may not upload, heart or report. */
export function mayContribute(v: Viewer | null): boolean {
  return !!v && v.state === 'active';
}
