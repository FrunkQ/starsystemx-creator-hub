// WHAT AN EXPLORER IS CALLED (D-66). The rules for a handle, in one pure place.
//
// ============================================================================================
// Until today the hub had no sign-up at all - the owner asked *"how does a new user sign up?"* and
// the honest answer was: they cannot. An account existed only if somebody made the Supabase auth
// user by hand AND inserted the matching `creators` row by hand, which is why the sign-in page
// carries a message for the half-state where one exists without the other.
//
// So the handle rules were never written down, because nothing ever created one. They are here, and
// they are pure, because a handle is:
//
//   - PUBLIC. It appears under every map as "by <handle>" and at `/admin/explorers/<handle>`.
//   - PERMANENT in practice. `display_name` is what a person edits; the handle is the address.
//   - A URL SEGMENT. `/admin/explorers/<handle>` is a route, so a handle that needs escaping, or
//     that looks like `.` or `..`, is a route bug waiting to be found by somebody else.
//
// DELIBERATELY NARROW. Letters, digits, one separator, no leading or trailing separator, no runs.
// Unicode handles are a kindness that costs a confusable-name problem the hub has no way to police:
// a moderator looking at two visually identical handles cannot tell which one they banned.
// ============================================================================================

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/**
 * Names the hub needs for itself, or that would let somebody impersonate the place.
 *
 * The route ones are real: `/admin/explorers/admin` is not ambiguous today, but a handle that reads
 * as a section of the site is a phishing surface in every message that mentions it. The rest are
 * the usual suspects - a person calling themselves `support` is the oldest trick there is.
 */
export const RESERVED = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'staff', 'support', 'help', 'keeper',
  'starsystemx', 'sse', 'hub', 'explorers', 'explorer', 'system', 'root', 'owner',
  'api', 'account', 'login', 'logout', 'join', 'signup', 'upload', 'browse', 'terms',
  'takedown', 'debug', 'manage', 'asset', 'private', 'link', 'feed', 'sitemap', 'robots',
  // Every entry must be a handle that would OTHERWISE BE VALID, or reserving it does nothing.
  // `me` and `you` were here and are two characters long, which the length rule already
  // refuses - `tests/handles.test.ts` caught them sitting in the list doing nothing.
  'anonymous', 'deleted', 'null', 'undefined'
]);

/**
 * Tidy what somebody typed into the shape a handle takes, WITHOUT deciding whether it is allowed.
 *
 * Separating tidy from judge is the point: the form shows the tidied version back so a person can
 * see what they will actually be called, and `handleProblem` then says yes or no to that - rather
 * than the hub silently storing something different from what was on screen.
 */
export function cleanHandle(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    // Strip accents rather than refusing them: "Renée" should become "renee", not an error.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, HANDLE_MAX);
}

/**
 * Why this handle cannot be used, in words for the person who typed it - or null if it can.
 *
 * A SENTENCE, NOT A CODE. Every one of these is read by somebody who is trying to join and has just
 * been told no; "invalid handle" makes them guess, and guessing at a sign-up form is where people
 * give up. `already taken` is deliberately NOT in here - that needs the database, and this stays
 * pure so it can be tested and so the form and the server share one answer.
 */
export function handleProblem(handle: string): string | null {
  if (!handle) return 'Pick a name for yourself - letters and numbers.';
  if (handle.length < HANDLE_MIN) return 'A bit longer, please - at least ' + HANDLE_MIN + ' characters.';
  if (handle.length > HANDLE_MAX) return 'A bit shorter, please - ' + HANDLE_MAX + ' characters at most.';
  if (!/^[a-z0-9][a-z0-9-_]*[a-z0-9]$/.test(handle)) {
    return 'Letters and numbers, with - or _ in the middle. It cannot start or end with one.';
  }
  if (!/[a-z]/.test(handle)) return 'Put at least one letter in it.';
  if (RESERVED.has(handle)) return 'That one is kept for the hub itself. Pick another.';
  return null;
}

/**
 * A free variant of a taken handle, for the race the unique index catches.
 *
 * The check and the insert are two round trips, so two people can pass the check with the same name
 * a moment apart. It is vanishingly rare and it must not be a dead end at the last step of joining,
 * so the second person becomes `name-2`. The number is appended INSIDE the length cap, because a
 * suffix that pushed the handle over the limit would fail the same check it exists to satisfy.
 */
export function suffixed(handle: string, n: number): string {
  const tail = '-' + n;
  return handle.slice(0, HANDLE_MAX - tail.length).replace(/[-_]+$/, '') + tail;
}
