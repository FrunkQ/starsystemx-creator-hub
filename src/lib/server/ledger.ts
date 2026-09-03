// THE HASH LEDGER (design 6.1). A verdict is per-HASH, not per-upload.
//
// WHY THIS IS THE CHEAP DESIGN: review an image once against its sha256 and every future upload of
// those exact bytes inherits the verdict. An approved hash never re-enters the queue - which is
// the owner's "checked ones never appear again". A banned hash is refused before a presigned URL
// is ever issued, so it never reaches R2. Re-uploading under a new filename does nothing, because
// the bytes decide. So the queue holds only NOVEL images and shrinks as the library grows.
//
// BE HONEST ABOUT THE LIMIT, and do not let anybody overclaim it in a UI string: this is
// EXACT-BYTE matching, not perceptual. Re-saving a banned image at 99% JPEG quality produces a
// different hash and a fresh queue entry. That is a real gap and it is the correct trade for now.
// The escalation, if evidence ever asks for it, is a perceptual hash stored ALONGSIDE the sha256
// so near-duplicates cluster in the queue. Do not build that yet.
import type { Db } from './database.types';

export type ReviewState = 'novel' | 'approved' | 'banned';

export interface AssetRow {
  sha256: string;
  kind: 'model' | 'image';
  byte_size: number;
  mime: string;
  review_state: ReviewState;
}

/** What the ledger already knows about these hashes. Absent = never seen = novel. */
export async function lookup(sb: Db, hashes: string[]): Promise<Map<string, ReviewState>> {
  const out = new Map<string, ReviewState>();
  if (!hashes.length) return out;
  const unique = [...new Set(hashes)];
  // PostgREST caps URL length; chunk rather than discover the cap in production.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await sb.from('assets').select('sha256, review_state').in('sha256', chunk);
    if (error) throw new Error(`ledger lookup failed: ${error.message}`);
    for (const row of data ?? []) out.set(row.sha256, row.review_state as ReviewState);
  }
  return out;
}

/**
 * Register hashes the ledger has not seen. Novel by definition; the upload is NOT blocked by this
 * (design 6.2) - the assets are simply withheld from serving until reviewed.
 *
 * `flagged` moves them to the FRONT of the queue rather than stopping anything (design 6.6).
 */
export async function registerNovel(
  sb: Db, rows: Omit<AssetRow, 'review_state'>[], flagged: boolean
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map((r) => ({ ...r, review_state: 'novel' as const, flagged }));
  // onConflict do-nothing: a hash seen concurrently by another upload keeps its existing verdict.
  // NEVER upsert the review_state here - that would reset an approved or banned hash to novel.
  const { error } = await sb.from('assets').upsert(payload, { onConflict: 'sha256', ignoreDuplicates: true });
  if (error) throw new Error(`could not register assets: ${error.message}`);
}

/**
 * A picture the HUB drew (cover/generate.ts) enters the ledger already approved - docs/decisions.md
 * D-21. It is not user content: no stranger's bytes, nothing to moderate, and withholding it would
 * defeat its only purpose, which is that a map previews with a picture from the first minute.
 *
 * Idempotent: the same map draws the same bytes, and a hash already present keeps whatever verdict
 * it has - which also means a generated cover can never launder a banned hash, because a banned
 * hash is by definition already present.
 */
export async function registerGenerated(sb: Db, sha256: string, byteSize: number): Promise<void> {
  const { error } = await sb.from('assets').upsert({
    sha256, kind: 'image', byte_size: byteSize, mime: 'image/png',
    review_state: 'approved', review_note: 'Drawn by the hub from the map itself (D-21).', flagged: false
  }, { onConflict: 'sha256', ignoreDuplicates: true });
  if (error) throw new Error(`could not register the generated cover: ${error.message}`);
}

/** Only these may be served or packed into a download (design 6.2). */
export async function approvedOnly(sb: Db, hashes: string[]): Promise<Set<string>> {
  const known = await lookup(sb, hashes);
  const out = new Set<string>();
  for (const [hash, state] of known) if (state === 'approved') out.add(hash);
  return out;
}

/** A single hash's verdict, for the serve path. Absent or novel or banned all mean: do not serve. */
export async function isServable(sb: Db, hash: string): Promise<boolean> {
  const { data, error } = await sb.from('assets').select('review_state').eq('sha256', hash).maybeSingle();
  if (error) throw new Error(`ledger read failed: ${error.message}`);
  return data?.review_state === 'approved';
}

export interface Decision {
  hash: string;
  /** `novel` is the UNDO path - it puts a hash back in the queue (design 6.4 asks for undo). */
  verdict: 'approved' | 'banned' | 'novel';
  reason?: 'content' | 'copyright' | 'spam';
  note?: string;
  adminId: string;
}

/**
 * Record a review decision AGAINST THE HASH, with a reviewer and a timestamp. Never against the
 * upload, or the same bytes come back tomorrow (design 6.4).
 *
 * Takes effect on the next request - including revoking something already public, which is the
 * whole reason the bucket is private and every object is served through the ledger (6.2).
 */
export async function decide(sb: Db, d: Decision): Promise<void> {
  const undo = d.verdict === 'novel';
  const { error } = await sb.from('assets').update({
    review_state: d.verdict,
    reject_reason: d.verdict === 'banned' ? (d.reason ?? 'content') : null,
    // An undo clears the reviewer too: a hash back in the queue has not been reviewed by anybody,
    // and leaving a stale name on it would misreport who decided what in the audit trail.
    reviewed_by: undo ? null : d.adminId,
    reviewed_at: undo ? null : new Date().toISOString(),
    review_note: undo ? null : (d.note ?? null),
    flagged: false
  }).eq('sha256', d.hash);
  if (error) throw new Error(`could not record decision: ${error.message}`);
}

/** The queue: unreviewed only, flagged first, then by how many maps are waiting (design 6.4). */
export async function queue(sb: Db, limit = 60) {
  const { data, error } = await sb.from('assets')
    .select('sha256, kind, byte_size, mime, usage_count, report_count, flagged, first_seen_at')
    .eq('review_state', 'novel')
    .order('flagged', { ascending: false })
    .order('report_count', { ascending: false })
    .order('usage_count', { ascending: false })
    .order('first_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`queue unreadable: ${error.message}`);
  return data ?? [];
}
