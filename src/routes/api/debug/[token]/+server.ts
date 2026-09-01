// The anonymous debug upload.
//
// NOTHING IS PARSED HERE, deliberately - see src/lib/server/debugUploads.ts. The file that broke
// the parser is exactly the file this exists to collect, so running it through the parser would
// defeat the purpose and, worse, could fail in a way that loses it.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { usableInvite, acceptUpload } from '$lib/server/debugUploads';

export const POST: RequestHandler = async ({ params, request, platform }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const gates = await loadGates(sb);
  if (!gates.debug_uploads_enabled) throw error(404, 'Not found');

  const invite = await usableInvite(sb, params.token);
  if (!invite) {
    return json(
      { ok: false, message: 'This link has already been used, or it has expired. Ask for a new one.' },
      { status: 410 }
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ ok: false, message: 'Choose a file.' }, { status: 400 });

  if (file.size > gates.debug_max_bytes) {
    return json(
      { ok: false, message: 'That file is larger than this link accepts.' },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  await acceptUpload(env, sb, invite, file.name, String(form.get('note') ?? ''), bytes);

  return json({ ok: true });
};
