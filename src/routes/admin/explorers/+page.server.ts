import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isAdmin, isStaff } from '$lib/server/auth';
import * as accounts from '$lib/server/accounts';

// Everyone, newest first, or a search by handle: the way in to an explorer's own page (D-28).
export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  const q = (url.searchParams.get('q') ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  let query = sb.from('creators').select('id, handle, display_name, role, state, trusted, created_at');
  if (q) query = query.ilike('handle', '%' + q + '%');
  const { data: people } = await query.order('created_at', { ascending: false }).limit(50);

  const ids = (people ?? []).map((p) => p.id);
  const { data: maps } = ids.length
    ? await sb.from('systems').select('creator_id, state').in('creator_id', ids)
    : { data: [] as { creator_id: string; state: string }[] };
  const { data: comments } = ids.length
    ? await sb.from('comments').select('creator_id').in('creator_id', ids).is('removed_at', null)
    : { data: [] as { creator_id: string | null }[] };

  const mapsOf = new Map<string, { all: number; pub: number }>();
  for (const m of maps ?? []) {
    const c = mapsOf.get(m.creator_id) ?? { all: 0, pub: 0 };
    c.all++;
    if (m.state === 'public') c.pub++;
    mapsOf.set(m.creator_id, c);
  }
  const commentsOf = new Map<string, number>();
  for (const c of comments ?? []) if (c.creator_id) commentsOf.set(c.creator_id, (commentsOf.get(c.creator_id) ?? 0) + 1);

  // ============================================================================================
  // THE ADDRESS THEY SIGNED UP WITH (owner, 2026-09-07: "on the explorers list - can we see what
  // e-mail they used to sign up with"), and WHETHER IT IS CONFIRMED, which is the same question
  // asked twice - a pending account is one that has not answered its email.
  //
  // ADMIN ONLY, and this is the one judgement call in the change. The rest of this page is staff
  // (D-39: a moderator judges content and everything they do can be undone), but an email address
  // is not content - it is the only personal data the hub holds about anybody, and the site's own
  // terms make a promise about that: "We know almost nothing about you, on purpose." A moderator
  // needs to see what somebody POSTED; they have never needed to know who that person is.
  //
  // IT IS NOT IN `creators`. It lives in Supabase's `auth.users`, reachable only with the service
  // role - which is also why this is one paged admin call rather than a join.
  // ============================================================================================
  const emails = new Map<string, { email: string; confirmed: boolean }>();
  if (isAdmin(locals.viewer) && ids.length) {
    try {
      // One page of 200 covers the 50 rows above many times over. If the hub ever outgrows that,
      // the fix is to page this - not to fetch one user at a time, which is 50 round trips.
      const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const wanted = new Set(ids);
      for (const u of users?.users ?? []) {
        if (!wanted.has(u.id) || !u.email) continue;
        emails.set(u.id, { email: u.email, confirmed: !!(u.email_confirmed_at ?? u.confirmed_at) });
      }
    } catch {
      // A list that will not load must not take the page down with it: the page is how an admin
      // reaches an account in trouble, and it worked without addresses until today.
    }
  }

  // What just happened, when a deletion sent us here.
  const deleted = url.searchParams.get('deleted');
  const flash = deleted
    ? {
        handle: deleted,
        maps: Number(url.searchParams.get('maps') ?? 0),
        freed: Number(url.searchParams.get('freed') ?? 0),
        signIn: url.searchParams.get('signin') !== '0',
        id: url.searchParams.get('id') ?? ''
      }
    : null;

  return {
    q,
    people: (people ?? []).map((p) => ({
      ...p,
      maps: mapsOf.get(p.id) ?? { all: 0, pub: 0 },
      comments: commentsOf.get(p.id) ?? 0,
      // ALWAYS BOTH KEYS, never a spread of "maybe an object": a union of `{}` and `{email}` is a
      // type nothing downstream can read a property off, and null is a clearer answer than absent.
      email: emails.get(p.id)?.email ?? null,
      confirmed: emails.get(p.id)?.confirmed ?? false,
      trusted: p.trusted === true
    })),
    /** Whether addresses were even asked for, so the page can tell a moderator why there are none. */
    showEmails: isAdmin(locals.viewer),
    /** The viewer, so their own row's Trusted box is shown but cannot be ticked. */
    me: locals.viewer.id,
    flash
  };
};

const ID = /^[0-9a-f-]{36}$/;

export const actions: Actions = {
  /**
   * TRUST FROM THE LIST (D-82). The owner, 2026-09-11: *"Have 'Trust User' as a checkbox on
   * /admin/explorers."*
   *
   * The same act as the Trust panel on an explorer's own page, through the same function, so the
   * two cannot drift apart and the audit log reads the same whichever was used. Staff, like that
   * panel: trust can be undone completely (D-78), which is D-39's line for a moderator's power.
   * No note from here - a tick in a table has nowhere to put one; the explorer's page still does.
   */
  trust: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!ID.test(id)) return fail(400, { message: 'No such explorer.' });
    const trusted = form.get('trusted') === 'on';
    try {
      await accounts.setTrusted(db(env), locals.viewer.id, id, trusted, null);
    } catch (e) {
      return fail(400, { message: (e as Error).message });
    }
    return { trusted };
  }
};
