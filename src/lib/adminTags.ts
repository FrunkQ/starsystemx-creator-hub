// TAGS ONLY THE ADMIN MAY GIVE (owner, 2026-09-11; D-91).
//
// ============================================================================================
// "Only the admin may set the `default` tag. It marks the maps that replace Star System Explorer's
// shipped examples, so it must be stripped or refused when anyone else puts it on a map (upload and
// edit alike) - tag= now matches cartographer tags, so this is the only thing keeping other maps off
// the app's starter list."
//
// ONE DOOR IN, AND EVERY OTHER DOOR GUARDED BOTH WAYS. The admin's switch on a map's page is the only
// thing that adds or removes one of these. Everywhere else a tag can reach a map - an upload's own
// tags, the manage page's boxes, a tag proposal, a reviewer accepting or merging one - strips it if it
// is being ADDED and keeps it if the map ALREADY HAS it. The second half matters as much as the
// first: a creator re-uploading their map, or ticking a different box, must not quietly take a map
// off the starter list the admin put it on.
// ============================================================================================

/** The tags only the admin's switch may put on a map. */
export const ADMIN_TAGS: readonly string[] = ['default'];

/** The starter-list tag, by name, for the switch that sets it. */
export const STARTER_TAG = 'default';

/** At most this many tags on a map from any ordinary door (vocabulary.ts, normalise.ts). */
export const TAG_LIMIT = 12;

/** Is this one of them? Case and spaces do not get a tag past the guard. */
export const isAdminTag = (tag: unknown): boolean =>
  typeof tag === 'string' && ADMIN_TAGS.includes(tag.trim().toLowerCase());

/**
 * The tags a map ends up with through any door but the admin's switch.
 *
 * What was asked for, without any admin tag in it - plus whichever admin tags the map already
 * carries. The admin tags go last and are never the ones the limit cuts.
 */
export function keepAdminTags(asked: readonly string[], current: readonly string[] | null | undefined): string[] {
  const kept = [...new Set((current ?? []).filter(isAdminTag))];
  const plain = [...new Set(asked.filter((t) => !isAdminTag(t)))];
  return [...plain.slice(0, Math.max(0, TAG_LIMIT - kept.length)), ...kept];
}

/** The admin's switch: this tag on, or off, and everything else exactly as it was. */
export function withAdminTag(current: readonly string[] | null | undefined, tag: string, on: boolean): string[] {
  const rest = (current ?? []).filter((t) => t !== tag);
  return on ? [...rest, tag] : rest;
}
