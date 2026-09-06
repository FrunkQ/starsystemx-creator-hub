// The log's reading of a row (D-42). The rows have existed since migration 0001; these are the
// rules that turn one into a sentence.
import { describe, it, expect } from 'vitest';
import { describeAction, parseTarget, isModeratorAction, shortId, ACTION_GROUPS } from '../src/lib/auditLog';

describe('what an action says', () => {
  it('reads as a verb phrase that follows a name', () => {
    expect(describeAction('creator.banned').verb).toBe('banned');
    expect(describeAction('asset.approve').verb).toBe('approved a picture');
    expect(describeAction('comments.remove-all').verb).toBe('removed every comment by');
  });

  it('never leaves a slug unread, however new it is', () => {
    // A later session adds an action and forgets this file. It must still render as words.
    expect(describeAction('something.brand-new').verb).toBe('something brand new');
    expect(describeAction('patreon.charge').verb).toBe('Patreon: charge');
  });

  it('puts every action in a group the filter offers', () => {
    for (const a of ['creator.banned', 'tag.merge', 'config.set', 'asset.ban', 'wat.wat']) {
      expect(ACTION_GROUPS).toContain(describeAction(a).group);
    }
  });
});

describe('what it was done to', () => {
  it('reads the prefix the action wrote', () => {
    expect(parseTarget('creator.banned', 'creator:abc')).toEqual({ kind: 'creator', id: 'abc' });
    expect(parseTarget('system.takedown', 'system:xyz')).toEqual({ kind: 'system', id: 'xyz' });
    expect(parseTarget('asset.ban', 'sha256:deadbeef')).toEqual({ kind: 'asset', id: 'deadbeef' });
    expect(parseTarget('config.set', 'config:zips_allowed')).toEqual({ kind: 'config', id: 'zips_allowed' });
    expect(parseTarget('tag.accept', 'tag:traveller')).toEqual({ kind: 'tag', id: 'traveller' });
  });

  // A comment's target is a BARE id, so the kind comes from the action. Inferring from the action
  // rather than guessing at the shape of a uuid is the difference between right and usually right.
  it('takes the kind from the action when the target carries no prefix', () => {
    expect(parseTarget('comment.remove', '0f8b-uuid')).toEqual({ kind: 'comment', id: '0f8b-uuid' });
    expect(parseTarget('system.publish', '0f8b-uuid')).toEqual({ kind: 'system', id: '0f8b-uuid' });
  });

  it('says "unknown" rather than inventing a kind', () => {
    expect(parseTarget('mystery.thing', 'whatever').kind).toBe('unknown');
  });

  it('does not mistake a colon inside a value for a prefix it knows', () => {
    expect(parseTarget('mystery.thing', 'weird:value')).toEqual({ kind: 'unknown', id: 'weird:value' });
  });
});

describe('the owner\'s actual question: what can a moderator do', () => {
  it('counts the moderation, tag and account work', () => {
    for (const a of ['asset.ban', 'comment.remove', 'report.dismiss', 'tag.merge', 'creator.banned', 'system.takedown']) {
      expect(isModeratorAction(a), a).toBe(true);
    }
  });

  it('does not count running the place', () => {
    for (const a of ['config.set', 'backup.write', 'debug.upload.delete', 'shipped.refresh']) {
      expect(isModeratorAction(a), a).toBe(false);
    }
  });
});

describe('ids in a table', () => {
  it('shortens what is too long to read and leaves what is not', () => {
    expect(shortId('short')).toBe('short');
    expect(shortId('0123456789abcdef0123')).toBe('01234567…');
  });
});
