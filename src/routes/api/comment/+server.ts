// Comments (owner, 2026-09-05): a registered explorer says something under a map, and the count
// accumulates on the map like stars.
//
// SIGNED-IN ONLY, for the same reason as stars and reports. A plain form post with a redirect
// back to the map, so it works without a script. A comment is REMOVED, never deleted, by its
// author, by the map's cartographer, or by an admin; an admin's removal is audited (design 6.7).
// The rules themselves - what a comment becomes, who may remove one - are in src/lib/comments.ts.
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { mayContribute } from '$lib/server/auth';
import * as audit from '$lib/server/audit';
import { cleanComment, COMMENT_MAX, COMMENTS_PER_HOUR, removalRole } from '$lib/comments';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const form = await request.formData();
  const slug = String(form.get('slug') ?? '').slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(slug)) throw error(400, 'bad slug');
  const back: (code?: string) => never = (code) =>
    redirect(303, '/s/' + slug + (code ? '?comment=' + code : '') + '#comments');

  const viewer = locals.viewer;
  if (!viewer) redirect(303, '/login?next=' + encodeURIComponent('/s/' + slug + '#comments'));
  if (!mayContribute(viewer)) throw error(403, 'This account cannot comment.');

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    .select('id, creator_id, state, visibility').eq('slug', slug).maybeSingle();
  if (!system || system.state !== 'public' || system.visibility !== 'public') throw error(404, 'Not found');

  // REMOVAL. The claim that fits is the one recorded; nothing else about the row changes.
  const remove = String(form.get('remove') ?? '');
  if (remove) {
    const { data: c } = await sb.from('comments')
      .select('id, creator_id, removed_at').eq('id', remove).eq('system_id', system.id).maybeSingle();
    if (!c) throw error(404, 'Not found');
    const role = removalRole(viewer, c, system.creator_id);
    if (!role) throw error(403, 'Not yours to remove.');
    if (!c.removed_at) {
      const { error: e } = await sb.from('comments')
        .update({ removed_at: new Date().toISOString(), removed_by: viewer.id, removed_reason: role })
        .eq('id', c.id);
      if (e) { console.error('comment removal failed', e.message); back('failed'); }
      if (role === 'admin') await audit.record(sb, viewer.id, 'comment.remove', c.id, 'admin removal', { slug });
    }
    back('removed');
  }

  // POSTING.
  const body = cleanComment(form.get('body'));
  if (!body) back('empty');
  if (body.length > COMMENT_MAX) back('long');

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countErr } = await sb.from('comments')
    .select('id', { count: 'exact', head: true }).eq('creator_id', viewer.id).gte('created_at', since);
  // The table itself missing (migration 0021 not run yet) is the one failure worth a plain word.
  if (countErr) { console.warn('comments unavailable', countErr.message); back('off'); }
  if ((count ?? 0) >= COMMENTS_PER_HOUR) back('slow');

  // The same words twice under the same map is a double-submit, not a second opinion.
  const { data: dup } = await sb.from('comments').select('id')
    .eq('creator_id', viewer.id).eq('system_id', system.id).eq('body', body).is('removed_at', null).limit(1);
  if (dup?.length) back('posted');

  const { error: e } = await sb.from('comments')
    .insert({ id: crypto.randomUUID(), system_id: system.id, creator_id: viewer.id, body });
  if (e) { console.error('comment insert failed', e.message); back('failed'); }
  back('posted');
};
