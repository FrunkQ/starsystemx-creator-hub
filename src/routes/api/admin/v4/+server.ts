// HOLD, RESTORE OR REMOVE A V4 ITEM (D-98). A moderator may hold and restore (content judgement,
// undoable); removing is the owner's. Every action is in the admin log with its reason.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff, isAdmin } from '$lib/server/auth';
import * as audit from '$lib/server/audit';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown; note?: unknown; closeReports?: unknown } | null;
  const id = String(body?.id ?? '');
  const action = String(body?.action ?? '');
  const note = String(body?.note ?? '').trim().slice(0, 500);
  if (!['hold', 'restore', 'remove', 'dismiss'].includes(action)) throw error(400, 'Which action?');
  if (action === 'remove' && !isAdmin(locals.viewer)) throw error(403, 'Removing is the owner\'s.');
  if ((action === 'hold' || action === 'remove') && !note) throw error(400, 'Say why: the reason goes in the log.');

  const sb = db(env);
  const { data: item } = await sb.from('v4_items').select('id, slug, state').eq('id', id).maybeSingle();
  if (!item) throw error(404, 'No such item');
  if (action !== 'dismiss') {
    const state = action === 'hold' ? 'held' : action === 'remove' ? 'removed' : 'public';
    await sb.from('v4_items').update({ state, hold_note: action === 'restore' ? null : note, updated_at: new Date().toISOString() }).eq('id', id);
  }
  await sb.from('v4_reports').update({ state: 'closed' }).eq('item_id', id).eq('state', 'open');
  await audit.record(sb, locals.viewer.id, 'v4.' + action, 'v4_item:' + item.slug, note || undefined, { from: item.state });
  return json({ ok: true });
};
