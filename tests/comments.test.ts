// Comments: the rules in src/lib/comments.ts, and the one number the code and the database must
// agree on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanComment, removalRole, commentNotice, COMMENT_MAX } from '../src/lib/comments';

describe('what a comment becomes', () => {
  it('normalises line endings, strips control characters and trailing space, caps blank lines', () => {
    expect(cleanComment('hello \r\n\r\n\r\n\r\nworld  ')).toBe('hello\n\nworld');
  });

  it('is nothing when nothing was said', () => {
    expect(cleanComment('   \n\t ')).toBeNull();
    expect(cleanComment('')).toBeNull();
    expect(cleanComment(null)).toBeNull();
    expect(cleanComment(42)).toBeNull();
  });

  it('keeps what people wrote, tabs and all', () => {
    expect(cleanComment('a\tb\nc')).toBe('a\tb\nc');
  });

  it('does not cut - the caller says "too long" instead', () => {
    const long = 'x'.repeat(COMMENT_MAX + 5);
    expect(cleanComment(long)?.length).toBe(COMMENT_MAX + 5);
  });
});

describe('who may remove a comment', () => {
  const c = { creator_id: 'author' };

  it('its author, before any other claim', () => {
    expect(removalRole({ id: 'author', role: 'admin' }, c, 'owner')).toBe('author');
  });
  it('the cartographer whose map it sits under', () => {
    expect(removalRole({ id: 'owner', role: 'user' }, c, 'owner')).toBe('cartographer');
  });
  it('an admin', () => {
    expect(removalRole({ id: 'someone', role: 'admin' }, c, 'owner')).toBe('admin');
  });
  it('nobody else', () => {
    expect(removalRole({ id: 'someone', role: 'user' }, c, 'owner')).toBeNull();
    expect(removalRole(null, c, 'owner')).toBeNull();
    expect(removalRole(undefined, c, 'owner')).toBeNull();
  });
});

describe('the limit the code and the database agree on', () => {
  it('matches the check constraint in migration 0021', () => {
    const sql = readFileSync('db/migrations/0021_comments.sql', 'utf8');
    const m = /char_length\(body\) between 1 and (\d+)/.exec(sql);
    expect(Number(m?.[1])).toBe(COMMENT_MAX);
  });

  it('is the number the "too long" notice quotes', () => {
    expect(commentNotice('long')).toContain(COMMENT_MAX.toLocaleString('en-GB'));
  });

  it('has no notice for a code nobody sent', () => {
    expect(commentNotice(null)).toBeNull();
    expect(commentNotice('nonsense')).toBeNull();
  });
});
