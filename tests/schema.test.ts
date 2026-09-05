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

  it('keeps the comment count by a trigger that recounts on removal as well as on insert', () => {
    // api/comment REMOVES by updating removed_at; a trigger on insert and delete alone would leave
    // the count one too high after every removal.
    const sql = readFileSync('db/migrations/0021_comments.sql', 'utf8');
    expect(sql).toMatch(/after insert or update of removed_at or delete on comments/);
    expect(sql).toMatch(/alter table systems add column if not exists comments_count/);
  });

  it('lets a comment outlive its author (0022): the creator link is nullable and set null on delete', () => {
    // accounts.deleteCreator with "keep my comments" relies on this; before 0022 the cascade
    // would take the comments with the account regardless of the choice.
    const sql = readFileSync('db/migrations/0022_moderation.sql', 'utf8');
    expect(sql).toMatch(/alter table comments alter column creator_id drop not null/);
    expect(sql).toMatch(/references creators \(id\) on delete set null/);
  });
});
