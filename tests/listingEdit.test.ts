// SP15: the maker edits their listing and takes their own item off the shelf; the file never changes.
import { describe, it, expect } from 'vitest';
import { editV4Listing, setOwnShelf, LISTING_COLUMNS, isServed } from '../src/lib/server/v4';
import { cleanSetting } from '../src/lib/fanWork';

type Row = Record<string, unknown>;
function fakeDb(row: Row, opts: { stateCheck?: string[] } = {}) {
  const updates: Row[] = [];
  const logged: Row[] = [];
  const db = {
    from(table: string) {
      const q = {
        select: () => q, eq: () => q, neq: () => q,
        maybeSingle: async () => ({ data: table === 'v4_items' ? { ...row } : null }),
        insert: async (r: Row) => { if (table === 'admin_actions') logged.push(r); return { error: null }; },
        update: (patch: Row) => ({
          eq: async () => {
            if (opts.stateCheck && 'state' in patch && !opts.stateCheck.includes(patch.state as string)) {
              return { error: { code: '23514', message: 'check' } };
            }
            updates.push(patch); Object.assign(row, patch); return { error: null };
          }
        })
      };
      return q;
    }
  };
  return { db: db as never, updates, logged, row };
}

const sol = () => ({
  id: 'i1', slug: 'sse.sol-today-0.1.0', creator_id: 'alex', state: 'public', title: 'sol-today',
  summary: null, fan_setting: null, sha256: 'f'.repeat(64), byte_size: 4160000
});
const SUMMARY = 'Every orbital launch since Sputnik, every craft that left Earth, and everyone who has flown in space, day by day to late 2026.';

describe('edit a listing (SP15)', () => {
  it('changes title and summary and nothing else; the file and its hash stay', async () => {
    const f = fakeDb(sol());
    const out = await editV4Listing(f.db, 'alex', 'sse.sol-today-0.1.0', { title: 'Sol today', summary: SUMMARY }, cleanSetting);
    expect(out).toEqual({ ok: true, changed: ['title', 'summary'] });
    for (const patch of f.updates) for (const k of Object.keys(patch)) expect([...LISTING_COLUMNS, 'updated_at']).toContain(k);
    expect(f.row.sha256).toBe('f'.repeat(64));
    expect(f.row.byte_size).toBe(4160000);
    expect(f.row.slug).toBe('sse.sol-today-0.1.0');
    expect(f.row.summary).toBe(SUMMARY);
    expect(f.logged[0]).toMatchObject({ action: 'v4.edit', target: 'v4_item:sse.sol-today-0.1.0' });
  });
  it('is the maker\'s alone', async () => {
    const f = fakeDb(sol());
    expect(await editV4Listing(f.db, 'someone-else', 'sse.sol-today-0.1.0', { title: 'Mine now' }, cleanSetting)).toMatchObject({ ok: false, status: 404 });
    expect(f.updates).toEqual([]);
  });
  it('needs a title, and writes nothing when nothing changed', async () => {
    const f = fakeDb(sol());
    expect(await editV4Listing(f.db, 'alex', 'x', { title: '   ' }, cleanSetting)).toMatchObject({ ok: false, status: 400 });
    expect(await editV4Listing(f.db, 'alex', 'x', { title: 'sol-today' }, cleanSetting)).toEqual({ ok: true, changed: [] });
    expect(f.updates).toEqual([]);
  });
  it('sets and clears the fan setting', async () => {
    const f = fakeDb(sol());
    await editV4Listing(f.db, 'alex', 'x', { fanSetting: '  Traveller ' }, cleanSetting);
    expect(f.row.fan_setting).toBe('Traveller');
    await editV4Listing(f.db, 'alex', 'x', { fanSetting: '' }, cleanSetting);
    expect(f.row.fan_setting).toBeNull();
  });
  it('leaves a removed item alone', async () => {
    const f = fakeDb({ ...sol(), state: 'removed' });
    expect(await editV4Listing(f.db, 'alex', 'x', { title: 'Back' }, cleanSetting)).toMatchObject({ ok: false, status: 409 });
  });
});

describe('off the shelf and back (SP15)', () => {
  it('takes it off and puts it back, logged both ways', async () => {
    const f = fakeDb(sol());
    expect(await setOwnShelf(f.db, 'alex', 'x', false)).toEqual({ ok: true, state: 'withdrawn' });
    expect(await setOwnShelf(f.db, 'alex', 'x', true)).toEqual({ ok: true, state: 'public' });
    expect(f.logged.map((l) => l.action)).toEqual(['v4.withdraw', 'v4.return']);
  });
  it('a withdrawn item is still served at its address; a held one is not', () => {
    expect(isServed('withdrawn')).toBe(true);
    expect(isServed('held')).toBe(false);
    expect(isServed('draft')).toBe(false);
  });
  it('never lifts a moderator\'s hold', async () => {
    const f = fakeDb({ ...sol(), state: 'held' });
    expect(await setOwnShelf(f.db, 'alex', 'x', true)).toMatchObject({ ok: false, status: 409 });
    expect(f.updates).toEqual([]);
  });
  it('says plainly when the database change has not been run', async () => {
    const f = fakeDb(sol(), { stateCheck: ['public', 'held', 'removed'] });
    const out = await setOwnShelf(f.db, 'alex', 'x', false);
    expect(out).toMatchObject({ ok: false, status: 503 });
    expect(f.row.state).toBe('public');
  });
  it('is the maker\'s alone', async () => {
    const f = fakeDb(sol());
    expect(await setOwnShelf(f.db, 'someone', 'x', false)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('migration 0045', () => {
  it('only widens the state check', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('db/migrations/0045_v4_withdrawn_and_draft.sql', 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\b(update|delete|insert|drop\s+table|drop\s+column|truncate)\b/i);
    expect(sql).toMatch(/'public', 'held', 'removed', 'withdrawn', 'draft'/);
  });
});
