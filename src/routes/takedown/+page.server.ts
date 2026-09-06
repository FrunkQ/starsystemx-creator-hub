import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { mailReady, looksLikeEmail, adminAddresses } from '$lib/server/mail';
import { enqueue } from '$lib/server/integrations/outbox';
import { drainOutbox } from '$lib/server/integrations/deliver';

// THE CONTACT FORM D-16 REFUSED TO BUILD, now that the refusal's reason has gone (D-49).
//
// The reason was written down at the time and it was a good one: *"it needs a mail-sending backend
// the hub does not have, and a form that silently fails is worse than an address — a copyright
// claim that never arrives is the one message here that must not go missing."* The hub can send
// mail now, so the first half is answered; the second half is answered by the design below.
//
// THE ADDRESS STAYS ON THE PAGE. The form is offered as well, never instead: if the form is broken,
// or the hub cannot send today, the person still leaves with somewhere to write. That is the whole
// safeguard, and it is why the reveal control is untouched.
const MAX = { name: 120, email: 254, url: 500, detail: 4000 };

export const load: PageServerLoad = async ({ platform }) => {
  const env = platform?.env;
  // The page renders without a database - it is the one page that must work when everything else
  // is broken - so an unreachable config means "no form", not an error.
  if (!env?.SUPABASE_URL) return { canSend: false };
  try {
    const sb = db(env);
    const gates = await loadGates(sb);
    // Both halves: the hub can send, AND there is somebody to send to. Either missing means the
    // form is not offered - the address below is the whole point of it still being there.
    const to = mailReady(env, gates) ? await adminAddresses(sb, gates) : [];
    return { canSend: to.length > 0 };
  } catch {
    return { canSend: false };
  }
};

export const actions: Actions = {
  send: async ({ request, platform }) => {
    const env = platform?.env;
    if (!env) throw error(500, 'not configured');
    const sb = db(env);
    const gates = await loadGates(sb);

    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim().slice(0, MAX.name);
    const email = String(form.get('email') ?? '').trim().slice(0, MAX.email);
    const url = String(form.get('url') ?? '').trim().slice(0, MAX.url);
    const detail = String(form.get('detail') ?? '').trim().slice(0, MAX.detail);
    // EVERY refusal hands back what they typed. A form that empties itself when it says no is a
    // form people abandon, and this is the message that must not go missing.
    const typed = { name, email, url, detail };

    const to = mailReady(env, gates) ? await adminAddresses(sb, gates) : [];
    if (!to.length) {
      return fail(503, { ...typed, message: 'The hub cannot send mail at the moment. Please write to the address below instead.' });
    }
    if (!looksLikeEmail(email)) return fail(400, { ...typed, message: 'We need an address to reply to.' });
    if (detail.length < 20) return fail(400, { ...typed, message: 'Please say what the problem is - a sentence or two is enough.' });

    const text = [
      'A copyright report was sent from the hub.',
      '',
      'From:   ' + (name || '(no name given)') + ' <' + email + '>',
      'Page:   ' + (url || '(none given)'),
      '',
      detail,
      '',
      '--',
      'Reply to this message and it goes to them.'
    ].join('\n');

    // THROUGH THE OUTBOX, like every other outbound thing the hub does (D-32). A claim that fails
    // to send on the first attempt is retried by the cron rather than lost - which is exactly the
    // failure mode that made a form the wrong answer before there was one.
    //
    // The dedupe key is the CONTENT and the hour: pressing Send twice sends one message, while a
    // second, different report in the same hour goes through. Keying on the person or the hour
    // alone would silently swallow a real second claim, and that is the one message that must not
    // go missing.
    const digest = await sha256Hex(email + '\n' + url + '\n' + detail);
    await enqueue(sb, {
      kind: 'mail.takedown',
      creatorId: null,
      payload: { to: to[0], subject: 'Copyright report via the hub', text, replyTo: email },
      dedupeKey: 'takedown:' + new Date().toISOString().slice(0, 13) + ':' + digest.slice(0, 16)
    });

    // Then try to deliver it now, so the person is not told "sent" while it sits in a queue. A
    // failure here is not reported to them: it is queued, and the cron will keep trying.
    try {
      await drainOutbox(env, sb, gates, 'the hub', 5);
    } catch {
      // The queue is the promise; delivery is the attempt.
    }
    return { sent: true };
  }
};

/** The same digest the rest of the hub uses, without pulling in the bundle reader for one string. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
