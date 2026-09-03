// An anonymous visitor id for the usage counts. NEVER an address.
//
// ============================================================================================
// WHAT IS STORED: sha256(iso-week + salt + ip + user-agent). WHAT IS NOT: the ip, the agent, or
// anything a later query could turn back into a person.
//
// WHY THE WEEK IS IN THE HASH. "Different users" needs the same visitor to hash the same way twice,
// and privacy needs that to stop somewhere. A week is the compromise: within one week a visitor is
// one visitor, exactly; across weeks the hashes do not join up, so nothing can be followed for
// longer than that. The dashboard therefore reports distinct visitors per WEEK and, for longer
// windows, visitor-weeks - and says so.
//
// THE SALT is a Worker secret (VISITOR_SALT). Without it the hash is still one-way, but the
// address space is small enough to be guessed at, so the salt is what makes "cannot be turned back
// into an address" true rather than approximately true. Set it: `wrangler secret put VISITOR_SALT`.
// ============================================================================================
import { sha256Hex } from '$lib/bundle/hash';

/** The ISO 8601 week, `YYYY-Www`. Thursday decides which year a week belongs to. */
export function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 864e5 + 1) / 7);
  return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

export async function visitorHash(request: Request, salt: string | undefined, now = new Date()): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '';
  const ua = request.headers.get('user-agent') ?? '';
  const text = isoWeek(now) + '|' + (salt ?? '') + '|' + ip + '|' + ua;
  return sha256Hex(new TextEncoder().encode(text));
}
