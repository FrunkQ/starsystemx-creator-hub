import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { Db } from '$lib/server/database.types';
import type { CreatorState, CreatorRole } from '$lib/server/database.types';
import { loadGates } from '$lib/server/config';
import * as accounts from '$lib/server/accounts';
import * as audit from '$lib/server/audit';
import { isBadge } from '$lib/badges';
import { isStaff, isAdmin } from '$lib/server/auth';

// One explorer: who they are, what they have shared and said, and everything the hub can do
// about it (D-28). Every action here is one the terms already promise and the audit log records.
export const load: PageServerLoad = async ({ platform, locals, params }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');
  const sb = db(env);

  const { data: person } = await sb.from('creators').select('*').eq('handle', params.handle).maybeSingle();
  if (!person) throw error(404, 'Not found');

  const [{ data: maps }, { data: comments }, { data: badgeRows }] = await Promise.all([
    // `*`: state_note is 0022's, and naming it before that migration fails the read.
    sb.from('systems').select('*').eq('creator_id', person.id).order('updated_at', { ascending: false }),
    sb.from('comments').select('id, body, created_at, system_id, removed_at, removed_reason')
      .eq('creator_id', person.id).order('created_at', { ascending: false }).limit(50),
    sb.from('creator_badges').select('badge').eq('creator_id', person.id)
  ]);

  const mapIds = (maps ?? []).map((m) => m.id);
  const commentMapIds = [...new Set((comments ?? []).map((c) => c.system_id))];
  const [{ data: about }, { data: reports }] = await Promise.all([
    commentMapIds.length
      ? sb.from('systems').select('id, slug, title').in('id', commentMapIds)
      : { data: [] as { id: string; slug: string; title: string }[] },
    mapIds.length
      ? sb.from('reports').select('id, reason, state, created_at, system_id').in('system_id', mapIds)
          .order('created_at', { ascending: false }).limit(20)
      : { data: [] as { id: string; reason: string; state: string; created_at: string; system_id: string | null }[] }
  ]);
  const aboutMap = new Map((about ?? []).map((s) => [s.id, { slug: s.slug, title: s.title }]));
  const titleOf = new Map((maps ?? []).map((m) => [m.id, m.title]));

  return {
    person: {
      id: person.id, handle: person.handle, display_name: person.display_name, role: person.role,
      state: person.state, state_note: person.state_note ?? null, account_tier: person.account_tier,
      created_at: person.created_at
    },
    self: person.id === locals.viewer.id,
    // Only the owner sees the two irreversible controls: the role, and deletion (D-39).
    owner: isAdmin(locals.viewer),
    badges: (badgeRows ?? []).map((b) => b.badge).filter(isBadge),
    maps: (maps ?? []).map((m) => ({
      id: m.id, slug: m.slug, title: m.title, kind: m.kind, state: m.state, state_note: m.state_note ?? null,
      stars: m.hearts_count, comments: m.comments_count ?? 0, downloads: m.download_count
    })),
    comments: (comments ?? []).map((c) => ({
      id: c.id, body: c.body, created_at: c.created_at, removed_at: c.removed_at,
      removed_reason: c.removed_reason, map: aboutMap.get(c.system_id) ?? null
    })),
    reports: (reports ?? []).map((r) => ({
      id: r.id, reason: r.reason, state: r.state, created_at: r.created_at,
      map: r.system_id ? titleOf.get(r.system_id) ?? null : null
    }))
  };
};

type Ctx = { env: NonNullable<App.Platform['env']>; sb: Db; me: { id: string } };

/**
 * STAFF: a moderator or an admin. Every action reached through this is one that can be UNDONE -
 * suspend, ban, reinstate, remove comments, take a map down, put it back (D-39).
 */
async function staff(platform: App.Platform | undefined, locals: App.Locals): Promise<Ctx> {
  const env = platform?.env;
  if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
  return { env, sb: db(env), me: locals.viewer };
}

/**
 * THE OWNER, for the two things that are not undoable: DELETING an account with its maps, and
 * granting or taking the moderator role. The owner said a moderator gets Explorers, and they do -
 * the whole page and every reversible action on it. Deletion is the exception because there is no
 * way back from it, and handing out the role is how the staff list itself is decided. Say the word
 * and either one moves.
 */
async function ownerOnly(platform: App.Platform | undefined, locals: App.Locals): Promise<Ctx> {
  const env = platform?.env;
  if (!env || !isAdmin(locals.viewer)) throw error(404, 'Not found');
  return { env, sb: db(env), me: locals.viewer };
}

async function personByHandle(sb: Db, handle: string) {
  const { data } = await sb.from('creators').select('id, handle, role').eq('handle', handle).maybeSingle();
  if (!data) throw error(404, 'Not found');
  return data;
}

async function ownMap(sb: Db, id: string, creatorId: string) {
  const { data } = await sb.from('systems').select('id, creator_id').eq('id', id).eq('creator_id', creatorId).maybeSingle();
  if (!data) throw error(404, 'Not found');
  return data;
}

const noteOf = (form: FormData) => String(form.get('note') ?? '').trim().slice(0, 500) || null;
const ID = /^[0-9a-f-]{36}$/;

export const actions: Actions = {
  /**
   * TRUST, or stop trusting (D-78).
   *
   * A MODERATOR'S TO GIVE, unlike the staff role. The D-39 line is whether a thing can be UNDONE,
   * and this one can, completely: untrusting somebody takes effect on their next upload, and every
   * picture that went out on trust is still in the queue and still bannable with one click. That is
   * a different kind of decision from handing somebody the power to take maps down.
   *
   * Never on yourself, for the same reason as the rest of this page: a moderator who can widen
   * their own limits is a moderator with no limits.
   */
  trust: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    if (person.id === me.id) return fail(400, { message: 'Not yourself.' });

    const form = await request.formData();
    const trusted = form.get('trusted') === 'on';
    const { error: e } = await sb.from('creators').update({ trusted }).eq('id', person.id);
    if (e) {
      // Before 0039 the column does not exist, and saying which is more use than "it failed".
      return fail(500, {
        message: /column/i.test(e.message)
          ? 'Trust needs migration 0039, which has not been run yet.'
          : e.message
      });
    }

    await audit.record(sb, me.id, trusted ? 'creator.trust' : 'creator.untrust',
      'creator:' + person.id, noteOf(form) ?? undefined);
    return {
      done: trusted
        ? 'Trusted. Their pictures go out on arrival and still appear in the review queue.'
        : 'No longer trusted. Their next upload waits for review like anybody else.'
    };
  },

  /** Suspend, ban, reinstate - with the reason the person will read. */
  state: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    if (person.id === me.id) return fail(400, { message: 'Not yourself. Ask another admin, or sleep on it.' });
    const form = await request.formData();
    const state = String(form.get('state') ?? '');
    if (!['active', 'suspended', 'banned'].includes(state)) return fail(400, { message: 'bad state' });
    try { await accounts.setCreatorState(sb, me.id, person.id, state as CreatorState, noteOf(form)); }
    catch (e) { return fail(500, { message: (e as Error).message }); }
    return { done: state === 'active' ? 'Reinstated.' : 'Now ' + state + '.' };
  },

  removeComments: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    try {
      const n = await accounts.removeAllComments(sb, me.id, person.id, noteOf(await request.formData()));
      return { done: n + (n === 1 ? ' comment removed.' : ' comments removed.') };
    } catch (e) { return fail(500, { message: (e as Error).message }); }
  },

  removeComment: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    const id = String((await request.formData()).get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'bad id' });
    const { error: e } = await sb.from('comments')
      .update({ removed_at: new Date().toISOString(), removed_by: me.id, removed_reason: 'admin' })
      .eq('id', id).eq('creator_id', person.id).is('removed_at', null);
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, me.id, 'comment.remove', id, 'admin removal');
    return { done: 'Comment removed.' };
  },

  takedown: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'bad id' });
    const map = await ownMap(sb, id, person.id);
    try { await accounts.takeDownSystem(sb, await loadGates(sb), me.id, map, noteOf(form)); }
    catch (e) { return fail(500, { message: (e as Error).message }); }
    return { done: 'Map taken down.' };
  },

  restore: async ({ request, platform, locals, params }) => {
    const { sb, me } = await staff(platform, locals);
    const person = await personByHandle(sb, params.handle);
    const id = String((await request.formData()).get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'bad id' });
    const map = await ownMap(sb, id, person.id);
    try { await accounts.restoreSystem(sb, await loadGates(sb), me.id, map); }
    catch (e) { return fail(500, { message: (e as Error).message }); }
    return { done: 'Map restored and public.' };
  },

  /**
   * MAKE SOMEBODY STAFF, or stop them being staff. The owner's alone, and never on yourself: an
   * admin who could demote themselves can lock the place, and one who could promote themselves
   * makes the role meaningless.
   */
  role: async ({ request, platform, locals, params }) => {
    const { sb, me } = await ownerOnly(platform, locals);
    const person = await personByHandle(sb, params.handle);
    if (person.id === me.id) return fail(400, { message: 'Not yourself.' });
    const role = String((await request.formData()).get('role') ?? '') as CreatorRole;
    if (role !== 'user' && role !== 'moderator') {
      return fail(400, { message: 'A person is made a moderator or an ordinary Explorer here; an admin is made in the database.' });
    }
    if (person.role === 'admin') return fail(400, { message: 'That account is an admin. Change it in the database, deliberately.' });
    const { error: e } = await sb.from('creators').update({ role }).eq('id', person.id);
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, me.id, 'creator.role', 'creator:' + person.id, undefined, { role });
    return { done: role === 'moderator' ? person.handle + ' is a moderator.' : person.handle + ' is an ordinary Explorer again.' };
  },

  /** The account, its maps, its sign-in. The handle typed back is the confirmation. */
  delete: async ({ request, platform, locals, params }) => {
    const { env, sb, me } = await ownerOnly(platform, locals);
    const person = await personByHandle(sb, params.handle);
    if (person.id === me.id) return fail(400, { message: 'Not yourself. Your own account page has that button.' });
    const form = await request.formData();
    if (String(form.get('confirm') ?? '') !== person.handle) return fail(400, { message: 'Type the handle exactly to confirm.' });
    const removeComments = String(form.get('comments') ?? '') === 'remove';
    let report: accounts.DeletionReport;
    try {
      report = await accounts.deleteCreator(env, sb, person, { removeComments, actorId: me.id, note: noteOf(form) ?? undefined });
    } catch (e) { return fail(500, { message: (e as Error).message }); }
    redirect(303, '/admin/explorers?deleted=' + encodeURIComponent(person.handle)
      + '&maps=' + report.maps + '&freed=' + report.freed + '&signin=' + (report.signInDeleted ? 1 : 0)
      + '&id=' + person.id);
  }
};
