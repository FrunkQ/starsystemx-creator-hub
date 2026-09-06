// FAN WORK: SAYING SO, EVERYWHERE, IN ONE VOICE (D-61).
//
// ============================================================================================
// The owner, 2026-09-06: *"people are going to be putting together their fave sci-fi universe -
// we need to ensure everyone knows this is fan made content and no liability of ownership is made
// by the user or SSE."*
//
// He is right about what is coming. The Game system tag group already ships `star-trek-adventures`,
// `warhammer-40k`, `dune-rpg` and `star-wars-rpg`, so the hub has effectively invited people to
// build somebody else's universe - and a starmap of the Alpha Quadrant with no notice on it looks,
// to a rights holder skimming a page, exactly like somebody claiming it.
//
// TWO LAYERS, and the difference between them matters:
//
//   1. THE BLANKET. Every map page, the footer, and every download says the same thing whether or
//      not anybody filled a field in. It has to be unconditional, because the notice that protects
//      you is the one on the page nobody remembered to tag.
//
//   2. THE NAME. When a creator says which setting it is, the notice NAMES it - "an unofficial fan
//      work based on Star Trek" - and that is a categorically stronger statement than a generic
//      one. It is specific, it disclaims affiliation with the people who actually own it, and it
//      reads as somebody being careful rather than somebody covering themselves.
//
// WHY THE WORDS LIVE HERE AND NOT IN THE PAGES: the same reason as `attestation.ts`. The notice is
// shown on the map page, written into the download, and quoted in the terms. Three copies would
// drift on the first wording change, and the version stamped on a creator's answer would stop
// matching what they were shown.
//
// WHAT THIS IS NOT: a licence to host anything. It does not make an infringing upload lawful and it
// does not replace the takedown route - it makes the hub's position legible, which is the part a
// notice can actually do. The terms carry the rest.
//
// FAIR DEALING / FAIR USE IS NOT CLAIMED HERE and deliberately not mentioned: whether a given map
// qualifies is a question about that map in that country, and a hub asserting it on everybody's
// behalf would be making a legal claim it cannot stand behind.
// ============================================================================================

/**
 * Bumped when the wording changes. Stored with a creator's answer the same way
 * `ATTESTATION_TEXT_VERSION` is, so an old record still says what was actually on the screen.
 */
export const FAN_WORK_TEXT_VERSION = 1;

/** How long a setting name may be. A name, not an essay - the notice has to read as a sentence. */
export const SETTING_MAX = 60;

/**
 * The settings a starmap is plausibly OF. Offered, never required, and never validated against -
 * the same rule as `licences.ts`: a setting the hub has not heard of is somebody's real setting.
 *
 * These are other people's trademarks, listed so that a creator can DISCLAIM them accurately. That
 * is the whole reason they appear anywhere in this codebase.
 */
export const SETTINGS: string[] = [
  'Star Trek',
  'Star Wars',
  'Dune',
  'The Expanse',
  'Warhammer 40,000',
  'Battletech',
  'Babylon 5',
  'Firefly',
  'Stargate',
  'Halo',
  'Mass Effect',
  'Alien',
  'Foundation',
  'Elite: Dangerous',
  'EVE Online',
  'Traveller (Third Imperium)',
  'Cowboy Bebop',
  'The Culture',
  'Doctor Who',
  'Red Dwarf',
  'Blake’s 7',
  'Revelation Space',
  'Honorverse',
  'Hyperion',
  'Known Space',
  'Warhammer 40,000: Rogue Trader',
  '2001: A Space Odyssey',
  'Starship Troopers',
  'Andor / Rogue One',
  'Star Blazers / Space Battleship Yamato'
];

/**
 * Tidy a typed setting name. Trims, collapses runs of whitespace, and caps the length.
 *
 * IT DOES NOT TITLE-CASE OR SPELL-CORRECT. "star trek" and "Star Trek" are both the creator saying
 * the same true thing, and a hub that quietly rewrote somebody's answer would be editing a legal
 * declaration on their behalf. Empty comes back as null, because "not answered" and "my own
 * universe" are the same absence and both mean the blanket notice stands on its own.
 */
export function cleanSetting(raw: unknown): string | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SETTING_MAX);
  return text || null;
}

/** The badge. Short enough for a card, and it says the two words that matter. */
export const FAN_WORK_BADGE = 'Unofficial fan work';

/**
 * The notice itself, in one or two sentences.
 *
 * `setting` null gives the blanket wording - true of every map here, including entirely original
 * ones, because the sentence is about what the HUB is rather than about what the map contains.
 */
export function fanWorkNotice(setting?: string | null): string {
  const name = cleanSetting(setting);
  if (!name) {
    return 'Maps on this hub are made by their creators and shared as fan work. Where a map draws '
      + 'on an existing universe, that universe belongs to whoever owns it - not to the person who '
      + 'made the map, and not to Star System Explorer. No affiliation or endorsement is claimed.';
  }
  return 'This is an unofficial fan work based on ' + name + '. It is not made, endorsed or '
    + 'approved by the owners of ' + name + ', and no ownership of ' + name + ' is claimed by the '
    + 'person who made this map or by Star System Explorer. All trademarks and copyrights in '
    + name + ' belong to their respective owners.';
}

/**
 * What the creator ticks when they upload, added to the attestation in version 2.
 *
 * PHRASED AS SOMETHING THEY ARE DOING, not as something being done to them. "I am sharing this as
 * fan work" is a statement a person can mean; "I acknowledge that..." is a form being filled in,
 * and people click those without reading them.
 */
export const FAN_WORK_ATTESTATION =
  'If this map draws on somebody else’s universe, I am sharing it as unofficial fan work and I '
  + 'claim no ownership of that universe.';

/** The line for the footer of every page. Short, because it is on every page. */
export const FAN_WORK_FOOTER =
  'Fan-made. Universes referenced here belong to their owners; no affiliation or endorsement is claimed.';

/**
 * The block written into a download, so the notice travels with the file rather than living only on
 * a web page the reader may never have seen.
 *
 * PLAIN TEXT WITH HARD WRAPS, because it lands in README.txt beside the engine's own writing.
 */
export function fanWorkFileNotice(setting?: string | null): string {
  const lines = [
    '--',
    FAN_WORK_BADGE.toUpperCase(),
    '',
    ...wrap(fanWorkNotice(setting), 78),
    '',
    ...wrap(
      'This file was shared by its creator through the Star System Explorer hub. If you own '
      + 'rights in something used here, the hub has a route for that - see the Report a copyright '
      + 'problem link on the site.',
      78
    )
  ];
  return lines.join('\n');
}

/** Hard-wrap at a column. Long words are left long rather than broken - a URL must stay clickable. */
function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > cols) { out.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The notice, safe to put in an HTTP header.
 *
 * A HEADER VALUE IS BYTES, not text. A setting typed as "Blake’s 7" or "L’Empire" carries characters
 * outside Latin-1, and handing one to `new Response(..., { headers })` throws - which would turn a
 * courtesy notice into a download that 500s for exactly the creators most likely to have named
 * their setting carefully. Curly quotes become straight ones, everything else outside printable
 * ASCII is dropped, and runs of space collapse.
 */
export function fanWorkHeader(setting?: string | null): string {
  return fanWorkNotice(setting)
    // The typographic pairs a word processor produces, folded to their ASCII equivalents first, so
    // the sentence still reads properly rather than losing its punctuation to the sweep below.
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    // Everything left outside printable ASCII goes, control characters included - a newline in a
    // header value is not a mangled notice, it is header injection.
    .replace(/[^ -~]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}
