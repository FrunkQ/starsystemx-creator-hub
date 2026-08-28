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
import { gatesForTier } from '$lib/server/entitlements';
import { ATTESTATION_TEXT, ATTESTATION_TEXT_VERSION } from '$lib/attestation';
import * as badges from '$lib/server/integrations/badges';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const viewer = locals.viewer;
  if (!mayContribute(viewer)) {
    return json({ ok: false, code: 'sign-in', message: 'Sign in to share a map.' }, { status: 401 });
  }

  const sb = db(env);
  const baseGates = await loadGates(sb);

  // A tier is a set of config rows applied over the base gates, not a branch in code.
  const { data: me } = await sb.from('creators').select('account_tier').eq('id', viewer!.id).maybeSingle();
  const gates = gatesForTier(baseGates, (me?.account_tier as 'free' | 'pro') ?? 'free');

  const form = await request.formData();
  const file = form.get('bundle');
  if (!(file instanceof File)) {
    return json({ ok: false, code: 'no-file', message: 'Choose a save file to upload.' }, { status: 400 });
  }

  const replacesSystemId = (form.get('replaces') as string) || undefined;
  // NOT a mode selector. The GM/player choice was made in the app at export time, so it is a
  // property of the file and the hub reads it (bundle/gmContent.ts). This is only the creator's
  // answer to a warning the hub raised, and it is meaningless unless GM content was detected.
  const confirmGmTree = form.get('confirmGmTree') === 'on';

  // The attestation. Recorded with the EXACT text shown, so an old record still says what was
  // actually agreed to even after the wording changes.
  const attestation = {
    accepted: form.get('attest') === 'on',
    textVersion: ATTESTATION_TEXT_VERSION,
    textShown: ATTESTATION_TEXT
  };

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
    result = await ingest(env, sb, viewer!, gates, bytes, { confirmGmTree, replacesSystemId, attestation });
  } catch (e) {
    console.error('ingest failed', e);
    return json(
      { ok: false, code: 'ingest-failed', message: 'Something went wrong reading that save.' },
      { status: 500 }
    );
  }

  // Badges are derived, so reconciling here is cheap and idempotent; the outbox collapses repeats.
  if (result.ok) await badges.reconcile(sb, gates, viewer!.id);

  return json(result, { status: result.ok ? 200 : 400 });
};
