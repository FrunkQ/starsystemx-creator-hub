// FORGOTTEN PASSWORDS (D-68). There was no way back in.
//
// ============================================================================================
// The owner, 2026-09-07: *"no reset password option on failure to log in - perhaps a reset option
// after 'That email and password do not match an account.'"*
//
// He is right that the message is where it belongs, and the gap was worse than the placement: the
// hub had no reset flow AT ALL. `resetPasswordForEmail` existed in exactly one place - the admin
// test-mail button - so the only person who could trigger a reset was the owner, on himself, from
// a page nobody else can reach. Anybody who forgot a password was simply locked out for good.
//
// TWO PAGES, because a reset is two moments: asking (here) and setting (`/reset/new`). They are
// separated by an email, and the second one cannot be a server action - the recovery token arrives
// in the URL FRAGMENT, which browsers do not send to a server. See `/reset/new`.
//
// IT ALWAYS SAYS THE SAME THING. Telling an unauthenticated form whether an address has an account
// turns it into a way to test addresses, which is the same reason the sign-in message does not
// distinguish "no such account" from "wrong password". So: asked, always.
// ============================================================================================
import type { Actions } from './$types';
import { fail, error } from '@sveltejs/kit';
import { linkClient } from '$lib/server/db';
import { looksLikeEmail } from '$lib/server/mail';

export const actions: Actions = {
  default: async ({ request, platform, url }) => {
    const env = platform?.env;
    if (!env?.SUPABASE_PUBLISHABLE_KEY) throw error(500, 'not configured');

    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().slice(0, 254);
    if (!looksLikeEmail(email)) return fail(400, { email, message: 'That does not look like an email address.' });

    // The error is deliberately not surfaced. A rate limit, an unknown address and a mail failure
    // all produce the same answer, because the difference between them is exactly what an attacker
    // is asking for. A person who genuinely gets no email has the address on the page to write to.
    await linkClient(env).auth.resetPasswordForEmail(email, {
      redirectTo: url.origin + '/reset/new'
    });

    return { asked: true };
  }
};
