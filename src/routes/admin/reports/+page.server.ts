import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { Db } from '$lib/server/database.types';
import { loadGates } from '$lib/server/config';
import * as accounts from '$lib/server/accounts';
import * as audit from '$lib/server/audit';

// Reports, and what to do about them (D-33). A picture report is settled in the review queue;
// a map report by taking the map down or dismissing it; a comment report by removing the
// comment or dismissing it. Every action closes the report, so the queue empties.
export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  // Reasons drive triage order, and report velocity against one creator or one hash is itself a
  // signal (design 6.5 / 6.6).
  const { data: open } = await sb.from('reports')
    .select('id, target, reason, detail, created_at, sha256, comment_id, systems(slug, title), comments(body, creator_id, removed_at)')
    .eq('state', 'open').order('created_at', { ascending: false }).limit(100);

  const ids = [...new Set((open ?? []).flatMap((r) => (r.comments?.creator_id ? [r.comments.creator_id] : [])))];
  const { data: people } = ids.length
    ? await sb.from('creators').select('id, handle').in('id', ids)
    : { data: [] as { id: string; handle: string }[] };
  const handle = new Map((people ?? []).map((p) => [p.id, p.handle]));

  return {
    reports: (open ?? []).map((r) => ({
      id: r.id, target: r.target, reason: r.reason, detail: r.detail, created_at: r.created_at, sha256: r.sha256,
      map: r.systems ? { slug: r.systems.slug, title: r.systems.title } : null,
      comment: r.comments
        ? { body: r.comments.body, by: r.comments.creator_id ? handle.get(r.comments.creator_id) ?? null : null, removed: !!r.comments.removed_at }
        : null
    }))
  };
};

async function admin(platform: App.Platform | undefined, locals: App.Locals) {
  const env = platform?.env;
  if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');
  return { env, sb: db(env), me: locals.viewer };
}

async function openReport(sb: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw error(400, 'bad id');
  const { data } = await sb.from('reports').select('id, target, system_id, comment_id').eq('id', id).eq('state', 'open').maybeSingle();
  if (!data) throw error(404, 'Not found');
  return data;
}

const settle = (sb: Db, id: string, state: 'actioned' | 'dismissed') =>
  sb.from('reports').update({ state }).eq('id', id);

export const actions: Actions = {
  dismiss: async ({ request, platform, locals }) => {
    const { sb, me } = await admin(platform, locals);
    const report = await openReport(sb, String((await request.formData()).get('id') ?? ''));
    await settle(sb, report.id, 'dismissed');
    await audit.record(sb, me.id, 'report.dismiss', 'report:' + report.id);
    return { done: 'Dismissed.' };
  },

  takedown: async ({ request, platform, locals }) => {
    const { sb, me } = await admin(platform, locals);
    const form = await request.formData();
    const report = await openReport(sb, String(form.get('id') ?? ''));
    if (!report.system_id) return fail(400, { message: 'That report is not about a map.' });
    const { data: map } = await sb.from('systems').select('id, creator_id').eq('id', report.system_id).maybeSingle();
    if (!map) return fail(404, { message: 'The map is gone.' });
    const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
    try { await accounts.takeDownSystem(sb, await loadGates(sb), me.id, map, note); }
    catch (e) { return fail(500, { message: (e as Error).message }); }
    await settle(sb, report.id, 'actioned');
    return { done: 'Map taken down.' };
  },

  removeComment: async ({ request, platform, locals }) => {
    const { sb, me } = await admin(platform, locals);
    const report = await openReport(sb, String((await request.formData()).get('id') ?? ''));
    if (!report.comment_id) return fail(400, { message: 'That report is not about a comment.' });
    const { error: e } = await sb.from('comments')
      .update({ removed_at: new Date().toISOString(), removed_by: me.id, removed_reason: 'admin' })
      .eq('id', report.comment_id).is('removed_at', null);
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, me.id, 'comment.remove', report.comment_id, 'reported');
    await settle(sb, report.id, 'actioned');
    return { done: 'Comment removed.' };
  }
};
