// The second half of a reset (D-68): the page the emailed link lands on.
//
// IT HANDS THE BROWSER TWO PUBLIC VALUES AND NOTHING ELSE. The recovery token arrives in the URL
// FRAGMENT, which a browser never sends to a server - so no server action can read it and no
// `+page.server.ts` can complete this. The work happens in the component, and it needs a Supabase
// client of its own to do it.
//
// THE PUBLISHABLE KEY IS PUBLIC BY DESIGN - it is the key browsers are meant to hold, it is what
// every Supabase front end ships, and it is powerless on its own because row-level security is
// deny-by-default here (migration 0003). The service-role key is the one that must never leave the
// Worker, and it does not: `db()` is server-only and stays that way.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw error(500, 'not configured');
  return { supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY };
};
