// The creator's own page for a map: write it up, add screenshots, choose or design a cover, publish.
//
// The bundle supplies facts (what bodies exist). THIS supplies the pitch - the part that makes
// somebody click download. Both matter, and only the creator can write the second one.
import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import { sanitiseTags, vocabularyFrom } from '$lib/vocabulary';
import { storeGeneratedCover, linkCover, coverNodeFrom, coverFacts } from '$lib/server/cover';
import { coverOptionsFrom } from '$lib/cover/generate';
import { tolerantWrite } from '$lib/server/tolerant';
import type { SystemRow } from '$lib/server/database.types';
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

  const [{ data: shots }, { data: claims }, gates, { data: me }] = await Promise.all([
    sb.from('system_screenshots').select('sha256, ordinal, caption').eq('system_id', system.id).order('ordinal'),
    sb.from('asset_claims').select('sha256, no_provenance, cc_by_breach, title, credit, license')
      .eq('system_id', system.id),
    loadGates(sb),
    sb.from('creators').select('account_tier').eq('id', locals.viewer.id).maybeSingle()
  ]);

  const hashes = (claims ?? []).map((c) => c.sha256);
  const approved = await ledger.approvedOnly(sb, [...hashes, ...(shots ?? []).map((s) => s.sha256)]);

  // WHY PUBLISHING IS BLOCKED, IN THE CREATOR'S OWN TERMS. A gate that just says "no" is a gate
  // people complain about; one that names the three pictures needing a credit is a gate they clear.
  const blocking = (claims ?? []).filter((c) => c.no_provenance || c.cc_by_breach);

  const { data: vocabRow } = await sb.from('config')
    .select('value').eq('key', 'creator_vocabulary').maybeSingle();

  // The designer is free for everyone at launch and a config row away from being Pro (D-22).
  const proOnly = gates.cover_designer_tier === 'pro';
  const allowed = !proOnly || me?.account_tier === 'pro';

  return {
    vocabulary: vocabularyFrom(vocabRow?.value ?? null),
    system,
    screenshots: (shots ?? []).map((s) => ({ ...s, approved: approved.has(s.sha256) })),
    blocking,
    mayPublish: blocking.length === 0,
    coverOptions: coverOptionsFrom(system.cover_options),
    // Is the current cover one of the creator's screenshots, or a card the hub drew?
    coverIsScreenshot: !!system.cover_sha256 && (shots ?? []).some((s) => s.sha256 === system.cover_sha256),
    designer: { allowed, proOnly },
    label: gates.cover_label
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

  /** Use one of the map's own screenshots as the cover. */
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

    // A chosen picture supersedes a designed card, so the design is forgotten: a later re-upload
    // must not redraw over the picture the creator picked.
    await tolerantWrite({ cover_sha256: sha256, cover_options: null },
      (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', params.id)));
    return { ok: true };
  },

  /** Draw a card to the creator's design and make it the cover (D-22). */
  design: async ({ request, params, platform, locals, url }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const system = await ownedSystem(sb, params.id, locals.viewer.id);

    const [gates, site, { data: me }, { data: bodies }, { data: constructs }] = await Promise.all([
      loadGates(sb), loadSite(sb, url),
      sb.from('creators').select('account_tier, handle').eq('id', locals.viewer.id).maybeSingle(),
      sb.from('bodies').select('*').eq('system_id', system.id),
      sb.from('constructs').select('*').eq('system_id', system.id)
    ]);
    if (gates.cover_designer_tier === 'pro' && me?.account_tier !== 'pro') {
      return fail(403, { message: 'Designing a cover is a Pro feature at the moment.' });
    }

    const options = coverOptionsFrom(Object.fromEntries(await request.formData()));
    const hash = await storeGeneratedCover(env, sb, coverFacts({
      title: system.title, creator: me?.handle ?? locals.viewer.handle, kind: system.kind,
      systems: system.system_count, bodies: system.body_count, constructs: system.construct_count,
      url: site.url + '/s/' + system.slug, label: gates.cover_label
    }, [...(bodies ?? []), ...(constructs ?? [])].map(coverNodeFrom)), options);

    // The choices are kept so a re-upload redraws the same card over the new rows.
    await tolerantWrite({ cover_sha256: hash, cover_options: options },
      (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', system.id)));
    await linkCover(sb, system.id, hash);
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
