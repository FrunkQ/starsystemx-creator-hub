// Things the code ASSUMES about the schema, checked against the migration text - because the
// database is not available to the test suite, and an assumption that is wrong fails silently in
// production (supabase-js reports in `error`, it does not throw).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SYSTEM_ASSETS_KEY } from '../src/lib/server/cover';

const init = readFileSync('db/migrations/0001_init.sql', 'utf8');

/** The primary key columns of one table, read out of its `create table` block. */
function primaryKeyOf(table: string): string {
  const block = init.slice(init.indexOf('create table ' + table + ' ('));
  const body = block.slice(0, block.indexOf(');'));
  const m = /primary key \(([^)]+)\)/.exec(body);
  if (!m) throw new Error('no composite primary key found for ' + table);
  return m[1].split(',').map((s) => s.trim()).join(',');
}

describe('what the code assumes about the schema', () => {
  it('upserts into system_assets on its ACTUAL primary key', () => {
    // The generated-cover backfill once named (system_id, sha256). PostgREST refused it, the row
    // never landed, and covers vanished after the first page view. The key is (system_id, bundle_path).
    expect(SYSTEM_ASSETS_KEY).toBe(primaryKeyOf('system_assets'));
  });
});
