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
}

export function db(env: HubEnv): Db {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/** A client for signing a person in. Narrow key, narrow purpose. */
export function authClient(env: HubEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
