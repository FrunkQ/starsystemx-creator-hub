// Creator-uploaded screenshots.
//
// ============================================================================================
// THESE GO THROUGH THE ORDINARY LEDGER. That is the point of keying moderation on BYTES rather
// than on where a file came from: a screenshot the creator picked in a file dialog is reviewed by
// exactly the same queue, deduped against bundled pictures, and inherits an existing verdict if
// those bytes are already known.
//
// No second moderation path. A second path is a second thing to get wrong, and it is the one an
// attacker would look for.
// ============================================================================================
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { mayContribute } from '$lib/server/auth';
import { sha256Hex } from '$lib/bundle/hash';
import { ALLOWED_IMAGE_EXT, MIME_BY_EXT, extOf } from '$lib/bundle/contract';
import * as ledger from '$lib/server/ledger';
import * as r2 from '$lib/server/r2';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');

  const viewer = locals.viewer;
  if (!mayContribute(viewer)) {
    return json({ ok: false, code: 'sign-in', message: 'Sign in to add a screenshot.' }, { status: 401 });
  }

  const sb = db(env);
  const gates = await loadGates(sb);

  const form = await request.formData();
  const systemId = String(form.get('systemId') ?? '');
  const file = form.get('image');
  const caption = String(form.get('caption') ?? '').slice(0, 200) || null;

  if (!(file instanceof File)) {
    return json({ ok: false, message: 'Choose an image.' }, { status: 400 });
  }

  const { data: own } = await sb.from('systems').select('creator_id').eq('id', systemId).maybeSingle();
  if (!own || own.creator_id !== viewer!.id) {
    return json({ ok: false, message: 'That is not your map.' }, { status: 403 });
  }

  const ext = extOf(file.name);
  if (!(ALLOWED_IMAGE_EXT as readonly string[]).includes(ext)) {
    return json(
      { ok: false, message: 'Screenshots can be JPG, PNG, WebP or GIF.' },
      { status: 400 }
    );
  }
  if (file.size > 8 * 1024 * 1024) {
    return json({ ok: false, message: 'That image is larger than 8 MB.' }, { status: 400 });
  }

  const { count } = await sb.from('system_screenshots')
    .select('sha256', { count: 'exact', head: true }).eq('system_id', systemId);
  if ((count ?? 0) >= gates.max_screenshots_per_system) {
    return json(
      { ok: false, message: 'That map already has the maximum of ' + gates.max_screenshots_per_system + ' screenshots.' },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The hub hashes. Always (docs/contract-with-sse.md C-03).
  const sha256 = await sha256Hex(bytes);

  const known = await ledger.lookup(sb, [sha256]);
  if (known.get(sha256) === 'banned') {
    return json(
      { ok: false, message: 'That image was previously removed from the hub.' },
      { status: 400 }
    );
  }

  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  if (!(await r2.has(env, sha256))) await r2.putAsset(env, sha256, bytes, mime);

  await ledger.registerNovel(
    sb,
    known.has(sha256) ? [] : [{ sha256, kind: 'image', byte_size: bytes.length, mime }],
    false
  );

  const { error: e } = await sb.from('system_screenshots').upsert({
    system_id: systemId, sha256, ordinal: (count ?? 0) + 1, caption
  }, { onConflict: 'system_id,sha256', ignoreDuplicates: true });
  if (e) throw error(500, 'could not save that screenshot');

  return json({
    ok: true,
    sha256,
    // Honest about what happens next rather than showing a picture that will not load for anyone
    // else yet.
    awaitingReview: known.get(sha256) !== 'approved'
  });
};

export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!mayContribute(locals.viewer)) throw error(401, 'sign in');

  const body = (await request.json().catch(() => null)) as { systemId?: unknown; sha256?: unknown } | null;
  const systemId = String(body?.systemId ?? '');
  const sha256 = String(body?.sha256 ?? '');

  const sb = db(env);
  const { data: own } = await sb.from('systems').select('creator_id').eq('id', systemId).maybeSingle();
  if (!own || own.creator_id !== locals.viewer!.id) throw error(403, 'not yours');

  // Only the LINK is removed. The bytes stay in R2 behind the refcount, and the ledger row - with
  // its verdict - stays regardless (design 7.2): another map may use the same image, and a verdict
  // must outlive the upload that introduced it.
  await sb.from('system_screenshots').delete().eq('system_id', systemId).eq('sha256', sha256);
  return json({ ok: true });
};
