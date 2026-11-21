// PAID PACKS, PP2: the two migrations only ADD (owner's standing rule: nothing existing is altered),
// every new table is locked to the server, and every setting the code falls back to has a row the
// admin can change.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GATE_FALLBACKS } from '../src/lib/server/config';

const sw = readFileSync('db/migrations/0042_paid_packs_switch.sql', 'utf8');
const tables = readFileSync('db/migrations/0043_paid_packs_tables.sql', 'utf8');
const code = (sql: string) => sql.replace(/--.*$/gm, '');

describe('the paid-pack migrations', () => {
  it('only add: no drop, delete, update, truncate, or alter of a table they did not create', () => {
    for (const sql of [code(sw), code(tables)]) {
      expect(sql).not.toMatch(/^\s*(drop|delete|update|truncate)\b/im);
      expect(sql).not.toMatch(/\b(drop (table|column|type)|delete from|truncate)\b/i);
      const created = [...sql.matchAll(/create table if not exists (\w+)/gi)].map((m) => m[1]);
      for (const m of sql.matchAll(/alter table (\w+)/gi)) expect(created, m[1]).toContain(m[1]);
    }
    expect(code(sw)).toMatch(/on conflict \(key\) do nothing/);
  });

  it('locks every new table to the server', () => {
    const sql = code(tables);
    const created = [...sql.matchAll(/create table if not exists (\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(['seller_accounts', 'paid_listings', 'purchases', 'payout_ledger', 'stripe_events']);
    for (const t of created) expect(sql).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    expect(sql).not.toMatch(/create policy/i);
  });

  it('never cascades a money record away with an account or a map', () => {
    expect(code(tables)).not.toMatch(/on delete cascade/i);
  });

  it('gives every paid_packs setting a row, starting at the code\'s own fallback', () => {
    const keys = Object.keys(GATE_FALLBACKS).filter((k) => k.startsWith('paid_packs'));
    for (const k of keys) {
      const m = new RegExp(`\\('${k}', '([^']+)'::jsonb`).exec(sw);
      expect(m, k).not.toBeNull();
      expect(JSON.parse(m![1]), k).toEqual((GATE_FALLBACKS as unknown as Record<string, unknown>)[k]);
    }
  });
});
