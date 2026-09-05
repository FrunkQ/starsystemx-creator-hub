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
import { gzipSync, strToU8 } from 'fflate';
import type { Db } from './database.types';
import type { HubEnv } from './db';

export const BACKUP_PREFIX = 'backups/';
export const KEEP = 8;

const TABLES = [
  'creators', 'creator_identities', 'systems', 'bodies', 'constructs', 'system_assets', 'assets',
  'system_screenshots', 'asset_claims', 'attestations', 'hearts', 'comments', 'reports', 'config',
  'creator_badges', 'entitlements', 'app_tokens', 'upload_events', 'download_events', 'traffic_daily',
  'admin_actions', 'integration_outbox'
] as const;

const REDACT: Record<string, string[]> = {
  creator_identities: ['refresh_token'],
  app_tokens: ['token_hash']
};

const PAGE = 1000;

export interface BackupReport { key: string; bytes: number; rows: Record<string, number>; problems: string[] }

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

  const body = gzipSync(strToU8(JSON.stringify({ taken_at: new Date().toISOString(), tables })));
  const key = BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') + '.json.gz';
  await env.HUB_BUNDLES.put(key, body as unknown as ArrayBuffer, { httpMetadata: { contentType: 'application/gzip' } });

  // The last KEEP stay; the rest go.
  for (const old of (await listBackups(env)).slice(KEEP)) await env.HUB_BUNDLES.delete(old.key);

  return { key, bytes: body.length, rows, problems };
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
