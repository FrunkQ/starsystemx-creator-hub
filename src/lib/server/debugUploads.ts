// Admin-issued one-shot upload links, for collecting a broken save from a user.
//
// See db/migrations/0013 for why this bypasses the whole pipeline and what bounds it instead.
// The short version: a file that crashes the parser can only be collected by a path that does not
// parse it - so nothing here reads, hashes, indexes or publishes anything. It stores bytes.
import type { Db } from './database.types';
import { sha256Hex } from '$lib/bundle/hash';
import { savedFileName } from '$lib/bundle/contract';
import type { HubEnv } from './db';
import * as r2 from './r2';

const enc = new TextEncoder();

export const debugKey = (id: string) => 'debug/' + id;

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a link.
 *
 * THE TOKEN IS STORED AS WELL AS HASHED (0038, D-74), so an admin can copy it again while the link
 * is still live. Lookup is unchanged and still goes through `token_hash`; the plaintext is there to
 * show the person who is about to send it. It is CLEARED the moment the link is spent.
 */
export async function createInvite(
  sb: Db, adminId: string, note: string, ttlHours: number
): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const { error } = await sb.from('debug_invites').insert({
    id,
    token_hash: await sha256Hex(enc.encode(token)),
    token,
    created_by: adminId,
    note: note.slice(0, 200) || null,
    expires_at: expiresAt
  });
  if (error) throw new Error('could not create a debug link: ' + error.message);
  return { id, token, expiresAt };
}

/** The invite behind a token, if it is still usable. Null for unknown, expired or already used. */
export async function usableInvite(sb: Db, token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await sb.from('debug_invites')
    .select('id, note, expires_at, used_at')
    .eq('token_hash', await sha256Hex(enc.encode(token)))
    .maybeSingle();

  // Unknown, spent and expired are ONE answer. Distinguishing them tells a guesser when they have
  // found something real, which is the only thing guessing could achieve.
  if (!data || data.used_at || Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}

/**
 * Store the file and spend the link.
 *
 * The bytes are written to R2 under `debug/` and NOTHING else happens to them - no parse, no hash
 * into the asset ledger, no facets, no queue. They are evidence, not content.
 */
export async function acceptUpload(
  env: HubEnv, sb: Db,
  invite: { id: string }, filename: string, note: string, bytes: Uint8Array
): Promise<void> {
  const id = crypto.randomUUID();

  await env.HUB_BUNDLES.put(debugKey(id), bytes as unknown as ArrayBuffer, {
    httpMetadata: { contentType: 'application/octet-stream' }
  });

  const { error } = await sb.from('debug_uploads').insert({
    id,
    invite_id: invite.id,
    filename: filename.slice(0, 200) || 'upload',
    byte_size: bytes.length,
    user_note: note.slice(0, 1000) || null,
    storage_key: debugKey(id)
  });
  if (error) throw new Error('could not record that upload: ' + error.message);

  // Spend the link only AFTER the file is safely stored, or a failed write would burn it and the
  // person would have nothing to try again with.
  // Spent, and the token goes with it (D-74). A dead link that still shows a token invites somebody
  // to try it, and one write does both so the two can never disagree.
  await sb.from('debug_invites')
    .update({ used_at: new Date().toISOString(), token: null }).eq('id', invite.id);
}

/**
 * Push a PUBLISHED map into the debug store for diagnosis (D-81).
 *
 * ============================================================================================
 * The owner: *"Be able to push from 'main site' into Debug if there is a problem with it."*
 *
 * It is the same destination as a one-shot link, reached from the other side. A link is for a file
 * the hub does not have; this is for one it already stores and somebody has just found fault with -
 * usually a map that has been put on hold (D-79), where the next question is "what is actually
 * wrong with it" and the file is right there.
 *
 * NO INVITE ROW. `invite_id` is nullable and stays null: nothing was sent to anybody and no link
 * was spent, so inventing an invite to satisfy a foreign key would put a fiction in the record of
 * how a file arrived. A null there means exactly what it should - this one came from inside.
 *
 * THE BYTES ARE COPIED, NOT REFERENCED. The debug store's whole promise is that what a diagnostician
 * looks at is what arrived, and it is deleted on its own schedule (30 days). Pointing at the live
 * bundle instead would mean the evidence changed the moment the creator uploaded a new version -
 * which is precisely when somebody is most likely to be looking at it.
 * ============================================================================================
 */
export async function pushMapToDebug(
  env: HubEnv, sb: Db, systemId: string, slug: string, note: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const stored = await r2.getBundle(env, systemId);
  if (!stored) return { ok: false, message: 'The stored file for that map is missing.' };

  const bytes = new Uint8Array(await stored.arrayBuffer());
  const id = crypto.randomUUID();

  await env.HUB_BUNDLES.put(debugKey(id), bytes as unknown as ArrayBuffer, {
    httpMetadata: { contentType: 'application/octet-stream' }
  });

  const { error } = await sb.from('debug_uploads').insert({
    id,
    invite_id: null,
    // From the bytes, not assumed (D-83): a map saved without pictures is a bare .json.
    filename: savedFileName(slug, bytes),
    byte_size: bytes.length,
    user_note: note.slice(0, 1000) || null,
    storage_key: debugKey(id)
  });
  if (error) return { ok: false, message: 'could not record it: ' + error.message };

  return { ok: true, id };
}
