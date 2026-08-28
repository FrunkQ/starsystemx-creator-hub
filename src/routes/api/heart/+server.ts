// Hearts (design 6.5). One per user per system - the constraint is the hearts table's primary key.
//
// Not decoration: for a funnel, discovery IS the product, and hearts are the ranking axis that
// makes a front page possible. They require an account for the same reason reports do.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { mayContribute } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const viewer = locals.viewer;
  if (!mayContribute(viewer)) {
    return json({ ok: false, code: 'sign-in', message: 'Sign in to heart a map.' }, { status: 401 });
  }

  type HeartBody = { slug?: unknown; on?: unknown };
  const body = (await request.json().catch(() => null)) as HeartBody | null;
  const slug = String(body?.slug ?? '');
  const on = body?.on !== false;

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    .select('id, state, visibility').eq('slug', slug).maybeSingle();
  if (!system || system.state !== 'public' || system.visibility !== 'public') throw error(404, 'Not found');

  if (on) {
    // The count is maintained by trigger (db/migrations/0004), so a repeat insert cannot inflate it.
    await sb.from('hearts').upsert(
      { creator_id: viewer!.id, system_id: system.id },
      { onConflict: 'creator_id,system_id', ignoreDuplicates: true }
    );
  } else {
    await sb.from('hearts').delete().eq('creator_id', viewer!.id).eq('system_id', system.id);
  }

  const { data: fresh } = await sb.from('systems').select('hearts_count').eq('id', system.id).maybeSingle();
  return json({ ok: true, hearts: fresh?.hearts_count ?? 0 });
};
