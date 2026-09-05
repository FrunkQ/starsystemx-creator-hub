import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// Everyone, newest first, or a search by handle: the way in to an explorer's own page (D-28).
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const q = (url.searchParams.get('q') ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  let query = sb.from('creators').select('id, handle, display_name, role, state, created_at');
  if (q) query = query.ilike('handle', '%' + q + '%');
  const { data: people } = await query.order('created_at', { ascending: false }).limit(50);

  const ids = (people ?? []).map((p) => p.id);
  const { data: maps } = ids.length
    ? await sb.from('systems').select('creator_id, state').in('creator_id', ids)
    : { data: [] as { creator_id: string; state: string }[] };
  const { data: comments } = ids.length
    ? await sb.from('comments').select('creator_id').in('creator_id', ids).is('removed_at', null)
    : { data: [] as { creator_id: string | null }[] };

  const mapsOf = new Map<string, { all: number; pub: number }>();
  for (const m of maps ?? []) {
    const c = mapsOf.get(m.creator_id) ?? { all: 0, pub: 0 };
    c.all++;
    if (m.state === 'public') c.pub++;
    mapsOf.set(m.creator_id, c);
  }
  const commentsOf = new Map<string, number>();
  for (const c of comments ?? []) if (c.creator_id) commentsOf.set(c.creator_id, (commentsOf.get(c.creator_id) ?? 0) + 1);

  // What just happened, when a deletion sent us here.
  const deleted = url.searchParams.get('deleted');
  const flash = deleted
    ? {
        handle: deleted,
        maps: Number(url.searchParams.get('maps') ?? 0),
        freed: Number(url.searchParams.get('freed') ?? 0),
        signIn: url.searchParams.get('signin') !== '0',
        id: url.searchParams.get('id') ?? ''
      }
    : null;

  return {
    q,
    people: (people ?? []).map((p) => ({
      ...p, maps: mapsOf.get(p.id) ?? { all: 0, pub: 0 }, comments: commentsOf.get(p.id) ?? 0
    })),
    flash
  };
};
