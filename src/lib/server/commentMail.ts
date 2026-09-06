// "SOMEBODY SAID SOMETHING ABOUT YOUR MAP" (D-52). The notice that was waiting for mail.
//
// ============================================================================================
// D-33 built the honest version of this while the hub could not send anything: the account page
// lists what has been said under your maps since you last looked, and moves the clock. It said at
// the time that *"when SMTP exists, mail can follow the same query"* - and here it is, following
// the same query, because a second definition of "new comment" is a second thing to get wrong.
//
// THE PART THAT NEEDED THINKING ABOUT IS THE CLOCK, not the query. `comments_seen_at` is moved by
// LOOKING at the account page, and a mail is not a look: if sending moved it, a creator who read
// the mail and then opened the page would find the list empty and wonder what they had missed. So
// mail keeps its own mark, `comments_mailed_at`, and the two clocks answer different questions:
//
//   comments_seen_at    what have I not READ            moved by opening the page
//   comments_mailed_at  what have I not been TOLD about  moved by sending
//
// A creator who never opens the page still gets told once per comment; a creator who reads the page
// first gets no mail about what they have already seen, because the query below asks for both.
//
// ONE MAIL PER CREATOR PER DAY AT MOST, through the outbox's dedupe key. Comments arrive in ones
// and twos, a map with a conversation on it would otherwise mail somebody hourly, and the hub has
// a hundred mails a day to spend (stats.ts LIMITS.mailPerDay).
// ============================================================================================
import type { Db } from './database.types';
import type { Gates } from './config';
import { enqueue } from './integrations/outbox';
import { mailReady, looksLikeEmail, type MailSecrets } from './mail';
import { tolerantWrite } from './tolerant';

/** How many comments a digest names before it stops listing and starts counting. */
const LIST = 5;

export interface NewComment {
  by: string;
  body: string;
  map: { slug: string; title: string };
}

/** Plain words, and the map's own page rather than a notification centre nobody asked for. */
export function digestText(comments: NewComment[], siteUrl: string): { subject: string; text: string } {
  const maps = [...new Set(comments.map((c) => c.map.title))];
  const subject = comments.length === 1
    ? comments[0].by + ' commented on "' + comments[0].map.title + '"'
    : comments.length + ' new comments on ' + (maps.length === 1 ? '"' + maps[0] + '"' : maps.length + ' of your maps');

  const lines: string[] = [];
  for (const c of comments.slice(0, LIST)) {
    lines.push(c.by + ' on "' + c.map.title + '":');
    lines.push('  ' + c.body.replace(/\s+/g, ' ').slice(0, 200) + (c.body.length > 200 ? '...' : ''));
    lines.push('  ' + siteUrl + '/s/' + c.map.slug + '#comments');
    lines.push('');
  }
  if (comments.length > LIST) lines.push('...and ' + (comments.length - LIST) + ' more.', '');

  return {
    subject,
    text: [
      ...lines,
      '--',
      'You can remove any comment on your own map from its page.',
      'This is sent at most once a day, and only about comments you have not already seen.'
    ].join('\n')
  };
}

/**
 * Tell creators about comments they have neither read nor been told about.
 *
 * Runs on the cron beside the queue nudge. NEVER THROWS - it shares a drain with the Discord posts,
 * and a digest that broke the drain would take those down with it.
 */
export async function mailNewComments(
  env: MailSecrets, sb: Db, gates: Gates, siteUrl: string
): Promise<{ mailed: number; reason: string }> {
  try {
    if (!mailReady(env, gates)) return { mailed: 0, reason: 'mail is not configured' };

    // Live comments on public maps, by somebody other than the map's own creator.
    const { data: rows, error } = await sb.from('comments')
      .select('id, body, created_at, creator_id, system_id, systems!inner(slug, title, creator_id, state)')
      .is('removed_at', null)
      .eq('systems.state', 'public')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !rows?.length) return { mailed: 0, reason: error ? error.message : 'no comments' };

    // Who said it. One batch read - a deleted author leaves a comment behind with no creator_id,
    // and "a former explorer" is what that person is called everywhere else on the hub (D-28).
    const authors = [...new Set((rows as unknown as Array<Record<string, any>>)
      .map((r) => r.creator_id).filter(Boolean))] as string[];
    const { data: people } = authors.length
      ? await sb.from('creators').select('id, handle, display_name').in('id', authors)
      : { data: [] as Array<{ id: string; handle: string; display_name: string | null }> };
    const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name ?? p.handle]));

    // Group by the map's OWNER, dropping anything they wrote themselves.
    const byOwner = new Map<string, Array<{ at: string; c: NewComment }>>();
    for (const r of rows as unknown as Array<Record<string, any>>) {
      const map = r.systems;
      if (!map || r.creator_id === map.creator_id) continue;
      const list = byOwner.get(map.creator_id) ?? [];
      list.push({
        at: r.created_at,
        c: {
          by: (r.creator_id ? nameOf.get(r.creator_id) : null) ?? 'A former explorer',
          body: String(r.body ?? ''),
          map: { slug: map.slug, title: map.title }
        }
      });
      byOwner.set(map.creator_id, list);
    }
    if (!byOwner.size) return { mailed: 0, reason: 'nothing anybody else said' };

    const { data: owners } = await sb.from('creators')
      .select('id, comments_seen_at, comments_mailed_at').in('id', [...byOwner.keys()]);

    let mailed = 0;
    for (const owner of owners ?? []) {
      const o = owner as unknown as Record<string, any>;
      // BOTH CLOCKS: not read, and not already mailed about.
      const after = [o.comments_seen_at, o.comments_mailed_at].filter(Boolean).sort().pop() ?? null;
      const fresh = (byOwner.get(o.id) ?? []).filter((x) => !after || x.at > after);
      if (!fresh.length) continue;

      const { data: user } = await sb.auth.admin.getUserById(o.id);
      const to = user?.user?.email;
      if (!looksLikeEmail(to)) continue;

      const { subject, text } = digestText(fresh.map((x) => x.c), siteUrl);
      await enqueue(sb, {
        kind: 'mail.comments',
        creatorId: o.id,
        payload: { to, subject, text },
        // One a day per creator: comments arrive in ones and twos and a conversation would
        // otherwise mail somebody hourly.
        dedupeKey: 'comments:' + o.id + ':' + new Date().toISOString().slice(0, 10)
      });
      // Moved on QUEUEING, not on delivery: a retry loop that re-derived the same digest every
      // fifteen minutes would be worse than a digest that occasionally goes missing.
      await tolerantWrite({ comments_mailed_at: new Date().toISOString() },
        async (row) => sb.from('creators').update(row).eq('id', o.id));
      mailed++;
    }
    return { mailed, reason: mailed ? 'digests queued' : 'everybody is up to date' };
  } catch (e) {
    return { mailed: 0, reason: 'could not check: ' + ((e as Error)?.message ?? String(e)) };
  }
}
