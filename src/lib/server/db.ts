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
  SUPABASE_SERVICE_ROLE_KEY: string;
  HUB_ASSETS: R2Bucket;
  HUB_BUNDLES: R2Bucket;
}

export function db(env: HubEnv): Db {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
