// SP17: the V3 library is two shelves on the one Shelves page, sharing its search and filter.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanSearch, matchesSearch, V3_CONTAINS, V3_SHELF_SIZE } from '../src/lib/shelves';

describe('one search for every shelf (SP17)', () => {
  it('keeps only what a title can hold', () => {
    expect(cleanSearch('Sol, (today)')).toBe('Sol today');
    expect(cleanSearch(null)).toBe('');
  });
  it('matches title or summary, any case; no search matches all', () => {
    expect(matchesSearch('sputnik', 'Sol today', 'Every orbital launch since Sputnik')).toBe(true);
    expect(matchesSearch('traveller', 'Sol today', null)).toBe(false);
    expect(matchesSearch('', 'anything')).toBe(true);
  });
});

describe('the V3 shelves (SP17)', () => {
  const server = readFileSync('src/routes/shelves/+page.server.ts', 'utf8');
  it('are on the Shelves page, read from the V3 table as it is', () => {
    expect(server).toContain("'Starmaps (V3)'");
    expect(server).toContain("'Systems (V3)'");
    expect(server).toMatch(/from\('systems'\)\.select\(cols\)\.eq\('state', 'public'\)\.eq\('visibility', 'public'\)/);
  });
  it('only read the V3 library, never write it', () => {
    expect(server).not.toMatch(/\.(update|insert|delete|upsert)\(/);
  });
  it('are short, with the rest on Browse', () => {
    expect(V3_SHELF_SIZE).toBeLessThanOrEqual(24);
    expect(server).toContain("'/browse?kind='");
  });
  it('share the contains pills with Browse', () => {
    const browse = readFileSync('src/routes/browse/+page.server.ts', 'utf8');
    expect(browse).toContain('V3_CONTAINS.map');
    expect(V3_CONTAINS.map((t) => t.slug)).toContain('ships');
  });
});
