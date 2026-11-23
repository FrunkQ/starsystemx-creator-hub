// REPORT A V4 ITEM (D-98). Signed in only, one report per person per item, as for maps.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { whyNotContributing } from '$lib/server/auth';

const REASONS = ['content', 'copyright', 'spam', 'other'] as const;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  const blocked = whyNotContributing(locals.viewer);
  if (blocked) return json({ ok: false, code: 'sign-in', message: blocked }, { status: 401 });

  const form = await request.formData();
  const slug = String(form.get('slug') ?? '');
  const reason = String(form.get('reason') ?? 'other') as (typeof REASONS)[number];
  if (!REASONS.includes(reason)) return json({ ok: false }, { status: 400 });
  const detail = String(form.get('detail') ?? '').slice(0, 2000) || null;

  const sb = db(env);
  const { data: item } = await sb.from('v4_items').select('id').eq('slug', slug).maybeSingle();
  if (!item) throw error(404, 'not found');
  const { error: e } = await sb.from('v4_reports').insert({
    id: crypto.randomUUID(), reporter_id: locals.viewer!.id, item_id: item.id, reason, detail, state: 'open',
    created_at: new Date().toISOString()
  });
  // A second report by the same person is the unique constraint doing its job: already recorded.
  if (e && e.code !== '23505') throw error(500, 'could not save that report');
  return json({ ok: true });
};
