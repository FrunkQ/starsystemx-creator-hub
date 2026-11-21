// VERIFYING A STRIPE WEBHOOK (paid packs, PP3).
//
// ============================================================================================
// AN UNVERIFIED PAYMENT WEBHOOK IS A FREE "MARK AS PAID" BUTTON FOR ANYONE WHO FINDS THE URL - the
// Patreon webhook's rule, with money attached. So: the signature is checked against the RAW BODY
// BYTES before anything is parsed, it must be recent (a replay of an old, genuine event is refused
// by time as well as by the event-id ledger), and every failure is closed.
//
// Stripe's scheme: the `Stripe-Signature` header carries `t=<unix seconds>` and one or more
// `v1=<hex>`; v1 is HMAC-SHA256 over `<t>.<raw body>` with the endpoint's signing secret. Any v1
// matching is enough (Stripe sends two while a secret is being rolled).
// ============================================================================================

/** Five minutes, Stripe's own default tolerance. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface SignatureParts {
  t: number;
  v1: string[];
}

export function parseSignatureHeader(header: string | null | undefined): SignatureParts | null {
  if (!header) return null;
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = Number(v);
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) v1.push(v.toLowerCase());
  }
  if (!Number.isInteger(t) || t <= 0 || v1.length === 0) return null;
  return { t, v1 };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time comparison of two equal-length hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function stripeSignatureFor(secret: string, t: number, raw: ArrayBuffer | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const prefix = new TextEncoder().encode(`${t}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);
  return hex(await crypto.subtle.sign('HMAC', key, signed));
}

export type SignatureVerdict = 'ok' | 'missing' | 'stale' | 'mismatch';

/**
 * `nowSeconds` is passed in, never read here, so the check is testable and a clock is named where
 * it is used.
 */
export async function verifyStripeSignature(
  secret: string, raw: ArrayBuffer | Uint8Array, header: string | null | undefined, nowSeconds: number,
  tolerance = SIGNATURE_TOLERANCE_SECONDS
): Promise<SignatureVerdict> {
  const parts = parseSignatureHeader(header);
  if (!parts) return 'missing';
  if (Math.abs(nowSeconds - parts.t) > tolerance) return 'stale';
  const expected = await stripeSignatureFor(secret, parts.t, raw);
  return parts.v1.some((v) => sameHex(v, expected)) ? 'ok' : 'mismatch';
}
