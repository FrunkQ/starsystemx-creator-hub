// SP16: the backup holds every table (or says why not) and copies every SSE4 file.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TABLES, SKIPPED, REDACT, copyV4Files, v4CopyKey } from '../src/lib/server/backup';

const migrationTables = (): string[] => {
  const dir = new URL('../db/migrations/', import.meta.url);
  const found = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(new URL(f, dir), 'utf8').replace(/--.*$/gm, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi)) found.add(m[1].toLowerCase());
  }
  return [...found].sort();
};

describe('backup tables (SP16)', () => {
  it('every table a migration creates is backed up or skipped with a reason', () => {
    const listed = new Set<string>(TABLES);
    const left = migrationTables().filter((t) => !listed.has(t) && !(t in SKIPPED));
    expect(left).toEqual([]);
  });
  it('holds the SSE4 tables, first', () => {
    expect(TABLES.slice(0, 2)).toEqual(['v4_items', 'v4_reports']);
  });
  it('lists no table twice, and skips none it also backs up', () => {
    expect(new Set(TABLES).size).toBe(TABLES.length);
    for (const t of Object.keys(SKIPPED)) expect(TABLES as readonly string[]).not.toContain(t);
  });
  it('never writes a token', () => {
    expect(REDACT.debug_invites).toEqual(expect.arrayContaining(['token', 'token_hash']));
    expect(REDACT.app_tokens).toContain('token_hash');
    expect(REDACT.creator_identities).toContain('refresh_token');
  });
});

function fakeBucket(objects: Record<string, Uint8Array>) {
  const puts: string[] = [];
  const gets: string[] = [];
  return {
    puts, gets, objects,
    head: async (k: string) => (k in objects ? ({}) as never : null),
    get: async (k: string) => { gets.push(k); const b = objects[k]; return b ? ({ arrayBuffer: async () => b.buffer }) as never : null; },
    put: async (k: string, v: ArrayBuffer) => { puts.push(k); objects[k] = new Uint8Array(v); return {} as never; }
  };
}

describe('V4 file copies (SP16)', () => {
  const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
  it('copies each file once, byte for byte, and reports a missing one', async () => {
    const bytes = new TextEncoder().encode('{"format":"sse.pack/1"}');
    const bucket = fakeBucket({ [`v4/${a}.json`]: bytes, [`v4/${b}.json`]: new Uint8Array([1, 2]), [v4CopyKey(b)]: new Uint8Array([1, 2]) });
    const problems: string[] = [];
    const out = await copyV4Files(bucket, [a, b, c, a], problems);
    expect(out.files.length).toBe(3);
    expect(out.copiedNow).toBe(1);
    expect(out.missing).toBe(1);
    expect(bucket.puts).toEqual([v4CopyKey(a)]);
    expect(bucket.gets).not.toContain(`v4/${b}.json`); // already copied: not read again
    expect(Array.from(bucket.objects[v4CopyKey(a)])).toEqual(Array.from(bytes));
    expect(problems).toEqual([`v4 file missing: v4/${c}.json`]);
    // A second run copies nothing.
    const again = await copyV4Files(bucket, [a, b], []);
    expect(again.copiedNow).toBe(0);
  });
  it('keeps copies out of the pruned backups/ folder', () => {
    expect(v4CopyKey(a).startsWith('backups/')).toBe(false);
  });
});
