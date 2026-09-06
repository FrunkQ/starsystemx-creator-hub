import { describe, it, expect } from 'vitest';
import { setConfigRow } from '../src/lib/server/config';

/**
 * THE BUG THIS PINS. An UPDATE that matches no rows is not an error in Postgres, so setting a key
 * with no row used to return success, tell the admin it had saved, and write a `config.set` audit
 * entry - while nothing was written. Found while the owner was looking for `sse_manifest_url` in
 * the admin page. These assertions are absolute rather than "does not throw": the whole failure
 * mode was a happy answer.
 */

/** A `config` table holding `keys`, recording what was written to it. */
function stubDb(keys: string[], writes: Record<string, unknown>[] = []) {
  const sb = {
    from: () => ({
      update: (row: Record<string, unknown>) => ({
        eq: (_col: string, key: string) => ({
          select: async () => {
            if (!keys.includes(key)) return { data: [], error: null };
            writes.push({ key, ...row });
            return { data: [{ key }], error: null };
          }
        })
      })
    })
  };
  return { sb: sb as never, writes };
}

describe('writing one config row', () => {
  it('writes the value, and says nothing went wrong', async () => {
    const { sb, writes } = stubDb(['open_in_sse_url']);

    const problem = await setConfigRow(sb, 'open_in_sse_url', 'https://starsystemx.com/?open=', 'admin-1');

    expect(problem).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      key: 'open_in_sse_url',
      value: 'https://starsystemx.com/?open=',
      updated_by: 'admin-1'
    });
    expect(typeof writes[0].updated_at).toBe('string');
  });

  // THE ONE THAT MATTERS: a key with no row must REFUSE, not report success.
  it('refuses a key that has no row, rather than claiming it saved', async () => {
    const { sb, writes } = stubDb(['open_in_sse_url']);

    const problem = await setConfigRow(sb, 'no_such_row', 'anything', 'admin-1');

    expect(problem).not.toBeNull();
    expect(problem).toContain('no_such_row');
    expect(problem).toContain('migration');
    expect(writes).toHaveLength(0);
  });

  it('passes a real database error back in words', async () => {
    const sb = {
      from: () => ({
        update: () => ({
          eq: () => ({ select: async () => ({ data: null, error: { message: 'permission denied for table config' } }) })
        })
      })
    } as never;

    expect(await setConfigRow(sb, 'open_in_sse_url', 'x', 'admin-1'))
      .toBe('permission denied for table config');
  });
});
