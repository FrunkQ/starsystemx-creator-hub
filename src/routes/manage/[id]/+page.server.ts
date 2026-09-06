// The creator's own page for a map: write it up, add screenshots, choose or design a cover,
// re-index it, publish it.
//
// The bundle supplies facts (what bodies exist). THIS supplies the pitch - the part that makes
// somebody click download. Both matter, and only the creator can write the second one.
import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import { sanitiseTags } from '$lib/vocabulary';
import { loadVocabulary, proposeTag } from '$lib/server/tags';
import {
  storeGeneratedCover, linkCover, factsFor, regenerateGeneratedCover, coverIsScreenshot
} from '$lib/server/cover';
import { reindexSystem } from '$lib/server/reindex';
import { coverOptionsFrom } from '$lib/cover/generate';
import { tolerantWrite } from '$lib/server/tolerant';
import { bestDensity } from '$lib/server/density';
import type { SystemRow } from '$lib/server/database.types';
import * as ledger from '$lib/server/ledger';
import * as accounts from '$lib/server/accounts';
import * as badges from '$lib/server/integrations/badges';
import { buildShare, queueShare } from '$lib/server/integrations/share';
import { drainOutbox } from '$lib/server/integrations/deliver';
import * as audit from '$lib/server/audit';

async function ownedSystem(sb: ReturnType<typeof db>, id: string, viewerId: string) {
  const { data } = await sb.from('systems').select('*').eq('id', id).maybeSingle();
  if (!data || data.creator_id !== viewerId) throw error(404, 'Not found');
  return data;
}

/** The base a designed card can be drawn over: only these two can be read on a Worker. */
const DRAWABLE = new Set(['image/png', 'image/jpeg']);

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
  const shotHashes = (shots ?? []).map((s) => s.sha256);
  const [approved, { data: shotAssets }] = await Promise.all([
    ledger.approvedOnly(sb, [...hashes, ...shotHashes]),
    shotHashes.length
      ? sb.from('assets').select('sha256, mime').in('sha256', shotHashes)
      : Promise.resolve({ data: [] as { sha256: string; mime: string }[] })
  ]);
  const mimeOf = new Map((shotAssets ?? []).map((a) => [a.sha256, a.mime]));

  // WHY PUBLISHING IS BLOCKED, IN THE CREATOR'S OWN TERMS. A gate that just says "no" is a gate
  // people complain about; one that names the three pictures needing a credit is a gate they clear.
  const blocking = (claims ?? []).filter((c) => c.no_provenance || c.cc_by_breach);

  // The vocabulary the hub actually serves: the curated list, the owner's override, and every
  // custom tag a reviewer has accepted (D-40).
  const vocabulary = await loadVocabulary(sb);
  // What this creator has asked for and nobody has answered yet, so the page can say so rather
  // than looking as though the word vanished.
  const { data: waiting } = await sb.from('tag_proposals')
    .select('tag, group_label, state, merged_into')
    .eq('system_id', params.id).eq('state', 'pending');

  // The designer is free for everyone at launch and a config row away from being Pro (D-22).
  const proOnly = gates.cover_designer_tier === 'pro';
  const allowed = !proOnly || me?.account_tier === 'pro';

  return {
    vocabulary,
    waitingTags: (waiting ?? []).map((w) => ({ tag: w.tag, group: w.group_label })),
    system,
    // What a 5 on the information meter means today (D-30) - the nudge is measured against it.
    best: await bestDensity(sb),
    screenshots: (shots ?? []).map((s) => {
      const isApproved = approved.has(s.sha256);
      // Usable as the base of a designed card: approved, and a format the Worker can decode.
      const drawable = isApproved && DRAWABLE.has(mimeOf.get(s.sha256) ?? '');
      return {
        ...s,
        approved: isApproved,
        drawable,
        // WHY NOT, when it cannot be used - the cover picker greys it and says this rather than
        // leaving a creator to wonder which of their pictures the hub dislikes (D-44).
        why: drawable ? null : !isApproved ? 'Waiting to be reviewed' : 'PNG or JPEG only'
      };
    }),
    blocking,
    mayPublish: blocking.length === 0,
    coverOptions: coverOptionsFrom(system.cover_options),
    // Is the current cover one of the creator's screenshots, or a card the hub drew?
    coverIsScreenshot: !!system.cover_sha256 && shotHashes.includes(system.cover_sha256),
    designer: { allowed, proOnly },
    label: gates.cover_label,
    reindexedAt: system.reindexed_at ?? null
  };
};

export const actions: Actions = {
  details: async ({ request, params, platform, locals, url }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const before = await ownedSystem(sb, params.id, locals.viewer.id);

    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim().slice(0, 120);
    if (!title) return fail(400, { message: 'A map needs a title.' });

    // Checkboxes from the curated list. Validated server-side against the vocabulary, because a
    // form field is whatever the client decided to send.
    const tags = sanitiseTags(form.getAll('tags'), await loadVocabulary(sb));

    const { error: e } = await sb.from('systems').update({
      title,
      blurb: String(form.get('blurb') ?? '').trim().slice(0, 300) || null,
      description: String(form.get('description') ?? '').trim().slice(0, 8000) || null,
      tags
    }).eq('id', params.id);
    if (e) return fail(500, { message: e.message });

    // A card carries the title; a renamed map gets its card redrawn (owner, 2026-09-04: "if I
    // update the name it does not update on the image"). A chosen screenshot is left alone.
    if (title !== before.title) {
      const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
      await regenerateGeneratedCover(env, sb, params.id, site, gates);
    }

    return { ok: true };
  },

  /**
   * THE "+": a creator asks for a tag their map needs and the list does not have (D-40).
   *
   * It does NOT go on the map yet. A pending tag shown publicly would be an unreviewed word on a
   * public page, which is the one thing the picture queue exists to prevent; and it would filter
   * nothing, because nobody else can pick it. So the map gets it when a reviewer says yes - or
   * gets the tag it was merged into, which is the outcome the review page makes easiest.
   */
  proposeTag: async ({ request, params, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    await ownedSystem(sb, params.id, locals.viewer.id);

    const form = await request.formData();
    const result = await proposeTag(sb, {
      text: String(form.get('tag') ?? ''),
      group: String(form.get('group') ?? ''),
      creatorId: locals.viewer.id,
      systemId: params.id,
      vocabulary: await loadVocabulary(sb)
    });

    switch (result.kind) {
      case 'bad': return fail(400, { message: result.message });
      case 'have': return { proposed: 'Good news - "' + result.tag + '" already exists. Tick it above and save.' };
      case 'merged': return { proposed: 'That one is kept as "' + result.tag + '". Tick that above and save.' };
      case 'no': return { proposed: 'That word has been looked at before and turned down.' };
      default: return { proposed: 'Asked for. A reviewer will look, and it appears on your map if it is kept.' };
    }
  },

  /**
   * DELETE THIS MAP. Yours to upload, yours to take away (D-45).
   *
   * The title typed back is the confirmation - the same shape as deleting an account, because this
   * cannot be undone either: the bundle goes, and any picture nothing else uses goes with it.
   */
  deleteMap: async ({ request, params, platform, locals }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const system = await ownedSystem(sb, params.id, locals.viewer.id);

    const form = await request.formData();
    if (String(form.get('confirm') ?? '').trim() !== system.title.trim()) {
      return fail(400, { message: 'Type the title exactly to confirm.' });
    }
    try {
      await accounts.deleteSystem(env, sb, await loadGates(sb), system, { actorId: locals.viewer.id });
    } catch (e) {
      return fail(500, { message: (e as Error).message });
    }
    redirect(303, '/account?deleted=' + encodeURIComponent(system.title));
  },

  /** Draw a card to the creator's design and make it the cover (D-22). */
  design: async ({ request, params, platform, locals, url }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const system = await ownedSystem(sb, params.id, locals.viewer.id);

    const [gates, site, { data: me }] = await Promise.all([
      loadGates(sb), loadSite(sb, url),
      sb.from('creators').select('account_tier').eq('id', locals.viewer.id).maybeSingle()
    ]);
    if (gates.cover_designer_tier === 'pro' && me?.account_tier !== 'pro') {
      return fail(403, { message: 'Designing a cover is a Pro feature at the moment.' });
    }

    const options = coverOptionsFrom(Object.fromEntries(await request.formData()));
    const facts = await factsFor(env, sb, system, site, gates, options);
    if (options.base === 'image' && !facts.baseImage) {
      return fail(400, { message: 'That screenshot cannot be drawn over - it must be an approved PNG or JPEG.' });
    }
    const hash = await storeGeneratedCover(env, sb, facts, options);

    // The choices are kept so a re-upload or a rename redraws the same card over the new facts.
    await tolerantWrite({ cover_sha256: hash, cover_options: options },
      (row) => Promise.resolve(sb.from('systems').update(row as Partial<SystemRow>).eq('id', system.id)));
    await linkCover(sb, system.id, hash);
    return { ok: true };
  },

  /** Rebuild the derived rows from the stored file (server/reindex.ts). */
  reindex: async ({ params, platform, locals, url }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    await ownedSystem(sb, params.id, locals.viewer.id);
    const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
    const result = await reindexSystem(env, sb, params.id, site, gates);
    if (!result.ok) return fail(500, { message: result.message });
    return { ok: true, reindexed: true };
  },

  publish: async ({ request, params, platform, locals, url }) => {
    const env = platform?.env;
    if (!env || !locals.viewer) throw error(401, 'Sign in first.');
    const sb = db(env);
    const gates = await loadGates(sb);
    const system = await ownedSystem(sb, params.id, locals.viewer.id);

    const wantPublic = String((await request.formData()).get('state') ?? '') === 'public';

    // Taken down by the hub (D-28): the creator keeps the page, not the switch.
    if (system.state === 'removed') {
      return fail(403, { message: 'This map was taken down by the hub and cannot be published again.' });
    }

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

    // CROSS-POST to the Discord sharing channel (D-32): an intent in the outbox, delivered right
    // away in the background, retried by the drain if not. Never fails the publish.
    if (wantPublic) {
      try {
        const [{ data: full }, { data: creator }, site, { count }] = await Promise.all([
          sb.from('systems').select('*').eq('id', system.id).maybeSingle(),
          sb.from('creators').select('handle, display_name').eq('id', locals.viewer.id).maybeSingle(),
          loadSite(sb, url),
          // This publish is already audited, so a count above one means it has been public before.
          sb.from('admin_actions').select('id', { count: 'exact', head: true })
            .eq('action', 'system.publish').eq('target', 'system:' + system.id)
        ]);
        if (full) {
          const servable = full.cover_sha256
            ? (await ledger.approvedOnly(sb, [full.cover_sha256])).has(full.cover_sha256)
            : false;
          const event = (count ?? 0) > 1 ? 'updated' : 'published';
          await queueShare(sb, locals.viewer.id, full.id,
            buildShare(full, creator?.display_name ?? creator?.handle ?? null, site.url, servable, event),
            gates.discord_share_enabled);
          platform?.context?.waitUntil(
            drainOutbox(env, sb, gates, site.name).catch((e) => console.warn('outbox drain failed', e))
          );
        }
      } catch (e) {
        console.warn('share not queued', e);
      }
    }

    return { ok: true };
  }
};

// coverIsScreenshot is imported for the type of decision it names; the load computes the same
// thing from the rows it already has, without a second query.
void coverIsScreenshot;
