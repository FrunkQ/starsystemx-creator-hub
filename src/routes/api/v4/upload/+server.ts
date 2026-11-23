// PUBLISH AN SSE4 CAMPAIGN OR PACK (D-98). One JSON file: a campaign save or a pack manifest.
//
// The same gates as a V3 upload (account state, size, the new-account wait, the daily allowance) and
// the same attestation; a pack for a named setting carries the same fan-work statement (D-61).
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { checkPreflight } from '$lib/server/gates';
import { whyNotContributing } from '$lib/server/auth';
import { gatesForTier } from '$lib/server/entitlements';
import { publishV4 } from '$lib/server/v4';
import { ATTESTATION_TEXT_VERSION } from '$lib/attestation';
import { cleanSetting } from '$lib/fanWork';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  const viewer = locals.viewer;
  const blocked = whyNotContributing(viewer);
  if (blocked) return json({ ok: false, code: 'sign-in', message: blocked }, { status: 401 });

  const sb = db(env);
  const { data: me } = await sb.from('creators').select('account_tier').eq('id', viewer!.id).maybeSingle();
  const gates = gatesForTier(await loadGates(sb), (me?.account_tier as 'free' | 'pro') ?? 'free');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ ok: false, code: 'no-file', message: 'Choose a campaign save or a pack to upload.' }, { status: 400 });
  if (form.get('attest') !== 'on') {
    return json({ ok: false, code: 'attest', message: 'Please confirm the statement above the button first.' }, { status: 400 });
  }
  const refusal = await checkPreflight(sb, gates, viewer!, file.size, false);
  if (refusal) return json({ ok: false, ...refusal }, { status: 429 });

  const result = await publishV4(env, sb, viewer!, new Uint8Array(await file.arrayBuffer()), {
    maxBytes: gates.max_bundle_bytes,
    fanSetting: cleanSetting(form.get('fanSetting')),
    attestationVersion: ATTESTATION_TEXT_VERSION,
    title: form.get('title') as string | null,
    summary: form.get('summary') as string | null
  });
  if (!result.ok) {
    const { status, ...body } = result;
    return json(body, { status });
  }
  return json(result);
};
