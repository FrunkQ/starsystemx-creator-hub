import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { authClient, db } from '$lib/server/db';
import { setSession } from '$lib/server/session';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.viewer) redirect(303, url.searchParams.get('next') ?? '/account');
  return {};
};

export const actions: Actions = {
  default: async ({ request, platform, cookies, url }) => {
    const env = platform?.env;
    if (!env?.SUPABASE_URL) throw error(500, 'not configured');
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();

    if (!env.SUPABASE_PUBLISHABLE_KEY) {
      return fail(503, { email, message: 'Sign-in is not configured yet.' });
    }

    const password = String(form.get('password') ?? '');
    if (!email || !password) return fail(400, { email, message: 'Enter your email and password.' });

    const { data, error: authError } = await authClient(env).auth.signInWithPassword({ email, password });

    if (authError || !data.session) {
      // ONE MESSAGE FOR BOTH FAILURES, deliberately. Distinguishing "no such account" from "wrong
      // password" turns this form into a way to test whether an email has an account here.
      return fail(400, { email, message: 'That email and password do not match an account.' });
    }

    // An auth user with no `creators` row cannot do anything - every table keys off creator id.
    // Say so plainly rather than signing them into a broken half-state.
    const { data: creator } = await db(env).from('creators')
      .select('id, state').eq('id', data.user.id).maybeSingle();

    if (!creator) {
      return fail(403, {
        email,
        message: 'That account exists but has no creator profile yet. An admin needs to finish setting it up.'
      });
    }
    if (creator.state === 'banned') {
      return fail(403, { email, message: 'That account cannot sign in.' });
    }

    setSession(cookies, data.session.access_token, data.session.refresh_token, {
      secure: url.protocol === 'https:'
    });

    // `next` is a redirect target from a query string, so it is attacker-supplied. Only same-site
    // PATHS are allowed - never an absolute URL, or this is an open redirect.
    const next = url.searchParams.get('next');
    redirect(303, next && /^\/[^/\\]/.test(next) ? next : '/account');
  }
};
