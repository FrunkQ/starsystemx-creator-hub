// THE APP'S MAP LIST: WHAT THE ENGINE'S SEAM REPORT SAID WAS MISSING (R-20, D-90).
//
// "tag= filters auto_tags, not tags, so a hand-added `default` is invisible to it today." And "The
// list sends no creator, so the card shows none." A route needs a Worker and a database, so these
// read the source - but they pin the two promises, and the one safety property that came with them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/routes/api/maps/+server.ts', 'utf8');
const doc = readFileSync('docs/prompt-for-sse-2026-09-11-map-list-api.md', 'utf8');

describe('the app map list', () => {
  it('a tag matches the creator\'s own tags as well as the derived pills, as /browse does', () => {
    expect(route).toContain("query.or('auto_tags.cs.{' + t + '},tags.cs.{' + t + '}')");
    expect(route).not.toContain(".contains('auto_tags', tags)");
    // The same clause /browse uses, so the two answers to "maps with this tag" cannot disagree.
    expect(readFileSync('src/routes/browse/+page.server.ts', 'utf8')).toContain("'auto_tags.cs.{' + t + '},tags.cs.{' + t + '}'");
  });

  it('a tag is validated before it is written into a filter string', () => {
    // `or(...)` is PostgREST syntax built from text: a "tag" carrying a comma or a bracket could add
    // a clause of its own. The regex is the whole defence, so it is pinned.
    expect(route).toContain('const SAFE_TAG = /^[a-z0-9-]{1,40}$/;');
    expect(route).toContain('.filter((t) => SAFE_TAG.test(t))');
    const SAFE_TAG = /^[a-z0-9-]{1,40}$/;
    for (const bad of ['default}', 'a,tags.cs.{x', 'x)', 'two words', '']) expect(SAFE_TAG.test(bad), bad).toBe(false);
    expect(SAFE_TAG.test('default')).toBe(true);
  });

  it('each map names its creator, and the database id does not leak in its place', () => {
    expect(route).toContain("creator: nameOf.has(creator_id) ? { name: nameOf.get(creator_id) as string, url: null } : null");
    expect(route).toContain('map(({ creator_id, ...m }) =>');
  });

  it('the interface the engine reads says all of it', () => {
    expect(doc).toContain('creator: { name: string; url: string | null } | null;');
    expect(doc).toMatch(/`tag`.*creator's own tags/);
    expect(doc).toContain('needs-a-fix');
  });
});
