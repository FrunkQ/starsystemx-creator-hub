// WHAT A DISCORD POST SAYS ABOUT A MAP (D-70).
//
// ============================================================================================
// The owner, 2026-09-07: *"when posting to discord it should post the whole description too - to
// give users background on what was published."*
//
// It used to post the BLURB - the one line a creator writes as a hook - and nothing else. That is
// the right thing on a card in a grid, where a reader is scanning twenty of them. It is the wrong
// thing in a channel where one map arrives at a time and the whole point of the post is that
// somebody decides whether to download it without leaving Discord.
//
// BOTH, IN THAT ORDER. The blurb is the pitch and the description is the background, so the pitch
// goes first and the background follows it. A description alone would drop the line the creator
// wrote specifically to make somebody look.
//
// DISCORD'S EMBED DESCRIPTION IS CAPPED AT 4096 CHARACTERS and the hub's description field allows
// 8000, so this WILL truncate on a long write-up. Two things follow from that, and both are the
// reason this is a tested pure function rather than three lines inline:
//
//   * A post that exceeds the cap is REFUSED by Discord entirely - the map does not get announced
//     at all. Silently posting nothing because somebody wrote a good long description would be a
//     perverse way to punish the maps most worth announcing.
//   * Cutting mid-word looks like a bug. Cutting at a paragraph, then a sentence, then a word - in
//     that order of preference - looks like an excerpt, which is what it is.
// ============================================================================================

/**
 * Discord's own limit on an embed's description. The whole embed is capped at 6000 across every
 * field, so this leaves room for the title, the two fields and the footer without arithmetic.
 */
export const DISCORD_DESCRIPTION_MAX = 4096;

/** What is left for the text once the "there is more" line is allowed for. */
const MORE = '…';

/**
 * Cut `text` to at most `limit` characters, preferring a clean break.
 *
 * Tries a paragraph end, then a sentence end, then a word boundary, and only slices mid-word if the
 * text has none of those in the last third - which in practice means a single enormous word.
 */
export function excerpt(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;

  const room = limit - MORE.length;
  const head = clean.slice(0, room);
  // Only accept a break in the last third, or a long paragraph-less write-up would be cut to its
  // first sentence and most of the room would go unused.
  const floor = Math.floor(room * 0.66);

  const para = head.lastIndexOf('\n\n');
  if (para > floor) return clean.slice(0, para).trimEnd() + '\n\n' + MORE;

  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence > floor) return clean.slice(0, sentence + 1).trimEnd() + ' ' + MORE;

  const word = head.lastIndexOf(' ');
  if (word > floor) return clean.slice(0, word).trimEnd() + ' ' + MORE;

  return head.trimEnd() + MORE;
}

/**
 * The body of the announcement: the creator's hook, then their write-up, inside Discord's limit.
 *
 * Falls back to a sentence about the hub when a map has neither - a post with an empty body reads
 * as broken, and "free to download" is at least true and useful.
 */
export function shareBody(
  blurb: string | null | undefined,
  description: string | null | undefined,
  limit: number = DISCORD_DESCRIPTION_MAX
): string {
  const hook = (blurb ?? '').trim();
  const background = (description ?? '').trim();

  // NOT REPEATED. A creator who wrote the same words in both boxes - or whose blurb is the opening
  // line of their description, which is common - should not have them printed twice.
  const both = !background || background === hook || background.startsWith(hook)
    ? (background || hook)
    : hook
      ? hook + '\n\n' + background
      : background;

  if (!both) return 'Free to download. Opens in Star System Explorer.';
  return excerpt(both, limit);
}
