// THE TAKEDOWN QUEUE (D-69). Open ones first; the rest kept forever.
//
// ============================================================================================
// The owner, 2026-09-07: *"takedowns should be catalogued and managed in the moderation stuff. eg:
// it is listed there and will stay there until resolved one way or another"* - and, asked whether
// any of it should go out to Discord: *"It stays in the hub - a moderator page to see incoming
// requests and whether the info was removed or the request ignored. Stored forever alongside who
// the takedown came from - just so we can track these for good."*
//
// RESOLVING MOVES, IT DOES NOT DELETE. There is no delete action on this page and there is not
// meant to be one. The value of the record is precisely that it survives the decision - a second
// claim about the same work a year later arrives with a history, and "what did we do about that"
// has an answer that is not somebody's memory.
//
// STAFF, NOT ADMIN, at the owner's word. It is the one place a moderator sees an outsider's name
// and email, which is a real widening of what D-39 gave them - but a claim cannot be answered by
// somebody who cannot see who made it, and answering claims is the job.
// ============================================================================================
import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/auth';
import * as audit from '$lib/server/audit';
import type { TakedownRow, TakedownState } from '$lib/server/database.types';

const RESOLUTIONS: TakedownState[] = ['actioned', 'rejected', 'withdrawn'];

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  // The archive is a deliberate second query rather than one list with a filter: the open ones are
  // work and the closed ones are history, and a page that mixes them buries the work.
  const [{ data: open }, { data: closed }] = await Promise.all([
    sb.from('takedowns').select('*').eq('state', 'open').order('created_at', { ascending: false }),
    sb.from('takedowns').select('*').neq('state', 'open')
      .order('resolved_at', { ascending: false }).limit(100)
  ]);

  return {
    open: (open ?? []) as TakedownRow[],
    closed: (closed ?? []) as TakedownRow[],
    done: url.searchParams.get('done') ?? ''
  };
};

export const actions: Actions = {
  /**
   * Close one, with a note saying what was done.
   *
   * THE NOTE IS REQUIRED. "Actioned" on its own is the kind of record that looks complete and
   * answers nothing six months later; the whole point of keeping these is being able to say what
   * happened. It is enforced here rather than by a database constraint, because a check that fires
   * on the last step of a form is a worse experience than a sentence on the page.
   */
  resolve: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const state = String(form.get('state') ?? '') as TakedownState;
    const outcome = String(form.get('outcome') ?? '').trim().slice(0, 2000);

    if (!RESOLUTIONS.includes(state)) return fail(400, { message: 'Pick what happened to it.' });
    if (outcome.length < 5) {
      return fail(400, { message: 'Say what you did - a line is enough, and it is the whole point of keeping these.' });
    }

    const { error: e } = await sb.from('takedowns').update({
      state,
      outcome,
      resolved_at: new Date().toISOString(),
      resolved_by: locals.viewer!.id
    }).eq('id', id).eq('state', 'open');
    if (e) return fail(500, { message: e.message });

    // In the audit log like every other moderator action (D-42), so an admin reading the log sees
    // takedowns beside the removals they caused rather than having to join the two by hand.
    await audit.record(sb, locals.viewer!.id, 'takedown.' + state, 'takedown:' + id, outcome);
    return { message: 'Closed as ' + state + '.' };
  },

  /** Put one back in the queue. Resolving is a judgement and judgements are sometimes wrong. */
  reopen: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);
    const id = String((await request.formData()).get('id') ?? '');

    // The outcome text is KEPT, not cleared: what somebody decided last time is part of the record
    // even when it is being undone, and clearing it would quietly erase the thing being corrected.
    const { error: e } = await sb.from('takedowns')
      .update({ state: 'open', resolved_at: null, resolved_by: null }).eq('id', id);
    if (e) return fail(500, { message: e.message });

    await audit.record(sb, locals.viewer!.id, 'takedown.reopen', 'takedown:' + id);
    return { message: 'Back in the queue.' };
  }
};
