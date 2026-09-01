// One map, as JSON. Everything the app needs to show a detail view and decide whether to download.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';

export const GET: RequestHandler = async ({ platform, params, setHeaders }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const sb = db(env);
  const { data: map } = await sb.from('systems').select('*').eq('slug', params.slug).maybeSingle();
  if (!map || map.state !== 'public' || map.visibility !== 'public') throw error(404, 'not found');

  const [{ data: bodies }, { data: constructs }, { data: creator }] = await Promise.all([
    sb.from('bodies').select('node_id, parent_id, name, kind, role_hint, tags').eq('system_id', map.id).order('name'),
    sb.from('constructs').select('node_id, parent_id, name, kind, role_hint, tags').eq('system_id', map.id).order('name'),
    sb.from('creators').select('handle, display_name').eq('id', map.creator_id).maybeSingle()
  ]);

  const { data: shots } = await sb.from('system_screenshots')
    .select('sha256, caption, ordinal').eq('system_id', map.id).order('ordinal');
  const approved = await ledger.approvedOnly(sb, (shots ?? []).map((s) => s.sha256 as string));

  setHeaders({ 'cache-control': 'public, max-age=60' });
  return json({
    slug: map.slug,
    title: map.title,
    blurb: map.blurb,
    description: map.description,
    kind: map.kind,
    by: creator?.display_name ?? creator?.handle ?? null,
    createdWith: map.created_with,
    bundleFormat: map.bundle_format,
    sizeBytes: map.source_bytes,
    hearts: map.hearts_count,
    downloads: map.download_count,
    tags: map.tags,
    autoTags: map.auto_tags,
    counts: {
      systems: map.system_count, bodies: map.body_count, constructs: map.construct_count,
      images: map.carried_images, models: map.carried_models
    },
    roleCounts: map.role_counts,
    facets: map.facet_results,
    cover: map.cover_sha256,
    // Only approved images are listed - the same rule the web page follows.
    screenshots: (shots ?? []).filter((s) => approved.has(s.sha256 as string)),
    bodies: bodies ?? [],
    constructs: constructs ?? [],
    download: '/api/download/' + map.slug
  });
};
