// Admin-issued one-shot upload links, for collecting a broken save from a user.
//
// See db/migrations/0013 for why this bypasses the whole pipeline and what bounds it instead.
// The short version: a file that crashes the parser can only be collected by a path that does not
// parse it - so nothing here reads, hashes, indexes or publishes anything. It stores bytes.
import type { Db } from './database.types';
import { sha256Hex } from '$lib/bundle/hash';
import type { HubEnv } from './db';

const enc = new TextEncoder();

export const debugKey = (id: string) => 'debug/' + id;

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Create a link. Returns the plaintext token ONCE - only its hash is stored. */
export async function createInvite(
  sb: Db, adminId: string, note: string, ttlHours: number
): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const { error } = await sb.from('debug_invites').insert({
    id,
    token_hash: await sha256Hex(enc.encode(token)),
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
  await sb.from('debug_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id);
}
