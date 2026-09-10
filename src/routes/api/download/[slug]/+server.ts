// THE DOWNLOAD. One click, no account (design 2).
//
// It is REASSEMBLED, never the stored zip - see src/lib/server/pack.ts for why that distinction is
// the easy thing to get wrong.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { packForDownload } from '$lib/server/pack';
import { countTakeaway } from '$lib/server/takeaway';
import { fanWorkHeader } from '$lib/fanWork';
import { withCors, preflight } from '$lib/server/cors';
import { visitorHash } from '$lib/server/visitor';

export const GET: RequestHandler = async ({ params, platform, request }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    .select('id, slug, title, state, visibility, fan_setting, hold_note')
    .eq('slug', params.slug).maybeSingle();

  if (!system || system.state !== 'public') throw error(404, 'not found');

  // The setting rides into the README so the notice travels with the file (D-61). Read from the
  // row rather than passed in: a download is not a place to trust a query string.
  const packed = await packForDownload(env, sb, system.id, system.slug,
    (system as { fan_setting?: string | null }).fan_setting ?? null,
    // A hold warning belongs in the file too - most people who need it never see the page (D-79).
    (system as { hold_note?: string | null }).hold_note ?? null);
  if (!packed) throw error(404, 'not found');

  // ONE PLACE COUNTS A MAP LEAVING (D-77). It was written out here; `?open=` has always come
  // through this route, and Copy now reaches the same helper rather than a second copy of it.
  countTakeaway(env, sb, system.id, request, platform?.context?.waitUntil?.bind(platform.context));

  return new Response(packed.bytes as unknown as ArrayBuffer, {
    // CORS: the SSE app fetches this cross-origin for `?hub=<slug>`. Without it the browser refuses
    // the response before the answer is read, and one-click open cannot work at all.
    headers: withCors({
      'content-type': packed.filename.endsWith('.json') ? 'application/json' : 'application/zip',
      'content-length': String(packed.bytes.length),
      'content-disposition': 'attachment; filename="' + packed.filename + '"',
      // THE NOTICE ON THE WIRE (D-61). A zip carries it in README.txt, but a bare .json save has no
      // README and must not grow one - it is a document the engine parses. So the statement rides
      // in a header, where anything that fetches this (the engine's one-click open included) can
      // read it without unpacking anything.
      'x-fan-work': fanWorkHeader((system as { fan_setting?: string | null }).fan_setting ?? null),
      // Never cache a download: what it contains depends on the ledger, and the ledger changes.
      'cache-control': 'no-store'
    })
  });
};

/** Preflight. A 404 here fails the real request as surely as a missing header would. */
export const OPTIONS: RequestHandler = async () => preflight();
