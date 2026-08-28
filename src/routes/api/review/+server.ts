// Record a review decision. Admin only.
//
// The decision is written AGAINST THE HASH (design 6.4). Every future upload of those exact bytes
// inherits it, an approved hash never re-enters the queue, and a banned hash is refused at upload
// before anything reaches R2.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import * as audit from '$lib/server/audit';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  // The request body is whatever a client sent. Shape it at the boundary and validate below;
  // nothing downstream sees an unchecked value.
  type ReviewBody = { hash?: unknown; verdict?: unknown; reason?: unknown; note?: unknown };
  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  const hash = String(body?.hash ?? '').toLowerCase();
  const verdict = body?.verdict;

  if (!/^[0-9a-f]{64}$/.test(hash)) return json({ ok: false }, { status: 400 });
  if (verdict !== 'approved' && verdict !== 'banned' && verdict !== 'novel') {
    return json({ ok: false }, { status: 400 });
  }

  const sb = db(env);
  await ledger.decide(sb, {
    hash,
    verdict,
    reason: body?.reason as 'content' | 'copyright' | 'spam' | undefined,
    note: typeof body?.note === 'string' ? body.note : undefined,
    adminId: locals.viewer.id
  });

  // Reject needs a reason, because the reason drives what happens next: a copyright rejection is a
  // note to the creator, a content rejection may be a creator-level action (design 6.4).
  await audit.record(
    sb, locals.viewer.id,
    verdict === 'novel' ? 'asset.undo' : verdict === 'approved' ? 'asset.approve' : 'asset.ban',
    'sha256:' + hash,
    typeof body?.reason === 'string' ? body.reason : undefined,
    { note: typeof body?.note === 'string' ? body.note : null }
  );

  // Any open asset reports are settled by the decision that answers them.
  if (verdict !== 'novel') {
    await sb.from('reports')
      .update({ state: verdict === 'banned' ? 'actioned' : 'dismissed' })
      .eq('sha256', hash).eq('state', 'open');
  }

  return json({ ok: true });
};
