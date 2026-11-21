// A SMALL STRIPE CLIENT (paid packs, PP3). fetch and form encoding, no SDK: the Worker needs four
// calls, and a dependency that size is not worth carrying for them.
//
// ============================================================================================
// TEST MODE ONLY, ENFORCED HERE. A secret key that is not a test key (`sk_test_` / `rk_test_`) is
// refused before any request is made. Live keys wait for the owner's explicit yes and package PP8,
// and that change is one line in this file, made on purpose.
//
// THE KEY IS NEVER LOGGED. Errors carry Stripe's message and type, never the request headers.
// ============================================================================================
import { error } from '@sveltejs/kit';
import type { HubEnv } from '../db';

const API = 'https://api.stripe.com/v1';

export const isTestKey = (key: string) => /^(sk|rk)_test_/.test(key);

/** The secret key, or a 503 that says what is missing. Never the key in any message. */
export function stripeSecret(env: HubEnv): string {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw error(503, 'Payments are not set up yet.');
  if (!isTestKey(key)) throw error(503, 'Only Stripe test keys are accepted until live payments are switched on.');
  return key;
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/**
 * Stripe's form encoding: nested objects and arrays as `a[b][0][c]=v`. Null and undefined are left
 * out, booleans are "true"/"false". Order is the object's own, so the output is stable for tests.
 */
export function formEncode(params: Record<string, Param>): string {
  const out: string[] = [];
  const walk = (prefix: string, v: Param) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${prefix}[${k}]`, x);
    else out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.join('&');
}

export class StripeError extends Error {
  constructor(message: string, public status: number, public type: string | null) { super(message); }
}

export async function stripe<T = Record<string, unknown>>(
  env: HubEnv, method: 'GET' | 'POST', path: string, params: Record<string, Param> = {}, idempotencyKey?: string
): Promise<T> {
  const key = stripeSecret(env);
  const body = formEncode(params);
  const url = method === 'GET' && body ? `${API}${path}?${body}` : `${API}${path}`;
  const headers: Record<string, string> = { authorization: `Bearer ${key}` };
  if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body: method === 'POST' ? body : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; type?: string } };
  if (!res.ok) throw new StripeError(data.error?.message ?? `Stripe answered ${res.status}`, res.status, data.error?.type ?? null);
  return data as T;
}
