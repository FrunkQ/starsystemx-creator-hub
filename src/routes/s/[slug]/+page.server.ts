import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import { ensureCover, coverNodeFrom } from '$lib/server/cover';
import { reindexSystem } from '$lib/server/reindex';
import { loadSite } from '$lib/server/site';
import { loadGates } from '$lib/server/config';
import { mayContribute } from '$lib/server/auth';
import { removalRole, commentNotice } from '$lib/comments';
import { isStaff, isAdmin } from '$lib/server/auth';
import * as debugUploads from '$lib/server/debugUploads';
import * as audit from '$lib/server/audit';
import { tolerantWrite } from '$lib/server/tolerant';
import { isBadge } from '$lib/badges';
import { densityFrom, densityLevel, densitySummary } from '$lib/bundle/density';
import { bestDensity } from '$lib/server/density';
import { openLink } from '$lib/openInSse';
import { problemsFrom } from '$lib/bundle/problems';
import { withAdminTag, STARTER_TAG } from '$lib/adminTags';

export const load: PageServerLoad = async ({ params, platform, setHeaders, url, locals }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const { data: system } = await sb.from('systems')
    // `*` rather than a long column list: Supabase parses a select string at the TYPE level, and
    // past a certain length its parser gives up and yields GenericStringError instead of a row
    // type. The row is small and the page uses most of it, so `*` is both simpler and typed.
    .select('*')
    .eq('slug', params.slug).maybeSingle();

  // A draft, hidden or removed map is a 404 to everyone but its creator - and the creator reads it
  // through /mine, not here. Never 403: whether a slug exists is not a visitor's business.
  if (!system || system.state !== 'public' || system.visibility !== 'public') throw error(404, 'Not found');

  const [{ data: bodies }, { data: constructs }, { data: creator }, { data: assets }] = await Promise.all([
    // `*`, deliberately: 0015 added `distance`/`map_x`/`map_y`, and naming a column the database
    // does not have yet fails the whole select - which would empty the page until the owner ran
    // the migration. `*` returns whatever exists.
    sb.from('bodies').select('*').eq('system_id', system.id).order('name'),
    sb.from('constructs').select('*').eq('system_id', system.id).order('name'),
    sb.from('creators').select('handle, display_name').eq('id', system.creator_id).maybeSingle(),
    sb.from('system_assets').select('sha256').eq('system_id', system.id)
  ]);

  const [{ data: shots }, { data: badgeRows }, { data: reusers }] = await Promise.all([
    sb.from('system_screenshots').select('sha256, caption, ordinal').eq('system_id', system.id).order('ordinal'),
    // The cartographer's badges, drawn after the byline (src/lib/badges.ts).
    sb.from('creator_badges').select('badge').eq('creator_id', system.creator_id),
    // "USED IN": public maps whose credits point at this one (0019). The other half of "credit
    // follows content" - a cartographer sees where their work went. Fails quietly before 0019.
    sb.from('systems').select('slug, title, creator_id')
      .eq('state', 'public').eq('visibility', 'public').neq('id', system.id)
      .contains('content_credit_slugs', [system.slug]).limit(20)
  ]);
  const reuserIds = [...new Set((reusers ?? []).map((r) => r.creator_id))];
  const { data: reuserCreators } = reuserIds.length
    ? await sb.from('creators').select('id, handle, display_name').in('id', reuserIds)
    : { data: [] as { id: string; handle: string; display_name: string | null }[] };
  const nameOf = new Map((reuserCreators ?? []).map((c) => [c.id, c.display_name ?? c.handle]));
  const usedIn = (reusers ?? []).map((r) => ({ slug: r.slug, title: r.title, creator: nameOf.get(r.creator_id) ?? null }));

  // ROWS WRITTEN BEFORE THE CURRENT READER get rebuilt from the stored file, once, in the
  // background (server/reindex.ts): distances, positions, small objects, credits. The page served
  // now is the old reading; the next view has the new one. Never on the request's critical path.
  const stale = (bodies?.length ?? 0) > 0 && (
    (!system.reindexed_at && (bodies ?? []).every((b) => b.distance == null))
    // 0023: measured on upload and re-index; a map that predates the measure gets it once. The
    // key is only present once the column exists, so this cannot loop before the migration.
    || ('info_density' in system && system.info_density == null)
  );
  if (stale && platform?.context?.waitUntil) {
    platform.context.waitUntil(
      Promise.all([loadSite(sb, url), loadGates(sb)])
        .then(([site, gates]) => reindexSystem(env, sb, system.id, site, gates))
        .then(() => undefined, (e) => console.warn('background re-index failed', e))
    );
  }

  // Has THIS viewer starred it? One row, only when somebody is signed in.
  let starred = false;
  if (locals.viewer) {
    const { data: mine } = await sb.from('hearts').select('system_id')
      .eq('creator_id', locals.viewer.id).eq('system_id', system.id).maybeSingle();
    starred = !!mine;
  }

  // COMMENTS (0021). Live ones, oldest first - a conversation reads down. This names a table the
  // database may not have yet; then there is no section and no box, not an error page.
  const { data: commentRows, error: commentsErr } = await sb.from('comments')
    .select('id, creator_id, body, created_at')
    .eq('system_id', system.id).is('removed_at', null)
    .order('created_at', { ascending: true }).limit(200);
  const commenterIds = [...new Set((commentRows ?? []).flatMap((c) => (c.creator_id ? [c.creator_id] : [])))];
  const { data: commenters } = commenterIds.length
    // The ROLE comes too (owner, 2026-09-10: "Users comments should show their role pill (if
    // any)"). It is the difference between a stranger's opinion under somebody's map and a word
    // from the person who could take it down, and a reader deserves to be able to tell.
    ? await sb.from('creators').select('id, handle, display_name, role').in('id', commenterIds)
    : { data: [] as { id: string; handle: string; display_name: string | null; role: string }[] };
  const commenterName = new Map((commenters ?? []).map((c) => [c.id, c.display_name ?? c.handle]));
  const commenterRole = new Map((commenters ?? []).map((c) => [c.id, c.role]));
  const comments = (commentRows ?? []).map((c) => ({
    id: c.id, body: c.body, created_at: c.created_at,
    // No author left: they deleted their account and chose to leave their words (0022).
    by: c.creator_id ? commenterName.get(c.creator_id) ?? 'an explorer' : 'a former explorer',
    // Null for an ordinary explorer, which is most of them - a pill on everybody is a pill on
    // nobody. Never for a departed author: there is no account left to have a role.
    role: c.creator_id ? (commenterRole.get(c.creator_id) ?? null) : null,
    // Who may take it down is decided here, once; the page only draws the button.
    removable: !!removalRole(locals.viewer, c, system.creator_id)
  }));

  // The one line a form round-trip leaves behind (api/comment, api/report redirect here).
  const notice = commentNotice(url.searchParams.get('comment'))
    ?? (url.searchParams.has('reported') ? 'Thank you. Your report is recorded and will be read.' : null);

  // A map with no picture gets one drawn from itself on first view (server/cover.ts, D-21) - the
  // backfill for anything uploaded before the hub could draw. Once per map; never fails the page.
  let backfilled: string | null = null;
  if (!system.cover_sha256) {
    try {
      const [site, gates] = await Promise.all([loadSite(sb, url), loadGates(sb)]);
      backfilled = await ensureCover(env, sb, system, {
        title: system.title, creator: creator?.handle ?? null, kind: system.kind,
        systems: system.system_count, bodies: system.body_count, constructs: system.construct_count,
        url: site.url + '/s/' + system.slug, label: gates.cover_label
      }, [...(bodies ?? []), ...(constructs ?? [])].map(coverNodeFrom));
      system.cover_sha256 = backfilled;
    } catch (e) {
      console.warn('cover backfill skipped', e);
    }
  }

  // HOW MANY PICTURES ARE STILL WAITING (design 6.2). The map is public and downloadable either
  // way; saying how many are withheld is what stops a gap reading as a bug.
  // Screenshots go through the same ledger as bundled assets, so they are counted the same way.
  // The cover hash is asked about DIRECTLY, not only through `system_assets`. A cover that came in
  // with the bundle is in that table anyway (the Set dedupes it); a generated one may not be - the
  // first backfills wrote `cover_sha256` and then failed to link the row - and the ledger, not the
  // link table, is what decides whether a picture may be shown.
  const hashes = [...new Set([
    ...(assets ?? []).map((a) => a.sha256 as string),
    ...(shots ?? []).map((s2) => s2.sha256 as string),
    ...(system.cover_sha256 ? [system.cover_sha256] : [])
  ])];
  const approved = await ledger.approvedOnly(sb, hashes);
  const withheldCount = hashes.length - approved.size;

  // HOW MUCH IS WRITTEN ABOUT IT (D-30): the stored score, against the best on the hub.
  const [best, pageSite, gates] = await Promise.all([bestDensity(sb), loadSite(sb, url), loadGates(sb)]);
  // "OPEN IN STAR SYSTEM EXPLORER" (D-35): the engine URL with the download URL appended, once the
  // engine can receive one (R-17). The download route already answers cross-origin.
  const openInSse = openLink(gates.open_in_sse_url, pageSite.url, system.slug, system.kind);
  const detail = densityFrom(system.info_density, system.info_detail);
  const level = densityLevel(system.info_density, best);
  const density = { level, summary: densitySummary(level, detail), measured: detail !== null };

  // The page after a form round-trip must be fresh: a cached copy would not show the comment just
  // posted, and would read as lost.
  setHeaders({ 'cache-control': notice ? 'no-store' : 'public, max-age=60' });

  return {
    system,
    creator,
    creatorBadges: (badgeRows ?? []).map((b) => b.badge).filter(isBadge),
    bodies: bodies ?? [],
    constructs: constructs ?? [],
    usedIn,
    density,
    openInSse,
    starred,
    comments,
    commentsAvailable: !commentsErr,
    // A MODERATOR READING A MAP PAGE HAS THE CONTROLS THERE (owner, 2026-09-10: "If a mod is on a
    // map page they have the controls there to withdraw"). Walking to /admin to act on the thing
    // in front of you is how a moderator ends up not acting on it.
    isStaff: isStaff(locals.viewer),
    // Pushing a map into the debug store is ADMIN only (D-81): a debug upload is an unredacted
    // campaign, and /admin/debug is admin only for that reason - a moderator who could put a map
    // there could not then read it.
    isAdmin: isAdmin(locals.viewer),
    // WHAT THE HUB FOUND WRONG WITH THE FILE (D-88), shown to everybody: a downloader deserves to
    // know a map may not open before they try it, and the fix is harmless for anyone to read.
    problems: problemsFrom((system as { problems?: unknown }).problems),
    isOwner: !!locals.viewer && locals.viewer.id === system.creator_id,
    mayComment: mayContribute(locals.viewer),
    notice,
    signedIn: !!locals.viewer,
    withheldCount,
    // Only approved screenshots reach a public page. An unreviewed one is simply not there yet.
    screenshots: (shots ?? []).filter((s2) => approved.has(s2.sha256 as string)),
    // A cover drawn just now is approved by construction (D-21) but is not in the set computed
    // above, so it is servable on this very first view too - not blank once and fine thereafter.
    coverServable: system.cover_sha256
      ? approved.has(system.cover_sha256) || system.cover_sha256 === backfilled
      : false
  };
};


/**
 * The moderator's controls, on the page they are already looking at (D-79).
 *
 * WHY THEY ARE HERE AND NOT ONLY IN /admin: the owner asked for it, and the reason it is right is
 * that a moderator who has to go somewhere else to act on what they are looking at usually does not.
 * Every one of these is already reachable from the admin pages; this is the same power, closer.
 */
export const actions: Actions = {
  /**
   * HOLD: this map may be broken. It stays downloadable, with a warning.
   *
   * The owner: *"allow peeps to download it with a warning that this file may have problems and to
   * bring it to my attention if it does not work."* That is the whole point - a file nobody can
   * fetch is a file nobody can diagnose, and the person best placed to say what is wrong with it is
   * the person trying to use it.
   */
  hold: async ({ request, platform, locals, params }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);

    const form = await request.formData();
    const note = String(form.get('note') ?? '').trim().slice(0, 500);
    if (note.length < 5) {
      return fail(400, { holdMessage: 'Say what is wrong with it - the note is what a downloader reads.' });
    }

    const { data: system } = await sb.from('systems').select('id').eq('slug', params.slug).maybeSingle();
    if (!system) throw error(404, 'Not found');

    const { error: e } = await tolerantWrite(
      { hold_note: note, held_at: new Date().toISOString(), held_by: locals.viewer!.id },
      (row) => Promise.resolve(sb.from('systems').update(row as never).eq('id', system.id))
    );
    if (e) return fail(500, { holdMessage: 'That did not save: ' + e.message });

    await audit.record(sb, locals.viewer!.id, 'system.hold', 'system:' + system.id, note);
    return { holdMessage: 'On hold. The download stays open and now carries your note.' };
  },

  /**
   * PUSH THIS MAP INTO DEBUG (D-81). The owner: *"Be able to push from 'main site' into Debug if
   * there is a problem with it."*
   *
   * ADMIN, NOT STAFF, and it is the one control on this panel that is. A debug upload is an
   * unredacted campaign - GM notes, hidden systems, secrets intact - and `/admin/debug` is admin
   * only for exactly that reason (D-39: running the place). A moderator who could put a map there
   * could not then read it, which would be a strange power to hand out; and the material is the
   * most sensitive the hub holds.
   */
  toDebug: async ({ request, platform, locals, params }) => {
    const env = platform?.env;
    if (!env || !isAdmin(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);

    const { data: system } = await sb.from('systems')
      .select('id, slug, title').eq('slug', params.slug).maybeSingle();
    if (!system) throw error(404, 'Not found');

    const note = String((await request.formData()).get('note') ?? '').trim().slice(0, 1000);
    const result = await debugUploads.pushMapToDebug(
      env, sb, system.id as string, system.slug as string,
      note || 'Pushed from the map page for diagnosis.'
    );
    if (!result.ok) return fail(500, { holdMessage: result.message });

    await audit.record(sb, locals.viewer!.id, 'debug.push', 'system:' + system.id, note || undefined);
    return { holdMessage: 'Copied into the debug store. It is on /admin/debug and goes on the usual retention clock.' };
  },

  /**
   * THE APP'S STARTER LIST (D-91). The owner: "only the admin may set the `default` tag. It marks the
   * maps that replace Star System Explorer's shipped examples."
   *
   * THE ONLY DOOR for that tag. Uploads, the manage page and tag decisions all keep whatever this has
   * set and add nothing (`$lib/adminTags`), so what this switch says is what the app gets. Admin, not
   * staff: it decides what every new GM sees first.
   */
  starter: async ({ request, platform, locals, params }) => {
    const env = platform?.env;
    if (!env || !isAdmin(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);

    const on = (await request.formData()).get('on') === 'on';
    const { data: system } = await sb.from('systems').select('id, tags').eq('slug', params.slug).maybeSingle();
    if (!system) throw error(404, 'Not found');

    const { error: e } = await sb.from('systems')
      .update({ tags: withAdminTag(system.tags as string[] | null, STARTER_TAG, on) })
      .eq('id', system.id);
    if (e) return fail(500, { holdMessage: 'That did not save: ' + e.message });

    await audit.record(sb, locals.viewer!.id, on ? 'system.starter-on' : 'system.starter-off', 'system:' + system.id);
    return {
      holdMessage: on
        ? 'On the starter list: Star System Explorer offers it in place of its shipped examples.'
        : 'Off the starter list.'
    };
  },

  /** Off hold. The note goes with it - it described a problem that is no longer being claimed. */
  unhold: async ({ platform, locals, params }) => {
    const env = platform?.env;
    if (!env || !isStaff(locals.viewer)) throw error(404, 'Not found');
    const sb = db(env);

    const { data: system } = await sb.from('systems').select('id').eq('slug', params.slug).maybeSingle();
    if (!system) throw error(404, 'Not found');

    const { error: e } = await tolerantWrite(
      { hold_note: null, held_at: null, held_by: null },
      (row) => Promise.resolve(sb.from('systems').update(row as never).eq('id', system.id))
    );
    if (e) return fail(500, { holdMessage: 'That did not save: ' + e.message });

    await audit.record(sb, locals.viewer!.id, 'system.unhold', 'system:' + system.id);
    return { holdMessage: 'Off hold.' };
  }
};
