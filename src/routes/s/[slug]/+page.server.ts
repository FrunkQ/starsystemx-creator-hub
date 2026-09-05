import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import { ensureCover, coverNodeFrom } from '$lib/server/cover';
import { reindexSystem } from '$lib/server/reindex';
import { loadSite } from '$lib/server/site';
import { loadGates } from '$lib/server/config';
import { mayContribute } from '$lib/server/auth';
import { removalRole, commentNotice } from '$lib/comments';
import { isBadge } from '$lib/badges';
import { densityFrom, densityLevel, densitySummary } from '$lib/bundle/density';
import { bestDensity } from '$lib/server/density';

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
    ? await sb.from('creators').select('id, handle, display_name').in('id', commenterIds)
    : { data: [] as { id: string; handle: string; display_name: string | null }[] };
  const commenterName = new Map((commenters ?? []).map((c) => [c.id, c.display_name ?? c.handle]));
  const comments = (commentRows ?? []).map((c) => ({
    id: c.id, body: c.body, created_at: c.created_at,
    // No author left: they deleted their account and chose to leave their words (0022).
    by: c.creator_id ? commenterName.get(c.creator_id) ?? 'an explorer' : 'a former explorer',
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
  const best = await bestDensity(sb);
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
    starred,
    comments,
    commentsAvailable: !commentsErr,
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
