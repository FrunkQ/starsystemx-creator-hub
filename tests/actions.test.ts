// A RULE SVELTEKIT ENFORCES AT REQUEST TIME, CHECKED HERE INSTEAD (D-47).
//
// ============================================================================================
// `check_named_default_separate` in SvelteKit's runtime:
//
//   if (actions.default && Object.keys(actions).length > 1) throw new Error(
//     'When using named actions, the default action cannot be used.')
//
// It is a 500 on the POST. Not a build error, not a type error, not a warning - nothing says a
// word until somebody presses the button. The Gates page grew its first named action in 0.18.0 and
// from that moment EVERY button on it threw, including the Set that had worked for weeks; it was
// found when the owner pressed the two test buttons a fortnight later (2026-09-06).
//
// The whole class is one grep over the source, so it is one.
// ============================================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every `+page.server.ts` under src/routes. */
function pageServers(dir = 'src/routes', found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) pageServers(path, found);
    else if (entry === '+page.server.ts') found.push(path);
  }
  return found;
}

/**
 * The action names a file declares, read from the source.
 *
 * A heuristic, and deliberately a narrow one: it matches the shape this codebase writes actions in
 * - two spaces, a name, `: async`. A file that ever stops writing them that way would go unchecked
 * rather than falsely accused, which is the right way round for a test that guards a convention.
 */
function actionNames(source: string): string[] {
  const at = source.indexOf('export const actions');
  if (at < 0) return [];
  return [...source.slice(at).matchAll(/^ {2}([A-Za-z_][\w]*): async/gm)].map((m) => m[1]);
}

describe('form actions', () => {
  const files = pageServers();

  it('finds the pages, so an empty pass cannot look like a green one', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s does not mix a default action with named ones', (file) => {
    const names = actionNames(readFileSync(file, 'utf8'));
    if (!names.includes('default')) return;
    expect(names, file + ' has a default action beside ' + names.join(', ')).toEqual(['default']);
  });

  it('reads the shape this codebase writes', () => {
    // The heuristic itself, pinned - if it silently matched nothing, every case above would pass.
    expect(actionNames('export const actions = {\n  set: async () => {},\n  testMail: async () => {}\n}'))
      .toEqual(['set', 'testMail']);
    expect(actionNames('const x = 1')).toEqual([]);
  });
});
