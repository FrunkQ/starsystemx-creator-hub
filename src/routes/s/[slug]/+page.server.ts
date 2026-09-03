import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import { ensureCover } from '$lib/server/cover';
import { loadSite } from '$lib/server/site';

export const load: PageServerLoad = async ({ params, platform, setHeaders, url }) => {
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
    sb.from('bodies').select('node_id, parent_id, name, kind, role_hint, tags, image_sha256, snippet, system_id')
      .eq('system_id', system.id).order('name'),
    sb.from('constructs').select('node_id, parent_id, name, kind, role_hint, tags, image_sha256, model_sha256, snippet')
      .eq('system_id', system.id).order('name'),
    sb.from('creators').select('handle, display_name').eq('id', system.creator_id).maybeSingle(),
    sb.from('system_assets').select('sha256').eq('system_id', system.id)
  ]);

  const { data: shots } = await sb.from('system_screenshots')
    .select('sha256, caption, ordinal').eq('system_id', system.id).order('ordinal');

  // A map with no picture gets one drawn from itself on first view (server/cover.ts, D-21) - the
  // backfill for anything uploaded before the hub could draw. Once per map; never fails the page.
  let backfilled: string | null = null;
  if (!system.cover_sha256) {
    const site = await loadSite(sb, url);
    backfilled = await ensureCover(
      env, sb, system, [...(bodies ?? []), ...(constructs ?? [])],
      creator?.handle ?? null, site.name
    );
    system.cover_sha256 = backfilled;
  }

  // HOW MANY PICTURES ARE STILL WAITING (design 6.2). The map is public and downloadable either
  // way; saying how many are withheld is what stops a gap reading as a bug.
  // Screenshots go through the same ledger as bundled assets, so they are counted the same way.
  const hashes = [...new Set([
    ...(assets ?? []).map((a) => a.sha256 as string),
    ...(shots ?? []).map((s2) => s2.sha256 as string)
  ])];
  const approved = await ledger.approvedOnly(sb, hashes);
  const withheldCount = hashes.length - approved.size;

  setHeaders({ 'cache-control': 'public, max-age=60' });

  return {
    system,
    creator,
    bodies: bodies ?? [],
    constructs: constructs ?? [],
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
