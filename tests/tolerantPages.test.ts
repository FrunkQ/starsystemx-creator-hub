// NO PAGE MAY NAME A COLUMN THE DATABASE MIGHT NOT HAVE YET (D-71).
//
// ============================================================================================
// A push deploys in minutes; the migration runs when the owner pastes it, which can be hours later.
// The handover states the rule for WRITES - "any write naming a new column must go through
// tolerantWrite or every upload fails for the gap" - and `/rules` proved it is exactly as true of
// READS: its first version named `rule_overrides` in a plain select and returned a 500 to everybody
// until 0037 was run. It was live and broken for about four minutes.
//
// So this scans the routes for a young column reaching a `.select('…')` string, and for a FILTER on
// one - which is worse, because `tolerantSelect` can drop a column from the projection but cannot
// unpick a predicate.
//
// NO REGULAR EXPRESSIONS IN HERE, deliberately. Plain string work is duller and cannot be silently
// broken by an escaping accident on the way into the file - which is how the first draft of this
// test came to throw `Invalid regular expression` instead of checking anything.
// ============================================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';

/**
 * Columns added after the hub went live, which a deploy therefore races.
 *
 * ADD TO THIS WHEN YOU ADD A COLUMN. It is the whole mechanism, and an entry costs nothing until
 * somebody writes a query that names it.
 */
const RECENT = ['rule_overrides', 'fan_setting', 'comments_mailed_at', 'cover_options'];

/** The filter builders that name a column and would fail on a missing one. */
const FILTERS = ['not', 'is', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'ilike', 'order'];

const files = globSync('src/routes/**/*.server.ts');

/** Every string literal passed to `.select(` in a source file. */
function selectLiterals(source: string): string[] {
  const out: string[] = [];
  let at = source.indexOf('select(');
  while (at !== -1) {
    let i = at + 'select('.length;
    while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      const end = source.indexOf(quote, i + 1);
      if (end !== -1) out.push(source.slice(i + 1, end));
    }
    at = source.indexOf('select(', at + 1);
  }
  return out;
}

/** Whether a source filters on a named column, in any of the builder's ways of doing it. */
function filtersOn(source: string, column: string): boolean {
  for (const fn of FILTERS) {
    for (const quote of ["'", '"']) {
      if (source.includes('.' + fn + '(' + quote + column + quote)) return true;
      if (source.includes('.' + fn + '( ' + quote + column + quote)) return true;
    }
  }
  return false;
}

describe('the scan itself works', () => {
  it('found the routes', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('reads a select literal out of ordinary code', () => {
    // If this ever stops matching how the codebase writes a query, every test below passes
    // vacuously and says nothing. So it is checked against a real shape rather than assumed.
    expect(selectLiterals("sb.from('systems').select('id, slug, rule_overrides')"))
      .toEqual(['id, slug, rule_overrides']);
    expect(selectLiterals('sb.from("x").select(\n  "a, b"\n)')).toEqual(['a, b']);
    // The tolerant form passes an ARRAY through a variable, so nothing is found - which is the
    // whole point: that is the shape that is safe.
    expect(selectLiterals('sb.from("x").select(cols)')).toEqual([]);
  });

  it('spots a filter on a column', () => {
    expect(filtersOn(".not('rule_overrides', 'is', null)", 'rule_overrides')).toBe(true);
    expect(filtersOn(".eq('state', 'public')", 'rule_overrides')).toBe(false);
  });
});

describe('no route names a young column in a plain select', () => {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const literals = selectLiterals(source);
    const named = RECENT.filter((c) => literals.some((l) => l.split(/[\s,]+/).includes(c)));
    if (!named.length) continue;

    it(file.replace(/\\/g, '/'), () => {
      expect(named, 'A push deploys before the migration runs, so a plain select on a young column '
        + 'is a 500 for everybody until the owner pastes the SQL. Use tolerantSelect and list it '
        + 'as optional.').toEqual([]);
    });
  }

  it('checked at least one file', () => {
    expect(files.some((f) => selectLiterals(readFileSync(f, 'utf8')).length > 0)).toBe(true);
  });
});

describe('and nothing FILTERS on one', () => {
  it('because tolerantSelect cannot rescue a predicate', () => {
    // It drops a column from the projection and runs the query again. A `.not(col, …)` on a column
    // that does not exist fails just as hard and there is nothing to drop - filter in JavaScript.
    const bad: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const column of RECENT) if (filtersOn(source, column)) bad.push(file + ' -> ' + column);
    }
    expect(bad).toEqual([]);
  });
});
