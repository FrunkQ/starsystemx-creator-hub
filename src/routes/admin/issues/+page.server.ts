import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/auth';
import * as audit from '$lib/server/audit';
import { mapsWithProblems } from '$lib/server/problems';

// THE ISSUES TAB (D-88). The owner, 2026-09-11: "A new issues tab near reports/takedowns/comments".
//
// A report is something a PERSON said about a map; an issue is something the hub READ in its file.
// They sit side by side because the response is the same kind of work: look, decide whether
// downloaders need warning (hold it, from the map's page), and move on.
//
// NOTHING HERE FIXES A MAP. Only its creator can, by uploading a new version - and when they do, the
// finding clears itself. What staff can do is NOTE one, which takes it out of the count without
// pretending it is fixed: a creator may never come back, and a badge that cannot reach zero stops
// being read.
export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  const rows = await mapsWithProblems(sb);
  // Before migration 0040 there is nowhere to have stored a finding. Said, not shown as "none".
  if (rows === null) return { ready: false, maps: [], drafts: 0 };

  const ids = [...new Set(rows.map((r) => r.creator_id))];
  const { data: people } = ids.length
    ? await sb.from('creators').select('id, handle, display_name').in('id', ids)
    : { data: [] as { id: string; handle: string; display_name: string | null }[] };
  const who = new Map((people ?? []).map((p) => [p.id, { handle: p.handle, name: p.display_name ?? p.handle }]));

  const maps = rows.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, state: r.state,
    creator: who.get(r.creator_id) ?? null,
    problems: r.problems,
    noted: !!r.problems_noted_at,
    onHold: !!(r.hold_note ?? '').trim(),
    updatedAt: r.updated_at
  }));
  return {
    ready: true,
    // PUBLIC ONES ARE THE WORK. A draft with problems is its creator's business, and they have
    // already been shown the advice - so drafts are counted, not listed.
    maps: maps.filter((m) => m.state === 'public'),
    drafts: maps.filter((m) => m.state !== 'public').length
  };
};

export const actions: Actions = {
  /** Staff have seen it. Out of the count; the pill and the advice stay until the file is fixed. */
  note: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const viewerId = locals.viewer.id;
    const id = String((await request.formData()).get('id') ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, { message: 'Which map?' });

    const sb = db(env);
    const { error: e } = await sb.from('systems')
      .update({ problems_noted_at: new Date().toISOString(), problems_noted_by: viewerId })
      .eq('id', id);
    if (e) return fail(500, { message: 'That did not save: ' + e.message });

    await audit.record(sb, viewerId, 'system.issues-noted', 'system:' + id);
    return { done: 'Noted. It stays marked on the map until its creator uploads a fixed version.' };
  }
};
