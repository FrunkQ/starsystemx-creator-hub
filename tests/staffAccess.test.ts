// WHO COUNTS AS STAFF, checked where it is easy to get wrong (D-75).
//
// ============================================================================================
// The moderator role arrived in D-39 and `isStaff` was written for it. But a codebase does not
// re-read itself: `viewer.role !== 'admin'` was already written in several places, and every one of
// those quietly meant "not a moderator either".
//
// The owner found the worst of them: *"Moderator review: moderators can't see images."* The private
// asset route - the ONE route that serves an unreviewed picture, and therefore the only way to see
// anything in the review queue - said `admin`. So the role created to review pictures could open
// the queue and see nothing in it.
//
// This scans for the comparison rather than testing the route, because the route needs a Worker
// environment and the mistake is textual: a file that says `role !== 'admin'` has decided who staff
// are on its own, and that decision belongs in `auth.ts`.
// ============================================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { isStaff, isAdmin } from '../src/lib/server/auth';

/** Routes that are ADMIN ONLY by decision (D-39: "running the place = just admin"). */
const ADMIN_ONLY = [
  'admin/config', 'admin/backup', 'admin/debug', 'admin/stats', 'admin/log',
  // Draining the outbox is running the place, not judging content.
  'api/admin/outbox'
];

/** The banner reads the role to COLOUR it, which is not an access decision. */
const NOT_AN_ACCESS_CHECK = ['routes/+layout.svelte'];

const slash = (p: string) => p.split('\\').join('/');
const files = globSync('src/routes/**/*.{ts,svelte}').map(slash);

describe('the helpers themselves', () => {
  it('a moderator is staff and is not an admin', () => {
    expect(isStaff({ role: 'moderator' })).toBe(true);
    expect(isAdmin({ role: 'moderator' })).toBe(false);
  });

  it('an admin is both', () => {
    expect(isStaff({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'admin' })).toBe(true);
  });

  it('an ordinary explorer and nobody at all are neither', () => {
    for (const v of [{ role: 'user' }, null, undefined]) {
      expect(isStaff(v as never), String(v)).toBe(false);
      expect(isAdmin(v as never), String(v)).toBe(false);
    }
  });
});

describe('nothing decides who staff are on its own', () => {
  it('the private asset route lets a MODERATOR see an unreviewed picture', () => {
    // THE ONE THAT BIT. It is the only route that serves an unreviewed asset, so it is the only way
    // to see anything in the review queue - and it said `admin` for days after the role that
    // reviews pictures existed.
    const source = readFileSync('src/routes/private/asset/[hash]/+server.ts', 'utf8');
    expect(source).toContain('isStaff');
    expect(source).not.toContain("role !== 'admin'");
  });

  it('no staff-facing route hard-codes the comparison', () => {
    const bad: string[] = [];
    for (const file of files) {
      if (ADMIN_ONLY.some((a) => file.includes(a))) continue;
      if (NOT_AN_ACCESS_CHECK.some((a) => file.endsWith(a))) continue;
      if (readFileSync(file, 'utf8').includes("role !== 'admin'")) bad.push(file);
    }
    expect(bad, 'these decide who staff are instead of asking auth.ts - a moderator is silently '
      + 'excluded, which is how the review queue came to show a moderator no pictures').toEqual([]);
  });

  it('the scan would notice - it is looking at real files with real guards in them', () => {
    // Without this the two tests above pass on an empty list and say nothing.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => readFileSync(f, 'utf8').includes('isStaff'))).toBe(true);
  });
});
