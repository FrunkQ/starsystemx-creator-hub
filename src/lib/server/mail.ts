// THE HUB'S OWN MAIL (D-49). One function, one provider, inert until it is configured.
//
// ============================================================================================
// WHAT THE PASSWORD-RESET EMAIL PROVED, AND WHAT IT DID NOT. The owner set SMTP in Supabase Auth
// and the test button delivered - which proves the Resend credentials and the domain work. It does
// NOT give the hub a way to send mail: `resetPasswordForEmail` is Supabase sending one of ITS
// templates to a user of ITS auth system. There is no "send this text to this person" in it.
//
// So the hub talks to Resend directly over HTTPS, which is a Worker's natural shape anyway: one
// POST, an API key, no SMTP library, no connection to hold open.
//
// INERT UNTIL CONFIGURED, exactly like the Discord integration:
//   RESEND_API_KEY   a Worker secret - `wrangler secret put RESEND_API_KEY`. NEVER in a file.
//   mail_from        a config row, on the verified domain (e.g. `hub@starsystemx.com`).
//   mail_admin       a config row: where the hub writes TO. Empty means nothing is sent.
//
// With any of the three missing, `sendMail` refuses and says which - it does not throw, and it does
// not pretend. Every caller here is a notification; none of them may fail the thing they describe.
// ============================================================================================
import type { Gates } from './config';

export interface MailSecrets {
  RESEND_API_KEY?: string;
}

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. The hub sends no HTML: nothing it has to say needs a layout. */
  text: string;
  /**
   * Where a reply goes. THE POINT OF THE TAKEDOWN FORM: the notice comes from the hub's own
   * address so it is never spam-filtered as a forgery, and pressing reply reaches the person who
   * actually wrote it.
   */
  replyTo?: string;
}

export type MailResult = { ok: true; id: string | null } | { ok: false; reason: string };

/** Is the hub able to send at all? For a page that wants to say so before offering a form. */
export function mailReady(secrets: MailSecrets, gates: Gates): boolean {
  return !!secrets.RESEND_API_KEY && !!gates.mail_from && !!gates.mail_admin;
}

/** A plausible address. Not validation - that is the mail server's job - just a refusal of nonsense. */
export const looksLikeEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

export async function sendMail(secrets: MailSecrets, gates: Gates, mail: Mail): Promise<MailResult> {
  if (!secrets.RESEND_API_KEY) return { ok: false, reason: 'no RESEND_API_KEY is set on the Worker' };
  if (!gates.mail_from) return { ok: false, reason: 'the mail_from row is empty' };
  if (!looksLikeEmail(mail.to)) return { ok: false, reason: 'there is nobody to send it to' };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + secrets.RESEND_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: gates.mail_from,
        to: [mail.to],
        subject: mail.subject.slice(0, 200),
        text: mail.text,
        ...(mail.replyTo ? { reply_to: [mail.replyTo] } : {})
      }),
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined
    });
  } catch (e) {
    return { ok: false, reason: 'could not reach the mail service: ' + ((e as Error)?.message ?? String(e)) };
  }

  if (!res.ok) {
    // Resend says why in the body, and a reviewer reading the outbox deserves to see it.
    const said = await res.text().catch(() => '');
    return { ok: false, reason: 'the mail service answered ' + res.status + ' ' + said.slice(0, 300) };
  }
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: body?.id ?? null };
}
