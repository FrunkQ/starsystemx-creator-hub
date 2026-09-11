// A MAP WITH PROBLEMS (D-88): what the hub calls a problem, and what it does about one.
//
// The owner, 2026-09-11: "Worth having a 'problematic' map status that triggers when it spots
// something like this - with advice on the issue to help them resolve it themselves." Then: a pill,
// advice not to publish, a note to staff if published anyway, and an Issues tab.
//
// THE RULE THESE PIN HARDEST: a healthy map is never called broken. A warning that fires on good
// files is a warning people learn to scroll past, and then it is no use on the bad one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findProblems, problemsFrom, problemKey, PROBLEM_TAG } from '../src/lib/bundle/problems';
import { problemColumns, problemsChanged, issueNotice } from '../src/lib/server/problems';
import { deriveTags, computeFacets } from '../src/lib/bundle/facets';
import { ADMIN_AREAS, outstanding, EMPTY_COUNTS } from '../src/lib/adminNav';
import { readZip } from '../src/lib/bundle/read';

const node = (id: string, parentId: string | null, name = id) => ({ id, parentId, name, kind: 'body', roleHint: 'planet' });
const system = (id: string, name: string, nodes: unknown[] = [node('star', null, 'Star')]) =>
  ({ id, name, position: { x: 0, y: 0 }, system: { id, name, nodes } });
const starmap = (systems: unknown[], extra: Record<string, unknown> = {}) =>
  ({ id: 'map', name: 'A Map', distanceUnit: 'ly', systems, routes: [], ...extra });
const codes = (doc: unknown) => findProblems(doc).map((p) => p.code);

describe('what counts as a problem', () => {
  it('a healthy starmap and a healthy system have none', () => {
    expect(findProblems(starmap([system('a', 'Alpha'), system('b', 'Beta')]))).toEqual([]);
    expect(findProblems({ name: 'Sol', nodes: [node('sun', null), node('earth', 'sun')] })).toEqual([]);
  });

  const fixtureDoc = (file: string, docName: string) => {
    const zip = readZip(new Uint8Array(readFileSync(file)));
    return JSON.parse(new TextDecoder().decode(zip[Object.keys(zip).find((n) => n.endsWith(docName))!]));
  };

  it('the system fixture is healthy - a real file, not only shapes typed here', () => {
    expect(findProblems(fixtureDoc('tests/fixtures/creator-hub-system.sse.zip', 'system.json'))).toEqual([]);
  });

  it('and the starmap fixture is a LAYOUT fixture the app itself would not open', () => {
    // Found by this check the first time it ran, and it is right: the contract fixture was built to
    // exercise the bundle layout, and its one system entry has no "id" and no "position" - both of
    // which the engine's validateStarmap refuses. Six real saves the app wrote came out clean
    // (checked locally; user files are never committed). If this fixture is ever replaced with a
    // real save, this test should change to expect nothing.
    const found = findProblems(fixtureDoc('tests/fixtures/creator-hub-bundle.sse.zip', 'starmap.json'));
    expect(found.map((p) => p.code)).toEqual(['system-structure']);
    expect(found[0].detail).toContain('Contract Reach (no id, no position)');
  });

  it('two systems sharing an id: the map that started this, named, and it will not open before 3.1.66', () => {
    // Both of the engine's bundled Sols carry "solar-system"; the engine's own validator refused the
    // whole campaign ("Duplicate System ID") until A107.
    const [p] = findProblems(starmap([system('solar-system', 'Sol'), system('solar-system', 'Sol (Expanse)')]));
    expect(p).toMatchObject({ code: 'duplicate-system-ids', severity: 'refuses' });
    expect(p.detail).toContain('Sol and Sol (Expanse) are both "solar-system"');
    expect(p.fix).toMatch(/3\.1\.66/);
  });

  it('mirrors what the engine refuses at the top of a starmap - and stops there, as it does', () => {
    const doc = { name: 'No id', systems: 'not a list' };
    const found = findProblems(doc);
    expect(found.map((p) => p.code)).toEqual(['map-structure']);
    for (const field of ['"id"', '"distanceUnit"', '"systems"', '"routes"']) expect(found[0].detail).toContain(field);
    expect(found[0].severity).toBe('refuses');
  });

  it('and what it refuses in a system entry', () => {
    const noPosition = { id: 'x', name: 'Drifter', system: { id: 'x', nodes: [] } };
    const noNodes = { id: 'y', name: 'Hollow', position: { x: 1, y: 1 }, system: { id: 'y' } };
    const [p] = findProblems(starmap([noPosition, noNodes]));
    expect(p.code).toBe('system-structure');
    expect(p.detail).toContain('Drifter (no position)');
    expect(p.detail).toContain('Hollow (no list of objects)');
  });

  it('two objects in ONE system with the same id', () => {
    const doc = starmap([system('s', 'Sol', [node('sun', null, 'Sol'), node('earth', 'sun', 'Earth'), node('earth', 'sun', 'Counter-Earth')])]);
    const p = findProblems(doc).find((x) => x.code === 'duplicate-object-ids')!;
    expect(p.severity).toBe('faulty');
    expect(p.detail).toContain('in Sol, "earth" is Earth and Counter-Earth');
  });

  it('the same object ids in DIFFERENT systems are not a problem - the engine allows it (D-86)', () => {
    // Two copies of one system share every node id; that is legal in the engine, and the hub stores
    // it by renaming. Only the SYSTEM ids clashing is the creator's problem.
    const doc = starmap([system('a', 'Sol', [node('sun', null)]), system('b', 'Sol again', [node('sun', null)])]);
    expect(codes(doc)).toEqual([]);
  });

  it('an object whose parent is not in the file', () => {
    const doc = starmap([system('s', 'Sol', [node('sun', null, 'Sol'), node('luna', 'earth', 'Luna')])]);
    const p = findProblems(doc).find((x) => x.code === 'detached-objects')!;
    expect(p.detail).toContain('Luna in Sol');
  });

  it('a loop of parents is found once, and does not hang', () => {
    const doc = starmap([system('s', 'Sol', [node('sun', null), node('a', 'b', 'Ay'), node('b', 'a', 'Bee')])]);
    const found = findProblems(doc);
    expect(found.map((p) => p.code)).toEqual(['parent-loops']);
    expect(found[0].detail).toMatch(/Ay and Bee|Bee and Ay/);
  });

  it('every problem says what to do, not only what is wrong', () => {
    const doc = starmap([
      system('dup', 'One'), system('dup', 'Two', [node('x', null), node('x', null), node('y', 'gone'), node('p', 'q'), node('q', 'p')])
    ]);
    const found = findProblems(doc);
    expect(found.length).toBeGreaterThanOrEqual(4);
    for (const p of found) {
      expect(p.fix.length, p.code).toBeGreaterThan(60);
      expect(p.fix, p.code).toMatch(/Star System Explorer/);
    }
  });

  it('reads stored findings defensively', () => {
    expect(problemsFrom(null)).toEqual([]);
    expect(problemsFrom([{ code: 'x' }, 'junk', { code: 'y', severity: 'faulty', title: 't', detail: 'd', fix: 'f' }]))
      .toEqual([{ code: 'y', severity: 'faulty', title: 't', detail: 'd', fix: 'f' }]);
  });
});

describe('what the hub does with them', () => {
  const found = findProblems(starmap([system('solar-system', 'Sol'), system('solar-system', 'Sol')]));

  it('the pill goes first, so a card with four pills can never cut it', () => {
    const tags = deriveTags(computeFacets(starmap([system('a', 'A')])), { hasGmContent: false, needsFix: true });
    expect(tags[0]).toBe(PROBLEM_TAG);
    expect(deriveTags(computeFacets(starmap([system('a', 'A')])), { hasGmContent: false })).not.toContain(PROBLEM_TAG);
  });

  it('a fixed file clears the finding, and "noted" is reset only when the findings change', () => {
    expect(problemColumns([], found)).toMatchObject({ problems: null, problems_noted_at: null });
    // The same findings again - a re-index - must not put the map back in front of whoever noted it.
    expect(problemColumns(found, JSON.parse(JSON.stringify(found)))).toEqual({ problems: found });
    expect(problemsChanged(found, found)).toBe(false);
    expect(problemsChanged(found, null)).toBe(true);
    expect(problemKey(found)).not.toBe('');
  });

  it('the note to staff names the map, its creator, each problem, and where to look', () => {
    const { subject, text } = issueNotice({ slug: 'my-starmap', title: 'My Starmap' }, 'SONION', found, 'https://hub.test');
    expect(subject).toBe('A public map will not open: My Starmap');
    expect(text).toContain('My Starmap by SONION is public');
    expect(text).toContain('Two systems share one id');
    expect(text).toContain('https://hub.test/s/my-starmap');
    expect(text).toContain('https://hub.test/admin/issues');

    // A title from a stranger cannot write its own lines into the mail.
    const sneaky = issueNotice({ slug: 'x', title: 'Fine\nBcc: someone' }, 'a\r\nb', found, 'https://hub.test');
    expect(sneaky.subject).not.toMatch(/[\r\n]/);
    expect(sneaky.text.split('\n')[0]).toBe('Fine Bcc: someone by a b is public, and the hub found a problem in its file:');
  });

  it('publishing is advised against, not refused', () => {
    const publish = readFileSync('src/routes/manage/[id]/+page.server.ts', 'utf8');
    expect(publish).toContain("form.get('anyway') !== 'on'");
    expect(publish).toContain('tellStaff(');
  });

  it('the Issues tab sits with the moderation work, and its count can reach zero', () => {
    const area = ADMIN_AREAS.find((a) => a.href === '/admin/issues')!;
    expect(area).toMatchObject({ group: 'Moderation', tier: 'moderator', count: 'issues' });
    expect(outstanding({ ...EMPTY_COUNTS, issues: 2 })).toBe(2);
    // Counted as UNNOTED public maps, so noting one empties it without waiting for the creator.
    expect(readFileSync('src/lib/server/outstanding.ts', 'utf8')).toContain(".is('problems_noted_at', null)");
  });
});
