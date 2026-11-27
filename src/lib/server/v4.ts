// PUBLISHING AND SERVING SSE4 FILES (D-98). The reading is in $lib/v4/read.ts; this is the I/O.
//
// THE FILE IS STORED ONCE, BY ITS OWN HASH, in the bundles bucket at `v4/<sha256>.json`, and served
// exactly as stored. Two people publishing the same bytes share the object.
import type { Db, V4ItemRow } from './database.types';
import type { HubEnv } from './db';
import type { Viewer } from './auth';
import { readV4, type PackSummary, type CampaignSummary } from '$lib/v4/read';
import { sha256Hex } from '$lib/bundle/hash';
import * as audit from './audit';

export const v4Key = (sha256: string) => `v4/${sha256}.json`;

/** Columns a shelf card needs. */
export const V4_CARD_COLUMNS = 'id, slug, kind, creator_id, title, summary, pack_id, pack_version, pack_kinds, fictional, licence, provides, universe_root, event_count, fan_setting, download_count, created_at, sha256, byte_size';

export type V4Card = Pick<V4ItemRow, 'id' | 'slug' | 'kind' | 'creator_id' | 'title' | 'summary' | 'pack_id' | 'pack_version' |
  'pack_kinds' | 'fictional' | 'licence' | 'provides' | 'universe_root' | 'event_count' | 'fan_setting' | 'download_count' |
  'created_at' | 'sha256' | 'byte_size'>;

/** A pack's address: its id and version, as one URL-safe word ("acme.ports-1.2.0"). */
export const packSlug = (id: string, version: string) => `${id}-${version}`.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();

async function campaignSlug(sb: Db, title: string): Promise<string> {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : base + '-' + (i + 1);
    const { data } = await sb.from('v4_items').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
  }
  return base + '-' + crypto.randomUUID().slice(0, 8);
}

export type PublishResult =
  | { ok: true; slug: string; kind: 'campaign' | 'pack'; sha256: string }
  | { ok: false; status: number; code: string; message: string; problems?: string[] };

export async function publishV4(
  env: HubEnv, sb: Db, viewer: Viewer, bytes: Uint8Array,
  opts: { maxBytes: number; fanSetting: string | null; attestationVersion: number; title?: string | null; summary?: string | null }
): Promise<PublishResult> {
  const read = readV4(bytes, opts.maxBytes);
  if (!read.ok) return { ok: false, status: 400, code: read.code, message: read.message, problems: read.problems };
  const item = read.item;

  if (item.kind === 'pack') {
    // ONE OWNER PER PACK ID: whoever published it first. Anyone else's file with that id is a
    // different pack wearing the same name, and SSE4 would stack it as if it were the same.
    const { data: same } = await sb.from('v4_items').select('creator_id, pack_version')
      .eq('kind', 'pack').eq('pack_id', item.packId);
    if ((same ?? []).some((r) => r.creator_id !== viewer.id)) {
      return { ok: false, status: 409, code: 'pack-id-taken', message: `The pack id "${item.packId}" is already published by someone else. Give your pack its own id.` };
    }
    if ((same ?? []).some((r) => r.pack_version === item.version)) {
      return { ok: false, status: 409, code: 'version-exists', message: `Version ${item.version} of "${item.packId}" is already published. A published version never changes: raise the version number and upload again.` };
    }
  }

  const sha256 = await sha256Hex(read.bytes);
  if (!(await env.HUB_BUNDLES.head(v4Key(sha256)))) {
    await env.HUB_BUNDLES.put(v4Key(sha256), read.bytes as unknown as ArrayBuffer, {
      httpMetadata: { contentType: 'application/json' }, sha256
    });
  }

  const now = new Date().toISOString();
  const title = (opts.title ?? '').trim().slice(0, 120) || item.title;
  const summary = (opts.summary ?? '').trim().slice(0, 400) || item.summary;
  const base = {
    id: crypto.randomUUID(), creator_id: viewer.id, title, summary, sha256, byte_size: read.bytes.length,
    fan_setting: opts.fanSetting, state: 'public' as const, attestation_text_version: opts.attestationVersion,
    attested_at: now, created_at: now, updated_at: now
  };
  const row = item.kind === 'pack'
    ? packRow(item, base, packSlug(item.packId, item.version))
    : campaignRow(item, base, await campaignSlug(sb, title));

  const { error } = await sb.from('v4_items').insert(row);
  if (error) {
    // 23505: the unique pack version, taken between the check above and this insert.
    if (error.code === '23505') return { ok: false, status: 409, code: 'version-exists', message: 'That version was published a moment ago. Raise the version number and upload again.' };
    throw new Error('v4 insert failed: ' + error.message);
  }
  // Counts against the daily allowance like any upload (gates.ts reads upload_events).
  await sb.from('upload_events').insert({
    id: crypto.randomUUID(), creator_id: viewer.id, system_id: null, novel_hashes: 0, total_hashes: 0,
    bytes: read.bytes.length, is_update: false, flagged: false, outcome: 'ok', reason: 'v4-' + item.kind
  } as never);
  return { ok: true, slug: row.slug, kind: item.kind, sha256 };
}

type Base = Omit<V4ItemRow, 'slug' | 'kind' | 'pack_id' | 'pack_version' | 'pack_kinds' | 'fictional' | 'licence' | 'kernel_range' |
  'requires' | 'provides' | 'universe_root' | 'state_hash' | 'event_count' | 'stack' | 'hold_note' | 'download_count'>;

function packRow(p: PackSummary, base: Base, slug: string): V4ItemRow {
  return { ...base, slug, kind: 'pack', pack_id: p.packId, pack_version: p.version, pack_kinds: p.kinds, fictional: p.fictional,
    licence: p.licence, kernel_range: p.kernelRange, requires: p.requires, provides: p.provides, universe_root: null,
    state_hash: null, event_count: null, stack: [], hold_note: null, download_count: 0 };
}

function campaignRow(c: CampaignSummary, base: Base, slug: string): V4ItemRow {
  return { ...base, slug, kind: 'campaign', pack_id: null, pack_version: null, pack_kinds: [], fictional: false, licence: null,
    kernel_range: null, requires: [], provides: {}, universe_root: c.root, state_hash: c.stateHash, event_count: c.events,
    stack: c.stack, hold_note: null, download_count: 0 };
}

/**
 * THE CREDIT CHAIN for an item (SSE4 clip `source.creditChain`, contract C-08 and C-09): who made it,
 * where it came from. SSE4 writes it onto the authored events when it places the item.
 */
export function creditChain(item: { title: string; slug: string }, maker: { handle: string; display_name: string | null } | null, siteUrl: string) {
  return [{ name: maker?.display_name ?? maker?.handle ?? 'unknown', handle: maker?.handle ?? null, title: item.title, url: `${siteUrl}/v/${item.slug}`, site: 'Explorers' }];
}

export type V4StaffAction = 'hold' | 'restore' | 'remove' | 'dismiss';

/**
 * HOLD, RESTORE, REMOVE OR DISMISS, the one way (D-98, SP16). Used by the item page's moderation
 * panel (/api/admin/v4) and by an explorer's admin page, so the two cannot drift. The caller has
 * already checked who may do what (removing is the owner's). Every action closes the item's open
 * reports and goes in the log. Nothing here deletes a row or a file: "removed" is a state.
 */
export async function setV4State(
  sb: Db, actorId: string, item: { id: string; slug: string; state: string }, action: V4StaffAction, note: string
): Promise<void> {
  if (action !== 'dismiss') {
    const state = action === 'hold' ? 'held' : action === 'remove' ? 'removed' : 'public';
    const { error } = await sb.from('v4_items')
      .update({ state, hold_note: action === 'restore' ? null : note, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) throw new Error('could not change the item: ' + error.message);
  }
  await sb.from('v4_reports').update({ state: 'closed' }).eq('item_id', item.id).eq('state', 'open');
  await audit.record(sb, actorId, 'v4.' + action, 'v4_item:' + item.slug, note || undefined, { from: item.state });
}

/** States whose file and listing data are served at their exact address (0045). */
export const SERVED_STATES = ['public', 'withdrawn'] as const;
export const isServed = (state: string) => (SERVED_STATES as readonly string[]).includes(state);

/** The only columns an owner's listing edit may write (SP15). Never the file, its hash or its size. */
export const LISTING_COLUMNS = ['title', 'summary', 'fan_setting'] as const;
export const TITLE_MAX = 120;
export const SUMMARY_MAX = 400;

export interface ListingEdit { title?: unknown; summary?: unknown; fanSetting?: unknown }
export type EditResult = { ok: true; changed: string[] } | { ok: false; status: number; message: string };

/**
 * THE MAKER EDITS THEIR LISTING (SP15, store packs design 9.6). Title, summary and fan setting are
 * the listing's, not the file's: the published bytes and their SHA-256 never change, and a pack's
 * slug (its id and version) stays put. Only the maker may do it, in any state but removed. The
 * change goes in the log with what it was before.
 */
export async function editV4Listing(sb: Db, viewerId: string, slug: string, edit: ListingEdit, clean: (raw: unknown) => string | null): Promise<EditResult> {
  const { data: item } = await sb.from('v4_items').select('id, slug, creator_id, state, title, summary, fan_setting').eq('slug', slug).maybeSingle();
  if (!item || item.creator_id !== viewerId) return { ok: false, status: 404, message: 'Not found' };
  if (item.state === 'removed') return { ok: false, status: 409, message: 'This item was removed, so its listing cannot be changed.' };

  const patch: Partial<Pick<V4ItemRow, 'title' | 'summary' | 'fan_setting'>> = {};
  if (edit.title !== undefined) {
    const title = String(edit.title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
    if (!title) return { ok: false, status: 400, message: 'A listing needs a title.' };
    if (title !== item.title) patch.title = title;
  }
  if (edit.summary !== undefined) {
    const summary = String(edit.summary ?? '').trim().slice(0, SUMMARY_MAX) || null;
    if (summary !== item.summary) patch.summary = summary;
  }
  if (edit.fanSetting !== undefined) {
    const fan = clean(edit.fanSetting);
    if (fan !== item.fan_setting) patch.fan_setting = fan;
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { ok: true, changed };

  const { error } = await sb.from('v4_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', item.id);
  if (error) throw new Error('could not save the listing: ' + error.message);
  const before = Object.fromEntries(changed.map((k) => [k, item[k as keyof typeof item]]));
  await audit.record(sb, viewerId, 'v4.edit', 'v4_item:' + item.slug, undefined, { before, after: patch });
  return { ok: true, changed };
}

export type ShelfResult = { ok: true; state: string } | { ok: false; status: number; message: string };

/**
 * THE MAKER TAKES THEIR OWN ITEM OFF THE SHELF, OR PUTS IT BACK (SP15). `withdrawn` is not listed
 * or searched, but its file is still served at its exact address, so a campaign that already names
 * it keeps working. A moderator's hold is not the maker's to lift, and a removed item stays removed.
 */
export async function setOwnShelf(sb: Db, viewerId: string, slug: string, on: boolean): Promise<ShelfResult> {
  const { data: item } = await sb.from('v4_items').select('id, slug, creator_id, state').eq('slug', slug).maybeSingle();
  if (!item || item.creator_id !== viewerId) return { ok: false, status: 404, message: 'Not found' };
  const want = on ? 'public' : 'withdrawn';
  if (item.state === want) return { ok: true, state: want };
  if (item.state === 'held') return { ok: false, status: 409, message: 'A moderator has held this item, so it stays off the shelf until they lift the hold. Their note says why.' };
  if (item.state === 'removed') return { ok: false, status: 409, message: 'This item was removed and cannot go back on the shelf.' };
  if (on && item.state !== 'withdrawn') return { ok: false, status: 409, message: 'Only an item you took off the shelf can be put back.' };

  const { error } = await sb.from('v4_items').update({ state: want, updated_at: new Date().toISOString() }).eq('id', item.id);
  if (error) {
    // 23514: the state check before migration 0045 does not know `withdrawn`.
    if (error.code === '23514') return { ok: false, status: 503, message: 'Taking an item off the shelf needs a small database change that has not been run yet (0045). Nothing was changed.' };
    throw new Error('could not change the item: ' + error.message);
  }
  await audit.record(sb, viewerId, on ? 'v4.return' : 'v4.withdraw', 'v4_item:' + item.slug);
  return { ok: true, state: want };
}
