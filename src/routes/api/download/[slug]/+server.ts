// THE DOWNLOAD. One click, no account (design 2).
//
// It is REASSEMBLED, never the stored zip - see src/lib/server/pack.ts for why that distinction is
// the easy thing to get wrong.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { packForDownload } from '$lib/server/pack';

export const GET: RequestHandler = async ({ params, platform }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    .select('id, slug, title, state, visibility')
    .eq('slug', params.slug).maybeSingle();

  if (!system || system.state !== 'public') throw error(404, 'not found');

  const packed = await packForDownload(env, sb, system.id, system.slug);
  if (!packed) throw error(404, 'not found');

  // Fire and forget: a download counter is not worth failing a download over.
  // The postgrest builder is a thenable, not a Promise - wrap it before attaching a catch.
  platform?.context?.waitUntil?.(
    Promise.resolve(sb.rpc('increment_download', { p_system_id: system.id })).then(
      () => undefined,
      () => undefined
    )
  );

  return new Response(packed.bytes as unknown as ArrayBuffer, {
    headers: {
      'content-type': packed.filename.endsWith('.json') ? 'application/json' : 'application/zip',
      'content-disposition': 'attachment; filename="' + packed.filename + '"',
      // Never cache a download: what it contains depends on the ledger, and the ledger changes.
      'cache-control': 'no-store'
    }
  });
};
