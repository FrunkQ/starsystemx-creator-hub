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
//                    THE ONLY THING THAT MUST BE SET BY HAND.
//   mail_from        who it sends AS. Defaults to the verified domain (`$lib/addresses`); the row
//                    overrides it.
//   mail_admin       who it writes TO. Empty means every admin's own sign-in address, which the
//                    hub already knows (D-50); the row overrides it with an inbox or an alias.
//
// With the key missing, `sendMail` refuses and says which piece is absent - it does not throw, and
// it does not pretend. Every caller is a notification; none may fail the thing it describes.
// ============================================================================================
import type { Gates } from './config';
import type { Db } from './database.types';

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

/**
 * Is the hub able to send at all? The key and a sender - NOT a recipient, which has its own answer
 * below and does not need the owner to type anything (D-50).
 */
export function mailReady(secrets: MailSecrets, gates: Gates): boolean {
  return !!secrets.RESEND_API_KEY && !!gates.mail_from;
}

/**
 * WHO THE HUB WRITES TO, and why this is not simply a config row.
 *
 * The owner, 2026-09-06, on being told to set `mail_admin`: *"where? i am the admin - i used an
 * email to set it up."* Quite. The hub knows every admin's sign-in address already - it reads one
 * to send the Supabase test - so asking for it back was a row for the sake of a row.
 *
 * So: the `mail_admin` row when it is set, which is how notices go to a shared inbox or an alias
 * instead; otherwise EVERY ADMIN'S OWN ADDRESS, looked up. Plural on purpose - when there are two
 * admins, a queue nudge that reaches one of them is a rota nobody agreed to.
 *
 * Never throws, and an empty list is a real answer: it means there is nobody to write to, which is
 * a thing a page needs to be able to say.
 */
export async function adminAddresses(sb: Db, gates: Gates): Promise<string[]> {
  const named = gates.mail_admin.trim();
  if (named) return named.split(',').map((a) => a.trim()).filter(looksLikeEmail);
  try {
    const { data: admins } = await sb.from('creators').select('id').eq('role', 'admin');
    const found: string[] = [];
    for (const a of admins ?? []) {
      const { data } = await sb.auth.admin.getUserById(a.id as string);
      const email = data?.user?.email;
      if (looksLikeEmail(email)) found.push(email);
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * EVERYBODY ON THE STAFF: the admin addresses above, and every active moderator's own sign-in
 * address (D-88). For notices a moderator can act on - a public map the hub found problems in -
 * where writing only to the admins would make the moderators the last to hear about their own work.
 *
 * Never throws; if the moderators cannot be looked up, the admins still hear.
 */
export async function staffAddresses(sb: Db, gates: Gates): Promise<string[]> {
  const out = new Set(await adminAddresses(sb, gates));
  try {
    const { data: mods } = await sb.from('creators').select('id').eq('role', 'moderator').eq('state', 'active');
    for (const m of mods ?? []) {
      const { data } = await sb.auth.admin.getUserById(m.id as string);
      const email = data?.user?.email;
      if (looksLikeEmail(email)) out.add(email);
    }
  } catch {
    // The admins' addresses are already in.
  }
  return [...out];
}

/** A plausible address. Not validation - that is the mail server's job - just a refusal of nonsense. */
export const looksLikeEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;

/**
 * HOW MUCH MAIL HAS GONE, so the usage panel can draw the free line (D-52). The owner asked, and
 * the answer was no - which is the wrong answer for the one integration that has a DAILY cap.
 *
 * Counted from the outbox rather than a new table: every mail the hub sends is queued there and
 * stamped `sent_at` when it lands, so the record already existed. Sent only - a pending intent has
 * not cost anything yet, and a failed one never will.
 */
export async function mailSent(sb: Db): Promise<{ today: number; month: number }> {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [today, month] = await Promise.all([since(sb, startOfDay), since(sb, startOfMonth)]);
  return { today, month };
}

async function since(sb: Db, from: string): Promise<number> {
  try {
    const { count, error } = await (sb as any)
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .like('kind', 'mail.%')
      .eq('state', 'sent')
      .gte('sent_at', from);
    return error || typeof count !== 'number' ? 0 : count;
  } catch {
    return 0;
  }
}

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
