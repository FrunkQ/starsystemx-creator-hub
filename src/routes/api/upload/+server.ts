// THE UPLOAD ENDPOINT.
//
// Gates first, then ingest. Note what is NOT here: nothing blocks an upload for containing novel
// images. Design 6.2 - "an upload is never blocked; an unreviewed ASSET is never served" - and a
// hub with a review backlog is a dead funnel.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { checkPreflight } from '$lib/server/gates';
import { mayContribute } from '$lib/server/auth';
import { ingest } from '$lib/server/ingest';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const viewer = locals.viewer;
  if (!mayContribute(viewer)) {
    return json({ ok: false, code: 'sign-in', message: 'Sign in to share a map.' }, { status: 401 });
  }

  const sb = db(env);
  const gates = await loadGates(sb);

  const form = await request.formData();
  const file = form.get('bundle');
  if (!(file instanceof File)) {
    return json({ ok: false, code: 'no-file', message: 'Choose a save file to upload.' }, { status: 400 });
  }

  const replacesSystemId = (form.get('replaces') as string) || undefined;
  // "Creator picks what publishes, with a preview" (decision 1). The default is the PLAYER tree -
  // never silently publish a GM tree (design 3.1). The engine has already done the redaction on
  // export; this flag only records which of the two the creator chose to upload.
  const publishGmTree = form.get('publishGmTree') === 'on';

  const refusal = await checkPreflight(sb, gates, viewer!, file.size, !!replacesSystemId);
  if (refusal) return json({ ok: false, ...refusal }, { status: 429 });

  if (replacesSystemId) {
    const { data: own } = await sb.from('systems')
      .select('creator_id').eq('id', replacesSystemId).maybeSingle();
    if (!own || own.creator_id !== viewer!.id) {
      return json({ ok: false, code: 'not-yours', message: 'That is not your map.' }, { status: 403 });
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let result;
  try {
    result = await ingest(env, sb, viewer!, gates, bytes, { publishGmTree, replacesSystemId });
  } catch (e) {
    console.error('ingest failed', e);
    return json(
      { ok: false, code: 'ingest-failed', message: 'Something went wrong reading that save.' },
      { status: 500 }
    );
  }

  return json(result, { status: result.ok ? 200 : 400 });
};
