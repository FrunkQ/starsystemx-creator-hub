import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isAdmin } from '$lib/server/auth';
import { describeAction, parseTarget, isModeratorAction, ACTION_GROUPS, type ActionGroup } from '$lib/auditLog';

// THE LOG (D-42). Every recorded staff action, newest first, for the person who handed out the role.
//
// ADMIN ONLY, and that is the point rather than an omission: this is how the owner watches the
// moderators, so a moderator reading it - or worse, one who could not see they were being watched -
// would be a different feature. It sits in "Running the place".
//
// The rows have been written since migration 0001; nothing new is recorded for this page. What it
// adds is somewhere to READ them.
const PAGE = 100;

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isAdmin(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  const who = url.searchParams.get('who') ?? '';
  const group = (url.searchParams.get('group') ?? '') as ActionGroup | '';
  const modsOnly = url.searchParams.get('mods') === '1';
  const before = url.searchParams.get('before') ?? '';

  // OVER-READ, THEN FILTER IN THE WORKER. The group and moderators-only filters are properties of
  // the ACTION NAME, which lives in `auditLog.ts` and not in the database - putting them in the
  // query would mean a list of slugs in two places, drifting. The actor filter IS a column, so it
  // is a real `eq` and costs nothing.
  let q = sb.from('admin_actions')
    .select('id, actor_id, action, target, reason, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(group || modsOnly ? PAGE * 4 : PAGE + 1);
  if (who) q = q.eq('actor_id', who);
  if (before) q = q.lt('created_at', before);

  const { data: rows, error: e } = await q;
  if (e) throw error(500, 'The log could not be read: ' + e.message);

  let list = (rows ?? []).filter((r) => {
    if (modsOnly && !isModeratorAction(r.action)) return false;
    if (group && describeAction(r.action).group !== group) return false;
    return true;
  });
  const more = list.length > PAGE;
  list = list.slice(0, PAGE);

  // Who did it, and who it was done to. Two batch reads rather than two per row.
  const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
  const targets = list.map((r) => parseTarget(r.action, r.target));
  const creatorIds = [...new Set([
    ...actorIds,
    ...targets.filter((t) => t.kind === 'creator').map((t) => t.id)
  ])];
  const systemIds = [...new Set(targets.filter((t) => t.kind === 'system').map((t) => t.id))];

  const [{ data: people }, { data: systems }] = await Promise.all([
    creatorIds.length
      ? sb.from('creators').select('id, handle, role').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; handle: string; role: string }[] }),
    systemIds.length
      ? sb.from('systems').select('id, slug, title').in('id', systemIds)
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string }[] })
  ]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const map = new Map((systems ?? []).map((m) => [m.id, m]));

  // Everyone who has ever acted, for the filter. A separate small read so the dropdown does not
  // only contain the people on the page you happen to be looking at.
  const { data: staff } = await sb.from('creators')
    .select('id, handle, role').in('role', ['admin', 'moderator']).order('handle');

  return {
    entries: list.map((r, i) => {
      const t = targets[i];
      const actor = r.actor_id ? person.get(r.actor_id) ?? null : null;
      const { verb, group: g } = describeAction(r.action);
      return {
        id: r.id,
        at: r.created_at,
        action: r.action,
        verb,
        group: g,
        // A deleted account leaves its actions behind with a null actor (the FK is ON DELETE SET
        // NULL) - the record of what was done must outlive the person who did it.
        actor: actor ? { handle: actor.handle, role: actor.role } : null,
        target: t,
        targetPerson: t.kind === 'creator' ? person.get(t.id)?.handle ?? null : null,
        targetMap: t.kind === 'system' ? map.get(t.id) ?? null : null,
        reason: r.reason,
        detail: r.detail ? JSON.stringify(r.detail) : null
      };
    }),
    filters: {
      who,
      group,
      modsOnly,
      groups: ACTION_GROUPS,
      staff: (staff ?? []).map((s) => ({ id: s.id, handle: s.handle, role: s.role }))
    },
    older: more ? list[list.length - 1].created_at : null
  };
};
