// A MAP'S ADDRESS NEVER CHANGES (D-25, D-84).
//
// The owner, 2026-09-11: "what happens if 2 starmaps of the same name happen?" The answer was fine -
// the second is `-2` - but finding it turned up that a RE-UPLOAD recomputed the address from the
// title, so renaming a map in the app moved it. Shared links, the QR code on a designed cover, the
// `origin/hub` url stamped into other people's files and "Used in" all lean on the slug staying put.
//
// Source scans, because the slug is chosen inside an upload that needs a Worker and a database.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';

describe('slugs never change (D-84)', () => {
  it('an existing map keeps its slug before any is computed from the title', () => {
    const ingest = readFileSync('src/lib/server/ingest.ts', 'utf8');
    const fn = ingest.slice(ingest.indexOf('async function uniqueSlug'));
    const keep = fn.indexOf(".select('slug').eq('id', systemId)");
    expect(keep, 'uniqueSlug must look up the map by id first').toBeGreaterThan(-1);
    expect(keep).toBeLessThan(fn.indexOf('const base'));
  });

  it('nothing edits a slug after the fact', () => {
    // Renaming on the manage page changes the TITLE only, which is right. Nothing else may write it.
    const writers = globSync('src/**/*.ts')
      .filter((f) => /\.update\(\{[^}]*\bslug\b/.test(readFileSync(f, 'utf8')));
    expect(writers).toEqual([]);
  });
});
