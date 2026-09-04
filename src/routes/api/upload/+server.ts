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
import { loadSite } from '$lib/server/site';
import { gatesForTier } from '$lib/server/entitlements';
import { tolerantWrite } from '$lib/server/tolerant';
import type { UploadEventRow } from '$lib/server/database.types';
import { ATTESTATION_TEXT, ATTESTATION_TEXT_VERSION } from '$lib/attestation';
import * as badges from '$lib/server/integrations/badges';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const sb = db(env);
  const viewer = locals.viewer;

  // EVERY REFUSAL IS RECORDED (0014), with its code, so "how many uploads fail, and why" is a
  // query on /admin/stats rather than a guess. Fire and forget - a refusal is not worth failing
  // twice over - and tolerant of the columns not existing yet.
  let bytesSeen = 0;
  let replacesSystemId: string | undefined;
  const refuse = (status: number, body: { code: string; message: string; detail?: unknown }) => {
    platform?.context?.waitUntil?.(
      tolerantWrite({
        id: crypto.randomUUID(), creator_id: viewer?.id ?? null, system_id: replacesSystemId ?? null,
        novel_hashes: 0, total_hashes: 0, bytes: bytesSeen, is_update: !!replacesSystemId, flagged: false,
        outcome: 'refused', reason: body.code
      }, (row) => Promise.resolve(sb.from('upload_events').insert(row as Partial<UploadEventRow>)))
        .then(() => undefined, () => undefined)
    );
    return json({ ok: false, ...body }, { status });
  };

  if (!mayContribute(viewer)) return refuse(401, { code: 'sign-in', message: 'Sign in to share a map.' });

  const baseGates = await loadGates(sb);

  // A tier is a set of config rows applied over the base gates, not a branch in code.
  const { data: me } = await sb.from('creators').select('account_tier').eq('id', viewer!.id).maybeSingle();
  const gates = gatesForTier(baseGates, (me?.account_tier as 'free' | 'pro') ?? 'free');

  const form = await request.formData();
  // `bundle` is the hub's own form; `file` is what the engine's hub/hubUpload.ts posts. Both are
  // right, and refusing one of them over its field name would be a silly way to lose an upload.
  const file = form.get('bundle') ?? form.get('file');
  if (!(file instanceof File)) return refuse(400, { code: 'no-file', message: 'Choose a save file to upload.' });
  bytesSeen = file.size;

  replacesSystemId = (form.get('replaces') as string) || undefined;
  // NOT a mode selector. The GM/player choice was made in the app at export time, so it is a
  // property of the file and the hub reads it (bundle/gmContent.ts). This is only the creator's
  // answer to a warning the hub raised, and it is meaningless unless GM content was detected.
  const confirmGmTree = form.get('confirmGmTree') === 'on';
  // "Take it out for me" - the hub strips, re-detects, and refuses if anything survived.
  const stripGm = form.get('stripGm') === 'on';
  // "Yes, replace the newer published copy with this older file" - the answer to a stale-revision
  // refusal, and meaningless without one.
  const confirmStale = form.get('confirmStale') === 'on';

  // The attestation. Recorded with the EXACT text shown, so an old record still says what was
  // actually agreed to even after the wording changes.
  const attestation = {
    accepted: form.get('attest') === 'on',
    textVersion: ATTESTATION_TEXT_VERSION,
    textShown: ATTESTATION_TEXT
  };

  const refusal = await checkPreflight(sb, gates, viewer!, file.size, !!replacesSystemId);
  if (refusal) return refuse(429, refusal);

  if (replacesSystemId) {
    const { data: own } = await sb.from('systems')
      .select('creator_id').eq('id', replacesSystemId).maybeSingle();
    if (!own || own.creator_id !== viewer!.id) {
      return refuse(403, { code: 'not-yours', message: 'That is not your map.' });
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let result;
  try {
    const site = await loadSite(sb, new URL(request.url));
    result = await ingest(env, sb, viewer!, gates, bytes, {
      confirmGmTree, stripGm, confirmStale, replacesSystemId, attestation, site
    });
  } catch (e) {
    console.error('ingest failed', e);
    return refuse(500, { code: 'ingest-failed', message: 'Something went wrong reading that save.' });
  }

  if (!result.ok) return refuse(400, { code: result.code, message: result.message, detail: result.detail });

  // Badges are derived, so reconciling here is cheap and idempotent; the outbox collapses repeats.
  await badges.reconcile(sb, gates, viewer!.id);

  return json(result);
};
