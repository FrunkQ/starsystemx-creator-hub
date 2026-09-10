// A COPIED SYSTEM COUNTS AS A TAKEAWAY (D-77).
//
// ============================================================================================
// The owner: *"Count clicking on 'copy a System' as a download."*
//
// A single system cannot be opened in Star System Explorer - the engine refuses one through
// `?open=` (R-18) - so the hub offers "Copy for Star System Explorer" instead (D-56). For those
// maps, Copy IS the download, and counting only the download button made the busiest systems look
// like the least popular purely because of a limitation in a different program.
//
// PUBLIC AND UNAUTHENTICATED, exactly like the download it mirrors: taking a map needs no account
// and never will. Which means this endpoint can be POSTed to by anyone, so what it does has to be
// harmless if it is - and it is: it increments a public counter and writes a row carrying a
// week-scoped visitor hash. The same is true of holding the download URL open in a loop.
//
// NO NEW ABUSE SURFACE WORTH GUARDING, then, but the shape is deliberately narrow: it takes a SLUG,
// finds a PUBLIC map, and counts. There is nothing to pass that reaches anything else.
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { countTakeaway } from '$lib/server/takeaway';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = String(body?.slug ?? '').slice(0, 120);
  if (!slug) throw error(400, 'no slug');

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    .select('id, state, visibility').eq('slug', slug).maybeSingle();
  // A draft or a taken-down map is not being taken away by anybody. Silent 404, like the download.
  if (!system || system.state !== 'public') throw error(404, 'not found');

  countTakeaway(env, sb, system.id as string, request,
    platform?.context?.waitUntil?.bind(platform.context));

  return json({ ok: true });
};
