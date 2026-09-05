import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as audit from '$lib/server/audit';

// Every live comment on the hub, newest first, with Remove on each row - so an admin never hunts
// for one map by map (owner, 2026-09-05: "admins need to be able to delete comments easily").
// Removal is the same soft removal as everywhere else: kept, marked, counted out, restorable, and
// audited (design 6.7). The removed list is the other tab.
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const removed = url.searchParams.has('removed');
  const base = sb.from('comments')
    .select('id, body, created_at, creator_id, removed_at, removed_reason, systems(slug, title)');
  const filtered = removed ? base.not('removed_at', 'is', null) : base.is('removed_at', null);
  const { data: rows, error: e } = await filtered.order('created_at', { ascending: false }).limit(100);
  if (e) return { comments: [], removed, problem: e.message };

  const ids = [...new Set((rows ?? []).flatMap((r) => (r.creator_id ? [r.creator_id] : [])))];
  const { data: people } = ids.length
    ? await sb.from('creators').select('id, handle, display_name').in('id', ids)
    : { data: [] as { id: string; handle: string; display_name: string | null }[] };
  const person = new Map((people ?? []).map((p) => [p.id, p]));

  return {
    comments: (rows ?? []).map((r) => {
      const p = r.creator_id ? person.get(r.creator_id) : undefined;
      return {
        id: r.id, body: r.body, created_at: r.created_at,
        removed_at: r.removed_at, removed_reason: r.removed_reason,
        // No author left: they deleted their account and chose to leave their words (0022).
        by: p ? p.display_name ?? p.handle : r.creator_id ? r.creator_id.slice(0, 8) : 'a former explorer',
        handle: p?.handle ?? null,
        map: r.systems ? { slug: r.systems.slug, title: r.systems.title } : null
      };
    }),
    removed,
    problem: null
  };
};

const ID = /^[0-9a-f-]{36}$/;

export const actions: Actions = {
  remove: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');
    const id = String((await request.formData()).get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'bad id' });

    const sb = db(env);
    const { error: e } = await sb.from('comments')
      .update({ removed_at: new Date().toISOString(), removed_by: locals.viewer.id, removed_reason: 'admin' })
      .eq('id', id).is('removed_at', null);
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, locals.viewer.id, 'comment.remove', id, 'admin removal');
    return { done: 'removed' };
  },

  restore: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');
    const id = String((await request.formData()).get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'bad id' });

    const sb = db(env);
    const { error: e } = await sb.from('comments')
      .update({ removed_at: null, removed_by: null, removed_reason: null }).eq('id', id);
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, locals.viewer.id, 'comment.restore', id);
    return { done: 'restored' };
  }
};
