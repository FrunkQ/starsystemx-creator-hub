// Reports (design 6.5).
//
// A report targets either a MAP or a specific ASSET, and the distinction matters: an asset report
// feeds the hash queue directly and therefore protects every other map using the same bytes.
//
// SIGNED-IN REPORTERS ONLY. An anonymous report button is a griefing tool.
import type { RequestHandler } from './$types';
import { json, error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { mayContribute } from '$lib/server/auth';

const REASONS = ['content', 'copyright', 'spam', 'other'];

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const viewer = locals.viewer;
  if (!mayContribute(viewer)) {
    return json({ ok: false, code: 'sign-in', message: 'Sign in to report something.' }, { status: 401 });
  }

  const form = await request.formData();
  const slug = String(form.get('slug') ?? '');
  const sha256 = String(form.get('sha256') ?? '').toLowerCase();
  const commentId = String(form.get('comment') ?? '');
  const reason = String(form.get('reason') ?? 'other');
  const detail = String(form.get('detail') ?? '').slice(0, 2000);

  if (!REASONS.includes(reason)) return json({ ok: false }, { status: 400 });

  const sb = db(env);

  if (sha256) {
    if (!/^[0-9a-f]{64}$/.test(sha256)) return json({ ok: false }, { status: 400 });
    const { error: e } = await sb.from('reports').insert({
      id: crypto.randomUUID(), reporter_id: viewer!.id, target: 'asset',
      sha256, reason, detail
    });
    // A duplicate is the unique index doing its job - ten reports on one image is one decision,
    // not ten. Report it back as success: the reporter's intent was already recorded.
    if (e && !e.message.includes('duplicate')) throw error(500, 'could not save that report');
  } else if (commentId) {
    // ONE COMMENT (0024, D-33). The map it sits under travels with it, so the reports page can
    // show where; the unique index makes ten reports of one comment one decision.
    if (!/^[0-9a-f-]{36}$/.test(commentId)) return json({ ok: false }, { status: 400 });
    const { data: c } = await sb.from('comments').select('id, system_id').eq('id', commentId).maybeSingle();
    if (!c) throw error(404, 'Not found');
    const { error: e } = await sb.from('reports').insert({
      id: crypto.randomUUID(), reporter_id: viewer!.id, target: 'comment',
      comment_id: c.id, system_id: c.system_id, reason, detail
    });
    if (e && !e.message.includes('duplicate')) throw error(500, 'could not save that report');
    redirect(303, '/s/' + slug + '?reported=1#comments');
  } else {
    const { data: system } = await sb.from('systems').select('id').eq('slug', slug).maybeSingle();
    if (!system) throw error(404, 'Not found');
    const { error: e } = await sb.from('reports').insert({
      id: crypto.randomUUID(), reporter_id: viewer!.id, target: 'system',
      system_id: system.id, reason, detail
    });
    if (e && !e.message.includes('duplicate')) throw error(500, 'could not save that report');
  }

  redirect(303, slug ? '/s/' + slug + '?reported=1' : '/');
};
