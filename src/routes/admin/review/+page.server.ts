import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as ledger from '$lib/server/ledger';
import { isStaff } from '$lib/server/auth';

/** What `ledger.queue` and `ledger.preApproved` both return, per row. */
type QueueRow = {
  sha256: string;
  kind: string;
  byte_size: number;
  mime: string;
  usage_count: number;
  report_count: number;
  flagged: boolean;
  first_seen_at: string;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (!isStaff(locals.viewer)) throw error(404, 'Not found');

  const sb = db(env);
  // TWO LISTS, ONE PAGE (D-78). What is waiting, and what went out on trust without anybody
  // looking - the owner's condition for pre-approval was that he still sees it and can still
  // withdraw it, so it is on the same page rather than tucked somewhere else.
  const [queue, pre] = await Promise.all([ledger.queue(sb, 60), ledger.preApproved(sb, 30)]);
  if (!queue.length && !pre.length) return { cards: [], preApproved: [] };

  // The claims and uses are looked up for BOTH lists in one read each: two round trips whatever the
  // length, rather than two per card.
  const hashes = [...queue, ...pre].map((q) => q.sha256 as string);

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

  // ============================================================================================
  // WHO UPLOADED IT (owner, 2026-09-10: *"Images review page need user details on it so we know WHO
  // is doing it."*).
  //
  // It is not on the asset - an asset is BYTES, and the same bytes can arrive on four maps from
  // four people, which is the whole reason the ledger keys on the hash. So the person is reached
  // through the maps that use it, and a card can honestly name more than one.
  //
  // ONE BATCHED READ. A card is one query for the queue, one for the claims, one for the uses and
  // one for the people - not one per card, which at sixty cards is sixty round trips inside a 10ms
  // budget (D-53).
  // ============================================================================================
  const creatorIds = [...new Set((uses ?? [])
    .map((u: any) => u.systems?.creator_id).filter(Boolean))] as string[];
  const { data: people } = creatorIds.length
    ? await sb.from('creators').select('id, handle, display_name, role, state').in('id', creatorIds)
    : { data: [] as any[] };
  const personBy = new Map((people ?? []).map((p: any) => [p.id, p]));

  // NAMED EXPLICITLY rather than generic. A generic parameter looked tidier and the spread through
  // it came out as `{claims, uses, filename}` on the far side - every field of the row silently
  // dropped, because the load's inferred return type does not carry the type variable across.
  // Writing the shape down is duller and survives the round trip to the page.
  const decorate = (q: QueueRow) => {
    const mine = usesBy.get(q.sha256 as string) ?? [];
    return {
      ...q,
      claims: claimsBy.get(q.sha256 as string) ?? [],
      uses: mine.map((u: any) => ({
        ...u,
        // The uploader, beside the map, because "who" and "where" are one question on this page.
        uploader: personBy.get(u.systems?.creator_id) ?? null
      })),
      /** The path inside the bundle - which is the closest thing an asset has to a filename. */
      filename: (mine[0]?.bundle_path as string | undefined) ?? null
    };
  };

  return {
    cards: queue.map(decorate),
    /** Already usable, nobody has looked. Withdrawing one is an ordinary ban. */
    preApproved: pre.map(decorate)
  };
};
