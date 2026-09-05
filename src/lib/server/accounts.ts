// What can be done to a person and their things, in one place (D-28) - used by the admin's
// explorer page and, for deletion, by the person themselves from their account page.
//
// The terms say it: "content can be removed and accounts suspended or banned at our discretion...
// we will usually say why, because that is decent." Every operation here takes a note that is
// stored where the person will read it, and every one is audited (design 6.7).
import type { Db, CreatorState } from './database.types';
import type { HubEnv } from './db';
import type { Gates } from './config';
import * as audit from './audit';
import * as r2 from './r2';
import { tolerantWrite } from './tolerant';
import * as badges from './integrations/badges';

/** Every live comment by one person, taken down at once. Soft, exactly like a single removal. */
export async function removeAllComments(sb: Db, actorId: string, creatorId: string, note: string | null): Promise<number> {
  const { data, error } = await sb.from('comments')
    .update({ removed_at: new Date().toISOString(), removed_by: actorId, removed_reason: 'admin' })
    .eq('creator_id', creatorId).is('removed_at', null).select('id');
  if (error) throw new Error('could not remove the comments: ' + error.message);
  const n = data?.length ?? 0;
  await audit.record(sb, actorId, 'comments.remove-all', 'creator:' + creatorId, note ?? undefined, { removed: n });
  return n;
}

/**
 * Suspend, ban or reinstate. A suspended or banned account can still sign in and read; it cannot
 * upload, star, comment or report (auth.ts `mayContribute`). Its maps stay up unless taken down
 * separately - a ban is about the person, a takedown about the thing.
 */
export async function setCreatorState(
  sb: Db, actorId: string, creatorId: string, state: CreatorState, note: string | null
): Promise<void> {
  const { error } = await tolerantWrite(
    { state, state_note: state === 'active' ? null : note },
    async (row) => sb.from('creators').update(row).eq('id', creatorId)
  );
  if (error) throw new Error('could not change the account: ' + error.message);
  await audit.record(sb, actorId, 'creator.' + state, 'creator:' + creatorId, note ?? undefined);
}

/** A map taken down by the hub: a 404 to everyone, the reason on its manage page, no republish. */
export async function takeDownSystem(
  sb: Db, gates: Gates, actorId: string, system: { id: string; creator_id: string }, note: string | null
): Promise<void> {
  const { error } = await tolerantWrite(
    { state: 'removed' as const, state_note: note },
    async (row) => sb.from('systems').update(row).eq('id', system.id)
  );
  if (error) throw new Error('could not take the map down: ' + error.message);
  await audit.record(sb, actorId, 'system.takedown', 'system:' + system.id, note ?? undefined);
  // A badge is lost when the thing that earned it goes away.
  await badges.reconcile(sb, gates, system.creator_id);
}

/** The reverse: back to public. (What it was before is not kept; public is what a takedown was about.) */
export async function restoreSystem(
  sb: Db, gates: Gates, actorId: string, system: { id: string; creator_id: string }
): Promise<void> {
  const { error } = await tolerantWrite(
    { state: 'public' as const, state_note: null },
    async (row) => sb.from('systems').update(row).eq('id', system.id)
  );
  if (error) throw new Error('could not restore the map: ' + error.message);
  await audit.record(sb, actorId, 'system.restore', 'system:' + system.id);
  await badges.reconcile(sb, gates, system.creator_id);
}

export interface DeletionReport {
  maps: number;
  /** Assets whose bytes were freed because no other map referenced them. */
  freed: number;
  /** False when the Supabase auth user could not be removed: finish that by hand, by id. */
  signInDeleted: boolean;
}

/**
 * Delete an account: the row and everything that cascades from it (maps and their rows, stars,
 * reports, tokens, badges), the sign-in, and the bytes nobody references any more.
 *
 * COMMENTS ARE THE PERSON'S CHOICE (0022): removed for good, or kept and shown as a former
 * explorer's. VERDICTS ARE NOT: a banned picture stays banned after its uploader is gone (r2.ts).
 *
 * Order matters. Rows first: if the sign-in cannot be deleted afterwards, nothing is half-done -
 * the person is simply a sign-in with no account, which the login flow treats as new, and the
 * report says so. The other way round would leave rows that no page can reach.
 */
export async function deleteCreator(
  env: HubEnv, sb: Db,
  who: { id: string; handle: string },
  opts: { removeComments: boolean; actorId: string | null; note?: string }
): Promise<DeletionReport> {
  // What will need cleaning up in R2 once the rows are gone.
  const { data: mine } = await sb.from('systems').select('id, cover_sha256').eq('creator_id', who.id);
  const ids = (mine ?? []).map((m) => m.id);
  const hashes = new Set<string>((mine ?? []).flatMap((m) => (m.cover_sha256 ? [m.cover_sha256] : [])));
  if (ids.length) {
    const [{ data: linked }, { data: shots }] = await Promise.all([
      sb.from('system_assets').select('sha256').in('system_id', ids),
      sb.from('system_screenshots').select('sha256').in('system_id', ids)
    ]);
    for (const a of linked ?? []) hashes.add(a.sha256 as string);
    for (const s of shots ?? []) hashes.add(s.sha256 as string);
  }

  if (opts.removeComments) {
    const { error } = await sb.from('comments').delete().eq('creator_id', who.id);
    if (error) throw new Error('could not delete the comments: ' + error.message);
  }

  const { error: rowErr } = await sb.from('creators').delete().eq('id', who.id);
  if (rowErr) throw new Error('could not delete the account: ' + rowErr.message);

  const { error: authErr } = await sb.auth.admin.deleteUser(who.id);
  const signInDeleted = !authErr || /not found/i.test(authErr.message);
  if (!signInDeleted) console.error('SIGN-IN NOT DELETED', who.id, authErr?.message);

  for (const id of ids) await env.HUB_BUNDLES.delete(r2.bundleKey(id));
  let freed = 0;
  for (const h of hashes) {
    try { if (await r2.deleteIfUnreferenced(env, sb, h)) freed++; }
    catch (e) { console.warn('asset not freed', h, e); }
  }

  // The id is gone from `creators`, so the handle goes in the detail - and the actor is null when
  // the person deleted themselves, because a foreign key cannot point at a row that no longer exists.
  await audit.record(sb, opts.actorId, 'creator.delete', 'creator:' + who.id, opts.note,
    { handle: who.handle, maps: ids.length, removeComments: opts.removeComments, freed, signInDeleted });

  return { maps: ids.length, freed, signInDeleted };
}
