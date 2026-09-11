import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/auth';
import * as audit from '$lib/server/audit';
import { loadVocabulary, pendingProposals } from '$lib/server/tags';
import { similarTags, readable } from '$lib/tagProposals';
import { isAdminTag } from '$lib/adminTags';

// TAG REVIEW (D-40). The queue of words creators have asked for, each shown beside the tags that
// already nearly mean it.
//
// THE PAGE'S JOB IS NOT "YES OR NO", IT IS "DID YOU MEAN THIS ONE?" - the vocabulary exists because
// free tags fragment, and a "+" is the door fragmenting comes through. So the swap-in sits FIRST
// and takes one click, and accepting a genuinely new word is the deliberate second option.
export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  const [pending, vocabulary] = await Promise.all([pendingProposals(sb), loadVocabulary(sb)]);

  // Who asked, and what for. One query each rather than per row.
  const people = [...new Set(pending.map((p) => p.proposed_by).filter(Boolean))] as string[];
  const maps = [...new Set(pending.map((p) => p.system_id).filter(Boolean))] as string[];
  const [{ data: creators }, { data: systems }] = await Promise.all([
    people.length
      ? sb.from('creators').select('id, handle').in('id', people)
      : Promise.resolve({ data: [] as { id: string; handle: string }[] }),
    maps.length
      ? sb.from('systems').select('id, slug, title').in('id', maps)
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string }[] })
  ]);
  const handleOf = new Map((creators ?? []).map((c) => [c.id, c.handle]));
  const mapOf = new Map((systems ?? []).map((m) => [m.id, { slug: m.slug, title: m.title }]));

  // Recently decided, so a reviewer can see the effect of what they just did and undo a mistake by
  // hand if they need to. Small and deliberately not a full history page.
  const { data: recent } = await sb.from('tag_proposals')
    .select('tag, state, merged_into, decided_at')
    .neq('state', 'pending').order('decided_at', { ascending: false }).limit(12);

  return {
    groups: vocabulary.map((g) => g.label),
    pending: pending.map((p) => ({
      tag: p.tag,
      reads: readable(p.tag),
      group: p.group_label,
      uses: p.uses,
      created_at: p.created_at,
      by: p.proposed_by ? handleOf.get(p.proposed_by) ?? null : null,
      map: p.system_id ? mapOf.get(p.system_id) ?? null : null,
      similar: similarTags(p.tag, vocabulary)
    })),
    recent: recent ?? []
  };
};

async function staff(platform: App.Platform | undefined, locals: App.Locals) {
  const env = platform?.env;
  if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
  return { env, sb: db(env), me: locals.viewer };
}

/**
 * Put a tag on the map that asked for it.
 *
 * The whole point of a decision: a creator asked because their map needs the word. Accepting or
 * merging without applying it would leave them to come back and tick a box they cannot see.
 * Silent when the map has gone or already carries it - neither is a failure of the decision.
 */
async function applyToMap(sb: ReturnType<typeof db>, systemId: string | null, tag: string) {
  // Never an admin tag (D-91) - the one door for those is the admin's switch on the map's page.
  if (!systemId || isAdminTag(tag)) return;
  const { data: map } = await sb.from('systems').select('id, tags').eq('id', systemId).maybeSingle();
  if (!map) return;
  const tags = Array.isArray(map.tags) ? (map.tags as string[]) : [];
  if (tags.includes(tag) || tags.length >= 12) return;
  await sb.from('systems').update({ tags: [...tags, tag] }).eq('id', systemId);
}

export const actions: Actions = {
  /** Keep the word. It joins the vocabulary and everyone can pick it from now on. */
  accept: async ({ request, platform, locals }) => {
    const { sb, me } = await staff(platform, locals);
    const form = await request.formData();
    const tag = String(form.get('tag') ?? '');
    const group = String(form.get('group') ?? '');
    if (isAdminTag(tag)) return fail(400, { message: '"' + tag + '" is set by the admin on a map\'s page, not by a tag decision.' });

    const { data: row } = await sb.from('tag_proposals').select('*').eq('tag', tag).eq('state', 'pending').maybeSingle();
    if (!row) return fail(404, { message: 'That one has already been decided.' });

    const { error: e } = await sb.from('tag_proposals').update({
      state: 'accepted',
      group_label: group || row.group_label,
      decided_by: me.id,
      decided_at: new Date().toISOString()
    }).eq('tag', tag);
    if (e) return fail(500, { message: e.message });

    await applyToMap(sb, row.system_id, tag);
    await audit.record(sb, me.id, 'tag.accept', 'tag:' + tag, undefined, { group: group || row.group_label });
    return { done: '"' + tag + '" is now a tag anyone can use.' };
  },

  /** Swap it for the tag that already means this. One click, and it is the easy one on purpose. */
  merge: async ({ request, platform, locals }) => {
    const { sb, me } = await staff(platform, locals);
    const form = await request.formData();
    const tag = String(form.get('tag') ?? '');
    const into = String(form.get('into') ?? '');
    if (!into) return fail(400, { message: 'Pick the tag to use instead.' });
    if (isAdminTag(into)) return fail(400, { message: '"' + into + '" is set by the admin on a map\'s page, not by a tag decision.' });

    const { data: row } = await sb.from('tag_proposals').select('*').eq('tag', tag).eq('state', 'pending').maybeSingle();
    if (!row) return fail(404, { message: 'That one has already been decided.' });

    const { error: e } = await sb.from('tag_proposals').update({
      state: 'merged', merged_into: into, decided_by: me.id, decided_at: new Date().toISOString()
    }).eq('tag', tag);
    if (e) return fail(500, { message: e.message });

    // The map gets what it actually meant, which is the whole value of merging rather than refusing.
    await applyToMap(sb, row.system_id, into);
    await audit.record(sb, me.id, 'tag.merge', 'tag:' + tag, undefined, { into });
    return { done: '"' + tag + '" became "' + into + '", and the map has it.' };
  },

  /** No. Asking again does not reopen it, so a reason is worth writing. */
  reject: async ({ request, platform, locals }) => {
    const { sb, me } = await staff(platform, locals);
    const form = await request.formData();
    const tag = String(form.get('tag') ?? '');
    const note = String(form.get('note') ?? '').trim().slice(0, 300) || null;

    const { error: e } = await sb.from('tag_proposals').update({
      state: 'rejected', note, decided_by: me.id, decided_at: new Date().toISOString()
    }).eq('tag', tag).eq('state', 'pending');
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, me.id, 'tag.reject', 'tag:' + tag, note ?? undefined);
    return { done: '"' + tag + '" turned down.' };
  }
};
