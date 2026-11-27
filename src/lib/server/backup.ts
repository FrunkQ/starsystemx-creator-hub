// A backup of the database, to R2, on demand or on a schedule (D-33).
//
// WHY. The free Supabase tier has no point-in-time recovery, and the hub's rows exist nowhere
// else. R2 is already the only copy of every upload; this makes it the second copy of everything
// else. The pictures and bundles are NOT in here - they are content-addressed objects in the same
// buckets - but the backup names which ones matter (system_assets, systems), so a restore knows
// what to look for.
//
// One gzipped JSON document per run, the last KEEP kept. Secrets are never written: a refresh
// token or a token hash in a backup is a second place to steal it from.
//
// SSE4 FILES ARE COPIED, NOT ONLY NAMED (SP16). A V4 item's file lives at `v4/<sha256>.json` and
// is the only copy of a published pack. Each run copies any file not yet copied to
// `backup-files/v4/<sha256>.json` (content-addressed, so a file is copied once, ever, and never
// pruned), and the backup lists every V4 file with whether its copy is there. The copy is in the
// same bucket: it guards against a file being deleted or overwritten by mistake, not against
// losing the bucket.
//
// EVERY TABLE IS IN THE BACKUP OR IN `SKIPPED` WITH A REASON. tests/backup.test.ts reads every
// `create table` in db/migrations and fails on one that is in neither list, so a new table cannot
// be left out quietly again (v4_items, the paid tables and takedowns were, until 0.69.0).
import { gzipSync, strToU8 } from 'fflate';
import type { Db } from './database.types';
import type { HubEnv } from './db';

export const BACKUP_PREFIX = 'backups/';
export const KEEP = 8;

export const TABLES = [
  // SSE4 items first: they are the newest, and a published pack exists nowhere else.
  'v4_items', 'v4_reports',
  'creators', 'creator_identities', 'systems', 'bodies', 'constructs', 'system_assets', 'assets',
  'system_screenshots', 'asset_claims', 'attestations', 'hearts', 'comments', 'reports', 'config',
  'creator_badges', 'entitlements', 'app_tokens', 'upload_events', 'download_events', 'traffic_daily',
  'admin_actions', 'integration_outbox', 'takedowns', 'tag_proposals',
  'seller_accounts', 'paid_listings', 'purchases', 'payout_ledger', 'stripe_events',
  'debug_invites', 'debug_uploads'
] as const;

/** Tables deliberately left out, each with why. */
export const SKIPPED: Record<string, string> = {
  device_codes: 'pairing codes that live for minutes; nothing to restore'
};

export const REDACT: Record<string, string[]> = {
  creator_identities: ['refresh_token'],
  app_tokens: ['token_hash'],
  debug_invites: ['token_hash', 'token']
};

export const V4_FILE_COPY_PREFIX = 'backup-files/v4/';
export const v4CopyKey = (sha256: string) => `${V4_FILE_COPY_PREFIX}${sha256}.json`;

const PAGE = 1000;

export interface V4FileEntry { sha256: string; key: string; copy: string; copied: boolean }
export interface BackupReport {
  key: string; bytes: number; rows: Record<string, number>; problems: string[];
  /** V4 files: how many there are, and how many this run copied for the first time. */
  v4Files: { total: number; copiedNow: number; missing: number };
}

type Bucket = Pick<HubEnv['HUB_BUNDLES'], 'head' | 'get' | 'put'>;

/**
 * Copy each V4 file not yet copied. Never reads a file whose copy exists (a HEAD each), so a run
 * costs one GET and one PUT per NEW file and nothing more. A file that is missing from its own key
 * is a problem in the report, never a silent skip.
 */
export async function copyV4Files(bucket: Bucket, shas: string[], problems: string[]): Promise<{ files: V4FileEntry[]; copiedNow: number; missing: number }> {
  const files: V4FileEntry[] = [];
  let copiedNow = 0;
  let missing = 0;
  for (const sha256 of [...new Set(shas)].sort()) {
    const key = `v4/${sha256}.json`;
    const copy = v4CopyKey(sha256);
    let copied = (await bucket.head(copy)) !== null;
    if (!copied) {
      const object = await bucket.get(key);
      if (!object) {
        missing++;
        problems.push('v4 file missing: ' + key);
      } else {
        const bytes = new Uint8Array(await object.arrayBuffer());
        await bucket.put(copy, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType: 'application/json' }, sha256 });
        copied = true;
        copiedNow++;
      }
    }
    files.push({ sha256, key, copy, copied });
  }
  return { files, copiedNow, missing };
}

export async function writeBackup(env: HubEnv, sb: Db): Promise<BackupReport> {
  const tables: Record<string, unknown[]> = {};
  const rows: Record<string, number> = {};
  const problems: string[] = [];

  for (const table of TABLES) {
    const out: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      // Untyped on purpose: one loop over every table the schema has, whatever its row shape.
      const { data, error } = await (sb as unknown as { from: (t: string) => any }).from(table)
        .select('*').range(from, from + PAGE - 1);
      if (error) { problems.push(table + ': ' + error.message); break; }
      const strip = REDACT[table];
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        if (strip) for (const k of strip) delete r[k];
        out.push(r);
      }
      if ((data ?? []).length < PAGE) break;
    }
    tables[table] = out;
    rows[table] = out.length;
  }

  const v4 = await copyV4Files(env.HUB_BUNDLES,
    (tables.v4_items as { sha256?: string }[]).map((r) => r.sha256 ?? '').filter((x) => /^[0-9a-f]{64}$/.test(x)), problems);

  const body = gzipSync(strToU8(JSON.stringify({ taken_at: new Date().toISOString(), tables, v4_files: v4.files })));
  const key = BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') + '.json.gz';
  await env.HUB_BUNDLES.put(key, body as unknown as ArrayBuffer, { httpMetadata: { contentType: 'application/gzip' } });

  // The last KEEP stay; the rest go.
  for (const old of (await listBackups(env)).slice(KEEP)) await env.HUB_BUNDLES.delete(old.key);

  return { key, bytes: body.length, rows, problems, v4Files: { total: v4.files.length, copiedNow: v4.copiedNow, missing: v4.missing } };
}

export interface BackupEntry { key: string; size: number; uploaded: string }

/** Newest first. */
export async function listBackups(env: HubEnv): Promise<BackupEntry[]> {
  const listed = await env.HUB_BUNDLES.list({ prefix: BACKUP_PREFIX });
  return listed.objects
    .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

export const isBackupKey = (key: string): boolean => /^backups\/[0-9TZ-]+\.json\.gz$/.test(key);
