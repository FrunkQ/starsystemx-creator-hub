// The creator's own page for a map: write it up, add screenshots, publish it.
//
// The bundle supplies facts (what bodies exist). THIS supplies the pitch - the part that makes
// somebody click download. Both matter, and only the creator can write the second one.
import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { sanitiseTags, vocabularyFrom, DEFAULT_VOCABULARY } from '$lib/vocabulary';
import { checkProvenance } from '$lib/bundle/attribution';
import * as ledger from '$lib/server/ledger';
import * as badges from '$lib/server/integrations/badges';
import * as audit from '$lib/server/audit';

async function ownedSystem(sb: ReturnType<typeof db>, id: string, viewerId: string) {
  const { data } = await sb.from('systems').select('*').eq('id', id).maybeSingle();
  if (!data || data.creator_id !== viewerId) throw error(404, 'Not found');
  return data;
}

export const load: PageServerLoad = async ({ params, platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!locals.viewer) throw error(401, 'Sign in first.');

  const sb = db(env);
  const system = await ownedSystem(sb, params.id, locals.viewer.id);

  const [{ data: shots }, { data: claims }] = await Promise.all([
    sb.from('system_screenshots').select('sha256, ordinal, caption').eq('system_id', system.id).order('ordinal'),
    sb.from('asset_claims').select('sha256, no_provenance, cc_by_breach, title, credit, license')
      .eq('system_id', system.id)
  ]);

  const hashes = (claims ?? []).map((c) => c.sha256);
  const approved = await ledger.approvedOnly(sb, [...hashes, ...(shots ?? []).map((s) => s.sha256)]);

  // WHY PUBLISHING IS BLOCKED, IN THE CREATOR'S OWN TERMS. A gate that just says "no" is a gate
  // people complain about; one that names the three pictures needing a credit is a gate they clear.
  const blocking = (claims ?? []).filter((c) => c.no_provenance || c.cc_by_breach);

  const { data: vocabRow } = await sb.from('config')
    .select('value').eq('key', 'creator_vocabulary').maybeSingle();

  return {
    vocabulary: vocabularyFrom(vocabRow?.value ?? null),
    system,
    screenshots: (shots ?? []).map((s) => ({ ...s, approved: approved.has(s.sha256) })),
    blocking,
    mayPublish: blocking.length === 0
  };
};

export const actions: Actions = {
  details: async ({ request, params, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    await ownedSystem(sb, params.id, locals.viewer.id);

    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim().slice(0, 120);
    if (!title) return fail(400, { message: 'A map needs a title.' });

    // Checkboxes from the curated list. Validated server-side against the vocabulary, because a
    // form field is whatever the client decided to send.
    const { data: vocabRow } = await sb.from('config')
      .select('value').eq('key', 'creator_vocabulary').maybeSingle();
    const tags = sanitiseTags(form.getAll('tags'), vocabularyFrom(vocabRow?.value ?? null));

    const { error: e } = await sb.from('systems').update({
      title,
      blurb: String(form.get('blurb') ?? '').trim().slice(0, 300) || null,
      description: String(form.get('description') ?? '').trim().slice(0, 8000) || null,
      tags
    }).eq('id', params.id);
    if (e) return fail(500, { message: e.message });

    return { ok: true };
  },

  cover: async ({ request, params, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    await ownedSystem(sb, params.id, locals.viewer.id);

    const sha256 = String((await request.formData()).get('sha256') ?? '');
    if (!/^[0-9a-f]{64}$/.test(sha256)) return fail(400, { message: 'Pick a screenshot.' });

    // Only an image already attached to THIS map may become its cover - otherwise the field is an
    // arbitrary pointer into the whole asset store.
    const { data: owned } = await sb.from('system_screenshots')
      .select('sha256').eq('system_id', params.id).eq('sha256', sha256).maybeSingle();
    if (!owned) return fail(400, { message: 'That image is not on this map.' });

    await sb.from('systems').update({ cover_sha256: sha256 }).eq('id', params.id);
    return { ok: true };
  },

  publish: async ({ request, params, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const gates = await loadGates(sb);
    const system = await ownedSystem(sb, params.id, locals.viewer.id);

    const wantPublic = String((await request.formData()).get('state') ?? '') === 'public';

    if (wantPublic) {
      // THE GATE IS RE-CHECKED SERVER-SIDE AT THE MOMENT OF PUBLISHING. The upload-time check is a
      // courtesy; this is the control. A creator can edit claims between the two.
      const { data: claims } = await sb.from('asset_claims')
        .select('no_provenance, cc_by_breach').eq('system_id', system.id);
      const blocked = (claims ?? []).filter(
        (c) => c.no_provenance || (gates.block_cc_by_breach && c.cc_by_breach)
      );
      if (blocked.length) {
        return fail(400, {
          message:
            blocked.length + ' ' + (blocked.length === 1 ? 'picture or model still needs' : 'pictures or models still need') +
            ' a source recorded before this can be shared.'
        });
      }
    }

    await sb.from('systems')
      .update({ state: wantPublic ? 'public' : 'draft' })
      .eq('id', system.id);

    await audit.record(sb, locals.viewer.id, wantPublic ? 'system.publish' : 'system.unpublish',
      'system:' + system.id);

    // Publishing (or pulling) a map can earn or lose a community badge.
    await badges.reconcile(sb, gates, locals.viewer.id);

    return { ok: true };
  }
};
