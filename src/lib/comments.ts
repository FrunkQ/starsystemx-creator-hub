// Comments: the rules, with no database in them, so they can be tested.
//
// A comment is a registered explorer saying something under a map (owner, 2026-09-05). The count
// accumulates on the map like stars. What is NOT here, deliberately: threads, replies, editing,
// reactions, notifications. Each is a product decision the owner has not made.

/** Matches the check constraint in db/migrations/0021 - tests/comments.test.ts pins the two. */
export const COMMENT_MAX = 2000;

/** More than a person writes in an hour and fewer than a script does. */
export const COMMENTS_PER_HOUR = 20;

/**
 * What a submitted comment becomes: line endings normalised, control characters gone, trailing
 * space per line gone, runs of blank lines capped at one, trimmed. Null when nothing is left.
 * Length is NOT enforced here - the caller says "too long" rather than silently cutting.
 */
export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s || null;
}

export type RemovalRole = 'author' | 'cartographer' | 'admin';

/**
 * Who may remove a comment: its author; the cartographer whose map it sits under (their page,
 * their call); an admin. The first claim that fits is the one recorded as `removed_reason`.
 */
export function removalRole(
  viewer: { id: string; role: string } | null | undefined,
  comment: { creator_id: string },
  mapCreatorId: string
): RemovalRole | null {
  if (!viewer) return null;
  if (viewer.id === comment.creator_id) return 'author';
  if (viewer.id === mapCreatorId) return 'cartographer';
  if (viewer.role === 'admin') return 'admin';
  return null;
}

/** The one-line status the page shows after a comment form round-trips (api/comment redirects). */
export function commentNotice(code: string | null): string | null {
  switch (code) {
    case 'posted': return 'Your comment is posted.';
    case 'removed': return 'Comment removed.';
    case 'empty': return 'Write something first.';
    case 'long': return 'Comments are limited to ' + COMMENT_MAX.toLocaleString('en-GB') + ' characters.';
    case 'slow': return 'That is a lot of comments in one hour. Take a break and try again later.';
    case 'failed': return 'Your comment could not be saved. Try again in a moment.';
    case 'off': return 'Comments are not switched on yet.';
    default: return null;
  }
}
