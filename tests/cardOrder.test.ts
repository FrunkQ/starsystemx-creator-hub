// MAPS THAT NEED A FIX COME LAST, WHEREVER MAPS ARE LISTED (D-89).
//
// The owner, 2026-09-11: "Problem maps should be deprioritised on searches/browsing." Every list is
// cut short in the database, so the order has to be in the query - and one definition, because the
// front page, /browse and the app's list had each written their own.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { orderCards, type CardSort } from '../src/lib/server/cards';

/** A stand-in query builder that records the order clauses it is given. */
function recorder() {
  const calls: [string, Record<string, unknown>][] = [];
  const q = { order(column: string, opts: Record<string, unknown>) { calls.push([column, opts]); return q; } };
  return { q, calls };
}

describe('the order of a list of maps', () => {
  it('puts every map with no problems ahead of every map with some, whatever the sort', () => {
    for (const sort of ['loved', 'new', 'detailed', 'discussed'] as CardSort[]) {
      const { q, calls } = recorder();
      orderCards(q, sort);
      // FIRST, or it is only a tie-break: `problems` is null for a healthy map, and nulls first.
      expect(calls[0], sort).toEqual(['problems', { ascending: true, nullsFirst: true }]);
      expect(calls.length, sort).toBeGreaterThan(1);
    }
  });

  it('keeps each sort meaning what it meant', () => {
    const after = (sort: CardSort) => { const { q, calls } = recorder(); orderCards(q, sort); return calls.slice(1).map((c) => c[0]); };
    expect(after('loved')).toEqual(['hearts_count', 'created_at']);
    expect(after('new')).toEqual(['created_at']);
    expect(after('detailed')).toEqual(['info_density', 'hearts_count']);
    expect(after('discussed')).toEqual(['comments_count', 'created_at']);
  });

  it('every public list of maps orders through it, and none writes its own', () => {
    for (const file of ['src/routes/+page.server.ts', 'src/routes/browse/+page.server.ts', 'src/routes/api/maps/+server.ts']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('orderCards(');
      expect(source.includes(".order('hearts_count'") || source.includes(".order('created_at'"), file).toBe(false);
    }
  });

  it('browse never suggests narrowing a crowd down to the broken maps', () => {
    expect(readFileSync('src/routes/browse/+page.server.ts', 'utf8')).toContain('t !== PROBLEM_TAG');
  });
});
