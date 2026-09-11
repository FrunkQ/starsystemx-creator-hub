// RE-INDEXING: WHICH MAPS ARE BEHIND, AND NEVER MORE THAN ONE A REQUEST (D-87).
//
// The owner pressed the Config page's re-index after a reader fix and "nothing appeared to happen".
// The button asked one request to re-read eight maps; one map costs 20-45ms of CPU against a free
// Worker's 10ms, and the request was cut off after two. It also judged "behind" against TODAY, so on
// the day a reader changes it could say nothing was behind while a map uploaded that morning was.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { behind, builtAt, type MapToRead } from '../src/lib/server/reindex';

const map = (id: string, reindexed_at: string | null): MapToRead => ({ id, slug: id, title: id, reindexed_at });

describe('which maps are behind', () => {
  const build = '2026-09-11T10:09:00.000Z';

  it('is anything read before this build, oldest first, never-read ones first of all', () => {
    const rows = [
      map('read-this-morning', '2026-09-11T09:38:13.658Z'),
      map('never-read', null),
      map('read-after-the-deploy', '2026-09-11T10:42:06.260Z'),
      map('read-last-week', '2026-09-04T12:00:00.000Z')
    ];
    expect(behind(rows, build).map((m) => m.id)).toEqual(['never-read', 'read-last-week', 'read-this-morning']);
  });

  it('THE CASE THE OLD BUTTON GOT WRONG: read today, but before the reader changed', () => {
    // It compared with the date, so this map counted as current and the button said "nothing is
    // behind" - on the one day the button was needed.
    expect(behind([map('my-starmap', '2026-09-11T09:38:13.658Z')], build)).toHaveLength(1);
  });

  it('a reading that will not parse counts as behind rather than current', () => {
    expect(behind([map('garbled', 'yesterday-ish')], build)).toHaveLength(1);
  });

  it('knows when the running code was built', () => {
    expect(Number.isFinite(Date.parse(builtAt()))).toBe(true);
  });
});

describe('never more than one map a request', () => {
  it('only the single-map places call reindexSystem, and nothing loops over it on the server', () => {
    // If a new caller is needed, add it here ON PURPOSE - and make sure it does one map.
    const callers = globSync('src/**/*.{ts,svelte}')
      .map((f) => f.split('\\').join('/'))
      .filter((f) => f !== 'src/lib/server/reindex.ts')
      .filter((f) => readFileSync(f, 'utf8').includes('reindexSystem('))
      .sort();
    expect(callers).toEqual([
      'src/routes/api/reindex/+server.ts',        // one id per POST
      'src/routes/manage/[id]/+page.server.ts',   // the creator's own button
      'src/routes/s/[slug]/+page.server.ts'       // the background re-read of a stale page
    ]);
    const lib = readFileSync('src/lib/server/reindex.ts', 'utf8');
    expect(lib).not.toMatch(/export async function reindexBatch/);
  });

  it('the Config page walks the list from the browser, one POST per map', () => {
    const page = readFileSync('src/routes/admin/config/+page.svelte', 'utf8');
    expect(page).toContain("fetch('/api/reindex', {");
    expect(page).not.toContain('?/reindexBatch');
  });
});
