// Schema-tolerant writes: see src/lib/server/tolerant.ts for why a deploy can run ahead of a
// migration and what that must NOT be allowed to break.
import { describe, it, expect } from 'vitest';
import { tolerantWrite, tolerantSelect } from '../src/lib/server/tolerant';
import { isoWeek } from '../src/lib/server/visitor';

const unknown = (col: string) => ({
  code: 'PGRST204',
  message: `Could not find the '${col}' column of 'systems' in the schema cache`
});

describe('a write against a schema that is behind the code', () => {
  it('drops the column the database named and tries again', async () => {
    const seen: unknown[] = [];
    const r = await tolerantWrite({ id: 1, title: 't', revision: 7 }, async (row) => {
      seen.push({ ...row });
      return { error: 'revision' in row ? unknown('revision') : null };
    });
    expect(r.error).toBeNull();
    expect(r.dropped).toEqual(['revision']);
    expect(seen[1]).toEqual({ id: 1, title: 't' });
  });

  it('drops more than one, one at a time', async () => {
    const r = await tolerantWrite({ id: 1, revision: 7, export_mode: 'gm' }, async (row) => {
      if ('revision' in row) return { error: unknown('revision') };
      if ('export_mode' in row) return { error: unknown('export_mode') };
      return { error: null };
    });
    expect(r.dropped).toEqual(['revision', 'export_mode']);
  });

  it('passes any other error straight through, untouched', async () => {
    const boom = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const r = await tolerantWrite({ id: 1 }, async () => ({ error: boom }));
    expect(r.error).toBe(boom);
    expect(r.dropped).toEqual([]);
  });

  it('will not drop a column the row does not contain - that would be a different bug', async () => {
    const r = await tolerantWrite({ id: 1 }, async () => ({ error: unknown('revision') }));
    expect(r.error?.code).toBe('PGRST204');
  });

  it('gives up rather than looping on a database that names a column forever', async () => {
    let calls = 0;
    const r = await tolerantWrite({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, async (row) => {
      calls++;
      const k = Object.keys(row)[0];
      return { error: k ? unknown(k) : null };
    }, 3);
    expect(calls).toBe(4);
    expect(r.error).not.toBeNull();
  });
});

describe('a read against a schema that is behind the code', () => {
  const missing = (col: string) => ({ code: '42703', message: 'column systems.' + col + ' does not exist' });

  it('drops an optional column the database named and reads again', async () => {
    const asked: string[] = [];
    const r = await tolerantSelect<{ slug: string }[]>(['slug', 'comments_count'], ['comments_count'], async (cols) => {
      asked.push(cols);
      return cols.includes('comments_count')
        ? { data: null, error: missing('comments_count') }
        : { data: [{ slug: 'a' }], error: null };
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ slug: 'a' }]);
    expect(r.dropped).toEqual(['comments_count']);
    expect(asked).toEqual(['slug, comments_count', 'slug']);
  });

  it('will not drop a column the page depends on', async () => {
    const r = await tolerantSelect(['slug', 'title'], ['comments_count'], async () => ({ data: null, error: missing('title') }));
    expect(r.error?.code).toBe('42703');
    expect(r.dropped).toEqual([]);
  });

  it('passes any other failure straight through', async () => {
    const r = await tolerantSelect(['slug'], ['comments_count'], async () => ({ data: null, error: { message: 'connection reset' } }));
    expect(r.error?.message).toBe('connection reset');
  });
});

describe('the visitor week', () => {
  it('is the ISO week, Thursday deciding the year', () => {
    expect(isoWeek(new Date('2026-09-03T12:00:00Z'))).toBe('2026-W36');
    // 1 Jan 2027 is a Friday and belongs to the last week of 2026, which has 53.
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
  });
});
