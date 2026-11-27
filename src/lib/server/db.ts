// Postgres access, over HTTP, from a Worker.
//
// `@supabase/supabase-js` speaks PostgREST over fetch, which is the one shape that works on
// Workers without a connection pool. The SERVICE ROLE key is used and it bypasses RLS - so the
// RLS policies in db/migrations/0003_rls.sql are defence in depth for the anon key, not the
// control that protects this path. Every check that matters is in code, here.
import { createClient } from '@supabase/supabase-js';
import type { Database, Db } from './database.types';

export interface HubEnv {
  SUPABASE_URL: string;
  /**
   * Full access, bypasses row-level security. Used for everything the hub does on its own behalf.
   *
   * NOTE ON SUPABASE'S RENAMING: the dashboard no longer calls this "service_role" - it is now the
   * `sb_secret_...` key. Same thing, same power. The binding keeps the old name because it still
   * describes accurately what the key IS.
   */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /**
   * The browser-facing key (`sb_publishable_...`, formerly `anon`). Used ONLY to sign a user in.
   *
   * WHY NOT JUST USE THE SERVICE KEY: it would work - the auth endpoint accepts it - and it would
   * be wrong. A user-context operation performed with a key that bypasses every row-level policy is
   * one refactor away from being a real hole. The keys are separate because their blast radius is.
   */
  SUPABASE_PUBLISHABLE_KEY: string;
  HUB_ASSETS: R2Bucket;
  HUB_BUNDLES: R2Bucket;
  /**
   * Salts the anonymous visitor hash on downloads (server/visitor.ts). Optional, but without it
   * "cannot be turned back into an address" is only approximately true. `wrangler secret put VISITOR_SALT`.
   */
  VISITOR_SALT?: string;
  /**
   * The hub's own mail, through Resend's API (D-49). A SECRET, never a config row: a row is
   * readable by anything that can read the config table, and a sending key is a sending key.
   * `wrangler secret put RESEND_API_KEY`. Absent = the hub sends nothing and says so.
   */
  RESEND_API_KEY?: string;
  /**
   * Per-address request allowance (D-95, wrangler.toml `[[ratelimits]]`). Optional: without it the
   * hub simply does not rate limit.
   */
  PUBLIC_LIMIT?: import('./guard').RateLimiter;
  /**
   * PAID PACKS (D-94 onward). All four are Worker SECRETS that only the owner puts in, in Cloudflare;
   * never a config row, never committed, never logged. The money routes refuse to run without them,
   * and refuse a LIVE key outright until the owner's explicit yes (PP8): see server/paid/stripe.ts.
   */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  RECEIPT_SIGNING_KEY?: string;
}

// ============================================================================================
// EVERY DATABASE CALL GIVES UP AFTER EIGHT SECONDS (27 Nov 2026 outage).
//
// supabase-js has no timeout of its own. When the free Nano machine ran out of disk IO budget,
// every PostgREST call hung about twenty seconds before Cloudflare answered 522, and a page that
// makes three calls one after another took forty seconds to show a 500. With a limit the call is
// aborted, postgrest-js hands back `{ error }` like any other failure, and the page shows its own
// "could not be read" state in seconds. Eight seconds is far above a healthy call (~0.4 s measured
// end to end) and well inside Workers' wall-clock allowance.
// ============================================================================================
export const DB_TIMEOUT_MS = 8_000;

/** The message every page shows when the database did not answer in time. */
export const DB_UNREACHABLE = 'The database is not answering right now.';

/** A fetch that aborts after `ms`, keeping any signal the caller passed as well. */
export function timedFetch(ms = DB_TIMEOUT_MS, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init) => {
    const limit = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
    return base(input, { ...init, signal });
  };
}

/** True for the error a timed-out database call throws or returns. */
export function isDbTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = String((e as { message?: string } | null)?.message ?? e ?? '');
  return name === 'TimeoutError' || name === 'AbortError' || /TimeoutError|AbortError|aborted due to timeout|signal timed out/i.test(message);
}

const GLOBAL = { fetch: timedFetch() };

export function db(env: HubEnv): Db {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: GLOBAL
  });
}

/** A client for signing a person in. Narrow key, narrow purpose. */
export function authClient(env: HubEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: GLOBAL
  });
}

/**
 * THE CLIENT THAT ASKS FOR A PASSWORD-RESET OR CONFIRMATION LINK, and the `flowType` is the whole
 * reason it is separate (D-68).
 *
 * supabase-js defaults to **PKCE**, which puts a `?code=` on the emailed link and requires the
 * matching verifier to be in the storage of the client that ASKED. The hub asks from a Worker and
 * then throws that client away, so the verifier is gone before the person opens their email - and
 * the exchange fails with a message about a missing code verifier that says nothing useful to
 * anybody. **Implicit** puts the tokens in the URL fragment instead, which the browser can consume
 * on its own with nothing kept from earlier.
 *
 * Not a weakening of PKCE: PKCE protects an authorisation code from being intercepted between two
 * halves of the same client. There are no two halves here - the request is made on a server and
 * completed in a browser that never met it, which is the one shape PKCE cannot span.
 */
export function linkClient(env: HubEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
    global: GLOBAL
  });
}
