// THE TAKEDOWN LEDGER'S PROMISES (D-69).
//
// The owner asked for these to be "stored forever alongside who the takedown came from - just so we
// can track these for good". Most of that promise lives in SQL, so this pins the parts of the
// migration a later change could quietly undo - the same shape as `tests/schema.test.ts`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADMIN_AREAS, visibleTo, outstanding, EMPTY_COUNTS } from '../src/lib/adminNav';
import { describeAction, parseTarget, isModeratorAction } from '../src/lib/auditLog';

const sql = readFileSync('db/migrations/0036_takedowns.sql', 'utf8');

describe('the migration keeps what it promises', () => {
  it('never cascades a map deletion onto the claim about it', () => {
    // THE ONE THAT MUST NOT BE GOT WRONG. Taking the map down is usually the OUTCOME, so a cascade
    // would delete the record of the claim at exactly the moment it matters most.
    expect(sql).toMatch(/system_id\s+uuid\s+references systems \(id\) on delete set null/);
    expect(sql).not.toMatch(/references systems \(id\) on delete cascade/);
  });

  it('copies the url and title in as text, so the row still reads after the map is gone', () => {
    expect(sql).toMatch(/url\s+text/);
    expect(sql).toMatch(/system_title\s+text/);
  });

  it('requires an address to reply to', () => {
    expect(sql).toMatch(/claimant_email\s+text not null/);
  });

  it('has row-level security on with no policies - the standing rule from 0003', () => {
    // 0029 shipped without this and had to be corrected in place. This table holds a stranger's
    // name and email, so the anon key must reach none of it.
    expect(sql).toMatch(/alter table takedowns enable row level security/);
    expect(sql).not.toMatch(/create policy/);
  });

  it('has all four outcomes, including the two that are not "we took it down"', () => {
    // A ledger that can only record agreement is not a record, it is a formality.
    for (const state of ['open', 'actioned', 'rejected', 'withdrawn']) {
      expect(sql, state).toContain("'" + state + "'");
    }
  });

  it('is idempotent, because every migration here is run by hand', () => {
    expect(sql).toMatch(/create table if not exists takedowns/);
  });
});

describe('the queue is in moderation and counts as work', () => {
  it('a moderator can reach it', () => {
    expect(visibleTo('moderator').map((a) => a.href)).toContain('/admin/takedowns');
  });

  it('an open claim shows in the banner number', () => {
    const counts = { ...EMPTY_COUNTS, takedowns: 2 };
    expect(outstanding(counts)).toBe(2);
  });

  it('its badge is wired to the count it names', () => {
    // An area with a `count` key that nothing fills is a badge that never appears.
    const area = ADMIN_AREAS.find((a) => a.href === '/admin/takedowns')!;
    expect(area.count).toBe('takedowns');
    expect(Object.keys(EMPTY_COUNTS)).toContain(area.count!);
  });
});

describe('the audit log can read a takedown action', () => {
  it('describes every outcome in words, not enum values', () => {
    for (const action of ['takedown.actioned', 'takedown.rejected', 'takedown.withdrawn', 'takedown.reopen']) {
      const { verb, group } = describeAction(action);
      expect(verb, action).not.toContain('takedown.');
      expect(group, action).toBe('Moderation');
    }
  });

  it('counts as a moderator action, which is the filter an admin actually uses', () => {
    expect(isModeratorAction('takedown.actioned')).toBe(true);
  });

  it('knows what a takedown target is', () => {
    expect(parseTarget('takedown.actioned', 'takedown:abc')).toEqual({ kind: 'takedown', id: 'abc' });
  });
});
