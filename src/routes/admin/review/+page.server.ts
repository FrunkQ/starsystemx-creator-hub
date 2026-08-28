import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const queue = await ledger.queue(sb, 60);
  if (!queue.length) return { cards: [] };

  const hashes = queue.map((q) => q.sha256 as string);

  // THE REVIEW CARD SHOWS THE IMAGE BESIDE THE CREATOR'S OWN LICENCE CLAIM (design 6.4), which
  // lets one pass judge two things at once: is this acceptable content, and is that attribution
  // plausible? A stock photo credited "my own work, CC0" is a different problem from an
  // uncredited one, and only this view makes it visible.
  const [{ data: claims }, { data: uses }] = await Promise.all([
    sb.from('asset_claims').select('sha256, title, credit, license, source_url, no_provenance, cc_by_breach')
      .in('sha256', hashes),
    sb.from('system_assets').select('sha256, system_id, bundle_path, systems(slug, title, creator_id)')
      .in('sha256', hashes)
  ]);

  const claimsBy = new Map<string, any[]>();
  for (const c of claims ?? []) {
    if (!claimsBy.has(c.sha256)) claimsBy.set(c.sha256, []);
    claimsBy.get(c.sha256)!.push(c);
  }
  const usesBy = new Map<string, any[]>();
  for (const u of uses ?? []) {
    if (!usesBy.has(u.sha256)) usesBy.set(u.sha256, []);
    usesBy.get(u.sha256)!.push(u);
  }

  return {
    cards: queue.map((q) => ({
      ...q,
      claims: claimsBy.get(q.sha256 as string) ?? [],
      uses: usesBy.get(q.sha256 as string) ?? []
    }))
  };
};
