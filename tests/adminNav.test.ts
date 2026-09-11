// The staff nav: what each tier can reach, and what the number circles say.
//
// The tier test is the one that matters. There is no moderator ROLE yet, so this file is currently
// the whole definition of what one would be able to do - and the day the role is created, these
// expectations are what the guard has to enforce.
import { describe, it, expect } from 'vitest';
import {
  ADMIN_AREAS, GROUPS, visibleTo, areasIn, badgeFor, badgeLabel, outstanding, EMPTY_COUNTS
} from '../src/lib/adminNav';

describe('who can reach what', () => {
  it('gives an admin everything', () => {
    expect(visibleTo('admin')).toHaveLength(ADMIN_AREAS.length);
  });

  it('gives a moderator the moderation work and none of the running of the place', () => {
    const seen = visibleTo('moderator');
    // THE OWNER'S OWN LIST, pinned so it cannot drift by accident. It was five areas from D-39
    // ("Tag Review, Review, Comments, Explorers, Reports") and Takedowns joined it on 2026-09-07 at
    // his word: *"a moderator page to see incoming requests and whether the info was removed or the
    // request ignored"* (D-69). Issues joined on 2026-09-11, also at his word: *"A new issues tab
    // near reports/takedowns/comments"* (D-88). Anything else appearing here should have to argue
    // with this line.
    expect(seen.map((a) => a.href)).toEqual([
      '/admin/tags', '/admin/review', '/admin/reports', '/admin/takedowns', '/admin/issues',
      '/admin/comments', '/admin/explorers'
    ]);
    expect(seen.every((a) => a.group === 'Moderation')).toBe(true);
  });

  it("keeps the running of the place out of a moderator's hands", () => {
    // The owner, 2026-09-06: "Running the place = just admin." Explorers moved the OTHER way in
    // the same message, so the earlier reading here - that ending an account is not a moderator's
    // job - survives as one guarded action in the route, not as a whole area.
    const mods = visibleTo('moderator').map((a) => a.href);
    for (const href of ['/admin/config', '/admin/stats', '/admin/backup', '/admin/debug']) {
      expect(mods).not.toContain(href);
    }
  });

  it('every area belongs to a group the nav draws', () => {
    for (const area of ADMIN_AREAS) expect(GROUPS).toContain(area.group);
    expect(GROUPS.flatMap((g) => areasIn(g))).toHaveLength(ADMIN_AREAS.length);
  });
});

describe('the number circles', () => {
  const counts = { review: 3, reports: 1, debug: 12, tags: 2, takedowns: 0, issues: 0 };

  it('shows a count where there is one', () => {
    expect(badgeFor(ADMIN_AREAS.find((a) => a.href === '/admin/review')!, counts)).toBe(3);
  });

  it('shows nothing at zero - an empty queue is not news', () => {
    expect(badgeFor(ADMIN_AREAS.find((a) => a.href === '/admin/reports')!, { ...counts, reports: 0 })).toBeNull();
  });

  it('shows nothing when the count could not be taken, rather than a confident zero', () => {
    expect(badgeFor(ADMIN_AREAS.find((a) => a.href === '/admin/review')!, EMPTY_COUNTS)).toBeNull();
  });

  it('shows nothing on an area that has no queue', () => {
    expect(badgeFor(ADMIN_AREAS.find((a) => a.href === '/admin/config')!, counts)).toBeNull();
  });

  it('caps the label so a wide number cannot stretch the nav', () => {
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
  });
});

describe('the one number in the banner', () => {
  it('is the real queues added up', () => {
    expect(outstanding({ review: 3, reports: 1, debug: 12, tags: 2, takedowns: 4, issues: 0 })).toBe(10);
  });

  // Debug uploads are kept files, not a queue. A badge that never reaches zero teaches people to
  // stop reading badges, which costs the two that mean something.
  it('leaves the debug uploads out', () => {
    expect(outstanding({ review: 0, reports: 0, debug: 40, tags: 0, takedowns: 0, issues: 0 })).toBe(0);
  });

  it('is zero when nothing could be counted', () => {
    expect(outstanding(EMPTY_COUNTS)).toBe(0);
  });
});
