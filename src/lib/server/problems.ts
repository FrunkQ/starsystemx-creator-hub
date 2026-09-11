// A MAP WITH PROBLEMS: how it is stored, how staff hear, and where they find it (D-88).
//
// The finding itself is `bundle/problems.ts` - pure, read from the file. This is what the hub does
// with it: keep it on the map, tell the staff once when such a map is public, and answer the Issues
// tab's question.
//
// THE OWNER'S LINE: "advises not to publish until fixed. And if published mods/admin get a note that
// a 'dodgy' map has been uploaded." Advised, not refused - the creator may know something the hub
// does not, and a map that half-works may still be worth having. But a public one gets eyes on it.
import type { Db } from './database.types';
import type { Gates } from './config';
import { enqueue } from './integrations/outbox';
import { mailReady, staffAddresses, type MailSecrets } from './mail';
import { sha256Hex } from '$lib/bundle/hash';
import { problemKey, problemsFrom, type MapProblem } from '$lib/bundle/problems';

/**
 * The columns to write for these findings, given what was stored before.
 *
 * "NOTED" IS CLEARED WHEN THE PROBLEMS CHANGE, and only then. A moderator who noted one fault has
 * not noted the next; but a re-index that finds exactly what it found last time must not put a map
 * back in front of somebody who already looked at it.
 */
export function problemColumns(problems: MapProblem[], before: unknown): Record<string, unknown> {
  const changed = problemKey(problemsFrom(before)) !== problemKey(problems);
  return {
    problems: problems.length ? problems : null,
    ...(changed ? { problems_noted_at: null, problems_noted_by: null } : {})
  };
}

/** Did the findings change? The same comparison `problemColumns` makes, for the caller deciding to tell anyone. */
export const problemsChanged = (problems: MapProblem[], before: unknown): boolean =>
  problemKey(problemsFrom(before)) !== problemKey(problems);

/** The note, in words. Exported so a test can read it rather than send it. */
export function issueNotice(
  map: { slug: string; title: string }, creator: string | null, problems: MapProblem[], siteUrl: string
): { subject: string; text: string } {
  const refuses = problems.some((p) => p.severity === 'refuses');
  // One line each: a title or a name with a line break in it must not be able to shape the mail.
  const title = map.title.replace(/\s+/g, ' ').trim();
  const by = creator ? creator.replace(/\s+/g, ' ').trim() : null;
  return {
    subject: (refuses ? 'A public map will not open: ' : 'A public map has problems: ') + title,
    text: [
      title + (by ? ' by ' + by : '') + ' is public, and the hub found '
        + (problems.length === 1 ? 'a problem' : problems.length + ' problems') + ' in its file:',
      '',
      ...problems.flatMap((p) => ['- ' + p.title, '  ' + p.detail, '']),
      'Its creator is shown how to fix it on their manage page, and the map wears a "needs a fix"',
      'pill until a fixed version is uploaded. You can put it on hold from its page if downloaders',
      'need warning.',
      '',
      siteUrl + '/s/' + map.slug,
      'Every map with problems: ' + siteUrl + '/admin/issues',
      '',
      '--',
      'Sent once for each map, and again only if what is wrong with it changes.'
    ].join('\n')
  };
}

/**
 * Tell the staff a PUBLIC map has problems. Once per map per distinct set of findings, through the
 * outbox's dedupe key: republishing the same broken file does not mail anybody twice.
 *
 * NEVER THROWS. It runs after a publish or a re-index that has already happened, and a notice that
 * failed must not undo either.
 */
export async function tellStaff(
  env: MailSecrets, sb: Db, gates: Gates, siteUrl: string,
  map: { id: string; slug: string; title: string }, creator: string | null, problems: MapProblem[]
): Promise<void> {
  try {
    if (!problems.length || !mailReady(env, gates)) return;
    const to = await staffAddresses(sb, gates);
    if (!to.length) return;
    const { subject, text } = issueNotice(map, creator, problems, siteUrl);
    const which = (await sha256Hex(new TextEncoder().encode(problemKey(problems)))).slice(0, 16);
    for (const address of to) {
      await enqueue(sb, {
        kind: 'mail.issue',
        creatorId: null,
        payload: { to: address, subject, text },
        dedupeKey: 'issue:' + map.id + ':' + which + ':' + address
      });
    }
  } catch (e) {
    console.warn('could not tell staff about a map with problems', e);
  }
}

export interface IssueRow {
  id: string;
  slug: string;
  title: string;
  state: string;
  creator_id: string;
  problems: MapProblem[];
  problems_noted_at: string | null;
  hold_note: string | null;
  updated_at: string;
}

/**
 * Every map the hub found problems in, public ones first. `null` when the columns are not there yet
 * (before 0040) - the page says so rather than showing an empty list that looks like good news.
 *
 * In the library rather than the page on purpose: it FILTERS on a young column, which no route may
 * do (tests/tolerantPages.test.ts), and it answers that case itself.
 */
export async function mapsWithProblems(sb: Db): Promise<IssueRow[] | null> {
  const { data, error } = await (sb as any).from('systems')
    .select('id, slug, title, state, creator_id, problems, problems_noted_at, hold_note, updated_at')
    .not('problems', 'is', null)
    .neq('state', 'removed')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) return null;
  return ((data ?? []) as Array<Record<string, any>>)
    .map((r) => ({ ...r, problems: problemsFrom(r.problems) }) as IssueRow)
    .filter((r) => r.problems.length > 0)
    .sort((a, b) => Number(b.state === 'public') - Number(a.state === 'public'));
}
