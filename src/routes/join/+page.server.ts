// JOINING (D-66). Until this existed, nobody could.
//
// ============================================================================================
// The owner, 2026-09-07: *"one query - how does a new user sign up?"* and then, answering it
// himself: *"we have mail working now - so can do the proper sign up."*
//
// The honest answer to the first question was: they cannot. There was no `signUp` call anywhere in
// the hub and nothing that ever inserted a `creators` row. An account existed only if somebody made
// the Supabase auth user by hand and inserted the matching row by hand - which is why the sign-in
// page carries a message for the half-state where one exists without the other.
//
// ---------------------------------------------------------------------------------------------
// THE ROW IS CREATED AT SIGN-UP, NOT AT FIRST SIGN-IN, and that is the design decision here.
//
// The obvious alternative - make the `creators` row the first time somebody signs in successfully -
// is worse in a way that only shows up later: the handle cannot be RESERVED. Two people choose
// `nomad`, both are told it is free, both confirm their email a week apart, and the second one
// discovers at the moment of arrival that they are now `nomad-2`. The unique index is the only
// thing that can actually hold a name, so the row goes in as soon as there is an id to hang it on.
//
// Supabase returns the user id from `signUp` even when the account still needs confirming, so the
// name is held from the moment they press the button. An account that never confirms leaves a
// `creators` row with no maps and no sign-ins, which is a tidy-up job and not a fault.
//
// AND IT MAKES THE HALF-STATE UNREACHABLE for anybody who joins this way. The sign-in page's
// "exists but has no creator profile" branch stays, because accounts made by hand still exist.
// ---------------------------------------------------------------------------------------------
//
// THE MAIL IS SUPABASE'S, NOT THE HUB'S, and D-49 is the reason that distinction is written down:
// the confirmation goes through Supabase Auth's own SMTP with Supabase's own template, which is a
// DIFFERENT path from the Resend API the hub sends its own notices through. The owner's password
// reset arriving is what proves this path works; the hub's test-mail button proves the other one.
// If confirmations stop arriving, it is the Supabase SMTP settings to look at, not `RESEND_API_KEY`.
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { authClient, db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { setSession } from '$lib/server/session';
import { cleanHandle, handleProblem, suffixed } from '$lib/handles';
import { looksLikeEmail } from '$lib/server/mail';

/** Long enough to matter, short enough that nobody reaches for a note. Supabase's own floor is 6. */
const PASSWORD_MIN = 8;

export const load: PageServerLoad = async ({ locals, platform }) => {
  if (locals.viewer) redirect(303, '/account');
  const env = platform?.env;
  if (!env?.SUPABASE_URL) return { open: false, reason: 'not configured' };
  try {
    const gates = await loadGates(db(env));
    return { open: gates.signups_open, reason: '' };
  } catch {
    // A hub that cannot read its config should not claim the door is open.
    return { open: false, reason: 'not configured' };
  }
};

export const actions: Actions = {
  default: async ({ request, platform, cookies, url }) => {
    const env = platform?.env;
    if (!env?.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw error(500, 'not configured');

    const sb = db(env);
    const gates = await loadGates(sb);

    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().slice(0, 254);
    const password = String(form.get('password') ?? '');
    const handle = cleanHandle(form.get('handle'));
    // EVERY refusal hands back what they typed, including the TIDIED handle - so a person can see
    // what they will actually be called before they are told what is wrong with it.
    const typed = { email, handle };

    if (!gates.signups_open) {
      return fail(403, { ...typed, message: 'New accounts are closed at the moment. Downloading never needs one.' });
    }

    const problem = handleProblem(handle);
    if (problem) return fail(400, { ...typed, message: problem });
    if (!looksLikeEmail(email)) return fail(400, { ...typed, message: 'That does not look like an email address.' });
    if (password.length < PASSWORD_MIN) {
      return fail(400, { ...typed, message: 'Passwords need at least ' + PASSWORD_MIN + ' characters.' });
    }

    // Asked before the account is made, so the common case is a plain "that one is taken" rather
    // than an auth user that exists and cannot be finished. The race this leaves is handled below.
    const { data: clash } = await sb.from('creators').select('id').eq('handle', handle).maybeSingle();
    if (clash) return fail(400, { ...typed, message: 'Somebody is already called that. Try another.' });

    const { data, error: authError } = await authClient(env).auth.signUp({
      email,
      password,
      options: {
        // Where the confirmation link lands. Supabase only honours it if the URL is on its allowed
        // redirect list - a per-hostname setting the owner keeps, like the Discord OAuth redirect.
        emailRedirectTo: url.origin + '/login?joined=1',
        // The handle rides along so it is recorded against the auth user too. The `creators` row
        // below is the one that MATTERS; this is for anybody reading the auth table later.
        data: { handle }
      }
    });

    if (authError || !data.user) {
      // SUPABASE DOES NOT SAY "that email already has an account", and neither will we: telling an
      // unauthenticated form whether an address is registered turns it into a way to test addresses.
      // A person who genuinely has an account is sent to the place that can help them.
      const message = /rate|too many/i.test(authError?.message ?? '')
        ? 'Too many attempts just now. Try again in a few minutes.'
        : 'That did not work. If you already have an account, sign in or reset your password.';
      return fail(400, { ...typed, message });
    }

    // THE NAME IS HELD HERE. Two people can pass the check above a moment apart, so the unique
    // index is the real arbiter and a clash at this point must not be a dead end at the last step
    // of joining - the second person becomes `name-2`.
    let chosen = handle;
    for (let attempt = 2; attempt <= 6; attempt++) {
      const { error: insertError } = await sb.from('creators')
        .insert({ id: data.user.id, handle: chosen, display_name: null });
      if (!insertError) break;
      if (!/duplicate|unique/i.test(insertError.message)) {
        // The auth user exists and the profile does not. Say so rather than pretending it worked -
        // this is the exact half-state the sign-in page has a message for.
        return fail(500, {
          ...typed,
          message: 'Your account was made but the profile was not. Sign in and tell us - it is quick to fix.'
        });
      }
      chosen = suffixed(handle, attempt);
    }

    // CONFIRMATION MAY BE OFF. Supabase hands back a session immediately when it is, and making
    // somebody sign in again straight after joining would be a needless step - so if there is a
    // session, use it. If there is not, the account is waiting on the email.
    if (data.session) {
      setSession(cookies, data.session.access_token, data.session.refresh_token, {
        secure: url.protocol === 'https:'
      });
      redirect(303, '/account?joined=1');
    }

    return { check: email, handle: chosen, renamed: chosen !== handle };
  }
};
