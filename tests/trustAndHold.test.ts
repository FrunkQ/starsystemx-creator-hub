// TRUST AND HOLD (D-78, D-79). What the migration promises, pinned.
//
// Both of these are mostly SQL and mostly judgement, so the tests are on the two things a later
// change could quietly undo: the reordering that makes trust safe, and the fact that a held map
// stays downloadable.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { describeAction, isModeratorAction } from '../src/lib/auditLog';

const sql = readFileSync('db/migrations/0039_trusted_and_hold.sql', 'utf8');

describe('trust is a reordering, not a bypass (D-78)', () => {
  it('is a column on creators, not a role', () => {
    // A trusted explorer is not staff: no ability to see or judge anybody else's content. Folding
    // it into creator_role would have made it a rank, and collided with moderator on the first
    // person who was both.
    expect(sql).toMatch(/alter table public\.creators add column if not exists trusted boolean/);
    expect(sql).not.toMatch(/creator_role add value/);
  });

  it('marks what went out on trust, which is what keeps it in the queue', () => {
    // "They will still appear on my review list (as pre-approved)" is the half of the owner's
    // sentence that makes the rest acceptable, and it needs a column: without it, a pre-approved
    // picture is indistinguishable from one the hub drew itself.
    expect(sql).toMatch(/assets add column if not exists approved_on_trust boolean/);
  });

  it('the roomier allowance is a config row, as asked', () => {
    const config = readFileSync('src/lib/server/config.ts', 'utf8');
    expect(config).toContain('trusted_uploads_per_user_per_day');
  });

  it('the explorer page loads the flag its checkbox shows (D-82)', () => {
    // THE FAULT THIS PINS: the load never returned `trusted`, so the box always opened unticked and
    // pressing Save to add a note to a trusted explorer quietly untrusted them. A form that shows a
    // default instead of the truth rewrites the truth the moment somebody submits it.
    const page = readFileSync('src/routes/admin/explorers/[handle]/+page.server.ts', 'utf8');
    expect(page).toMatch(/trusted: person\.trusted/);
    // And the list, which has its own box now.
    const list = readFileSync('src/routes/admin/explorers/+page.server.ts', 'utf8');
    expect(list).toMatch(/select\('[^']*\btrusted\b/);
  });

  it('is set in one place, whichever page it is set from (D-82)', () => {
    // Two pages offer it. If either wrote the column itself, the audit line and the not-on-yourself
    // rule would each be one page's to remember.
    const writers = globSync('src/routes/**/*.ts')
      .filter((f) => /update\(\{\s*trusted\b/.test(readFileSync(f, 'utf8')));
    expect(writers).toEqual([]);
    for (const f of ['src/routes/admin/explorers/+page.server.ts', 'src/routes/admin/explorers/[handle]/+page.server.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('accounts.setTrusted(');
    }
    const accounts = readFileSync('src/lib/server/accounts.ts', 'utf8');
    expect(accounts).toMatch(/actorId === creatorId\) throw/);
  });

  it('a flagged upload is never auto-approved', () => {
    // Trust says "this person does not upload rubbish"; the flag says "this upload looks like the
    // pattern we watch for". The second is about the upload and outranks the first, or trust
    // becomes a way to launder exactly what the flag exists to catch.
    const ledger = readFileSync('src/lib/server/ledger.ts', 'utf8');
    expect(ledger).toContain('trusted && !flagged');
  });
});

describe('a held map stays downloadable (D-79)', () => {
  it('is a flag, not a state', () => {
    // `state` is about PERMISSION - may this be seen. A hold is about CONFIDENCE - does this work.
    // Folding them together would mean a taken-down map could not also be flagged as broken, and
    // restoring one would silently clear the other.
    expect(sql).toMatch(/systems add column if not exists hold_note text/);
    expect(sql).not.toMatch(/system_state add value/);
  });

  it('the download route still serves it, and carries the note into the file', () => {
    // THE OWNER'S WHOLE POINT: "allow peeps to download it with a warning". A file nobody can fetch
    // is a file nobody can diagnose. So the route must NOT gain a hold check.
    const route = readFileSync('src/routes/api/download/[slug]/+server.ts', 'utf8');
    expect(route).toContain('hold_note');
    expect(route).not.toMatch(/held_at.*throw|throw.*hold_note/);

    // And the note reaches the README, because most people who need the warning never see the page.
    expect(readFileSync('src/lib/server/pack.ts', 'utf8')).toContain('THIS MAP IS ON HOLD');
  });
});

describe('the audit log can read the new actions', () => {
  it('says them in words, in the right groups', () => {
    // Trust is about a PERSON, so Accounts. A hold is a judgement about CONTENT, so Moderation.
    expect(describeAction('creator.trust').group).toBe('Accounts');
    expect(describeAction('system.hold').group).toBe('Moderation');
    for (const a of ['creator.trust', 'creator.untrust', 'system.hold', 'system.unhold']) {
      expect(describeAction(a).verb, a).not.toContain('.');
      expect(isModeratorAction(a), a).toBe(true);
    }
  });
});
