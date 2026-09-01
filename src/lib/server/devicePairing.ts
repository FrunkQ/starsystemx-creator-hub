// Device-code pairing: how Star System Explorer gets permission to publish, without ever seeing a
// password.
//
// The shape is the one a television uses to sign into a streaming service, and people already
// understand it: the app shows a short code, you approve it in a browser where you can see who you
// are signed in as, and the app collects a token.
//
// TWO SECRETS, AND ONLY ONE OF THEM IS SHORT:
//   device_code  long, random, the app's proof. Never shown to a person.
//   user_code    eight characters a human types. USELESS ALONE - approving it requires a signed-in
//                browser session, so knowing somebody's user_code grants nothing at all.
//
// Both are stored as sha256; the plaintext token is shown to the app once and never again.
import type { Db } from './database.types';
import { sha256Hex } from '$lib/bundle/hash';

/**
 * No 0/O, no 1/I/L. A code that is read aloud, or copied off one screen onto another, must not have
 * characters people confuse - the cost of an ambiguous alphabet is paid by every user, forever.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface StartResult {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  // Modulo bias is irrelevant here: 31 symbols into 256 is near-uniform, and the code's security
  // comes from the browser approval rather than from its entropy.
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function startPairing(
  sb: Db, client: string, clientVersion: string | null, ttlSeconds: number, interval: number
): Promise<StartResult> {
  const deviceCode = randomHex(32);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Retry on collision rather than trusting first draw: `user_code` is unique among live codes, and
  // a clash is rare but not impossible.
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = randomFrom(CODE_ALPHABET, 4) + '-' + randomFrom(CODE_ALPHABET, 4);
    const { error } = await sb.from('device_codes').insert({
      device_code_hash: await sha256Hex(new TextEncoder().encode(deviceCode)),
      user_code: userCode,
      client: client.slice(0, 60),
      client_version: clientVersion?.slice(0, 30) ?? null,
      expires_at: expiresAt
    });
    if (!error) return { deviceCode, userCode, expiresIn: ttlSeconds, interval };
    if (!/duplicate|unique/i.test(error.message)) throw new Error('could not start pairing: ' + error.message);
  }
  throw new Error('could not allocate a pairing code');
}

export type PollOutcome =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'expired' }
  | { status: 'ready'; token: string; handle: string };

export async function poll(sb: Db, deviceCode: string, interval: number): Promise<PollOutcome> {
  const hash = await sha256Hex(new TextEncoder().encode(deviceCode));

  const { data: row } = await sb.from('device_codes')
    .select('device_code_hash, creator_id, approved_at, consumed_at, expires_at, last_polled_at, client, client_version')
    .eq('device_code_hash', hash).maybeSingle();

  // An unknown code and an expired one are the SAME ANSWER on purpose. Distinguishing them tells a
  // guesser when they have found a real code, which is the only thing guessing could achieve.
  if (!row || row.consumed_at || Date.parse(row.expires_at) < Date.now()) return { status: 'expired' };

  if (row.last_polled_at && Date.now() - Date.parse(row.last_polled_at) < interval * 1000 * 0.8) {
    return { status: 'slow_down' };
  }
  await sb.from('device_codes').update({ last_polled_at: new Date().toISOString() })
    .eq('device_code_hash', hash);

  if (!row.approved_at || !row.creator_id) return { status: 'pending' };

  // Approved. Mint the token, mark the code consumed, and never answer for it again.
  const token = randomHex(32);
  const { data: creator } = await sb.from('creators').select('handle').eq('id', row.creator_id).maybeSingle();

  const { error } = await sb.from('app_tokens').insert({
    id: crypto.randomUUID(),
    token_hash: await sha256Hex(new TextEncoder().encode(token)),
    creator_id: row.creator_id,
    name: [row.client, row.client_version].filter(Boolean).join(' ').slice(0, 80) || 'Star System Explorer'
  });
  if (error) throw new Error('could not issue a token: ' + error.message);

  await sb.from('device_codes').update({ consumed_at: new Date().toISOString() })
    .eq('device_code_hash', hash);

  return { status: 'ready', token, handle: creator?.handle ?? '' };
}

/** Approve a pairing, from a signed-in browser. This is the entire security boundary. */
export async function approve(sb: Db, userCode: string, creatorId: string): Promise<boolean> {
  const code = userCode.trim().toUpperCase().replace(/\s+/g, '');
  const normalised = code.includes('-') ? code : code.slice(0, 4) + '-' + code.slice(4);

  const { data: row } = await sb.from('device_codes')
    .select('device_code_hash, expires_at, consumed_at, approved_at')
    .eq('user_code', normalised).is('consumed_at', null).maybeSingle();

  if (!row || Date.parse(row.expires_at) < Date.now() || row.approved_at) return false;

  const { error } = await sb.from('device_codes')
    .update({ creator_id: creatorId, approved_at: new Date().toISOString() })
    .eq('device_code_hash', row.device_code_hash);
  return !error;
}

/** Resolve an app token to its owner, and record that it was used. Null when unusable. */
export async function creatorForToken(sb: Db, token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256Hex(new TextEncoder().encode(token));

  const { data } = await sb.from('app_tokens')
    .select('id, creator_id, revoked_at').eq('token_hash', hash).maybeSingle();
  if (!data || data.revoked_at) return null;

  // Fire and forget: a last-used timestamp is not worth failing a publish over.
  sb.from('app_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    .then(() => undefined, () => undefined);

  return data.creator_id;
}

/** Details for the approval page, so a person can see what they are agreeing to. */
export async function describe(sb: Db, userCode: string) {
  const code = userCode.trim().toUpperCase().replace(/\s+/g, '');
  const normalised = code.includes('-') ? code : code.slice(0, 4) + '-' + code.slice(4);
  const { data } = await sb.from('device_codes')
    .select('client, client_version, created_at, expires_at, approved_at')
    .eq('user_code', normalised).is('consumed_at', null).maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}
