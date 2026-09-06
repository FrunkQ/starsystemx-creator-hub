// CUSTOM TAGS: turning what somebody typed into a tag, and finding the one they meant (D-40).
//
// ============================================================================================
// The owner, 2026-09-06: *"all yah categories should have the option of adding custom tags. With a
// +. But I will always review and on review page similar named tags (fuzzy search) can be shown
// next time it and be swapped in on a click instead. Otherwise accepting it makes it a tag for
// everyone to use."*
//
// WHY THE FUZZY MATCH IS THE IMPORTANT HALF, and not the typing. The vocabulary exists because free
// text fragments: "scifi", "sci-fi", "science fiction" and "SF" become four dead-end filters that
// each find a quarter of the maps (see `vocabulary.ts`). A "+" is exactly the door that fragmenting
// comes through - so the review page's job is not to say yes or no, it is to say **"did you mean
// this one?"** and make taking the existing tag one click, which is easier than accepting the new
// one. The path of least resistance has to point at the word that already exists.
//
// Everything here is PURE and tested: the slug rules decide what a creator can even propose, and
// the similarity decides what a reviewer is shown. Both are wrong in ways that only show up on real
// words, which is why they are cheap to run over a real list in a test.
// ============================================================================================

/** The longest a tag may be. Long enough for `forged-in-the-dark`, short enough to fit a pill. */
export const TAG_MAX = 32;
export const TAG_MIN = 2;

/**
 * What a creator typed, as a tag - or null when it cannot be one.
 *
 * Deliberately narrow: lowercase, letters, digits and single hyphens. Accents are folded rather
 * than dropped so `coriolis` and `córiolis` cannot become two tags. Anything with nothing left
 * after that is not a tag, and `--` and leading or trailing hyphens are tidied rather than refused,
 * because a person typing "Stars Without Number " meant a tag and made a typing mistake.
 */
export function toSlug(input: unknown): string | null {
  const raw = String(input ?? '')
    // NFKD then drop the combining marks, so `córiolis` folds onto `coriolis` rather than becoming
    // a second tag for the same thing. `\p{M}` rather than a literal range: combining characters in
    // source are invisible and an editor that normalises the file would silently delete them.
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (raw.length < TAG_MIN || raw.length > TAG_MAX) return null;
  // A tag that is only digits is a number, not a description of a map.
  if (/^[0-9-]+$/.test(raw)) return null;
  return raw;
}

/** How a tag reads in a sentence: `stars-without-number` -> `stars without number`. */
export const readable = (tag: string): string => tag.replace(/-/g, ' ');

/**
 * How close two tags are, 0 to 1.
 *
 * Three signals, because one is not enough on real words:
 *   - EDIT DISTANCE catches typing: `travellar` against `traveller`.
 *   - CONTAINMENT catches the longer form: `hard-sf-setting` against `hard-sf`.
 *   - SHARED WORDS catch the reordering and the extra word: `number-stars-without` and
 *     `stars-without-numbers` both find `stars-without-number`, which edit distance alone does not.
 *
 * The maximum of the three is used rather than an average: each one is evidence on its own, and
 * averaging lets two silent signals bury the one that spotted it.
 *
 * WHAT IT CANNOT DO, said plainly because the review page depends on it: a SYNONYM that shares no
 * letters is not a string problem. `sci-fi` will not suggest `hard-sf`. That is the reviewer's
 * judgement, and the reason a person looks at every word rather than a threshold deciding.
 */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y) return 1;

  const edit = 1 - distance(x, y) / Math.max(x.length, y.length);

  const contains = x.includes(y) || y.includes(x)
    ? Math.min(x.length, y.length) / Math.max(x.length, y.length)
    : 0;

  const wx = new Set(x.split('-').filter(Boolean));
  const wy = new Set(y.split('-').filter(Boolean));
  const shared = [...wx].filter((w) => wy.has(w)).length;
  const words = shared ? shared / Math.max(wx.size, wy.size) : 0;

  return Math.max(edit, contains, words);
}

/** Levenshtein, two rows at a time. The lists this runs over are hundreds of tags, not millions. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let row = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

export interface Similar {
  tag: string;
  group: string;
  score: number;
}

/**
 * The existing tags a reviewer should be offered instead, best first.
 *
 * THE THRESHOLD IS LOW ON PURPOSE (0.5). A false suggestion costs a reviewer one glance; a missed
 * one costs the library a duplicate tag for ever, and duplicates are the whole reason the
 * vocabulary is curated. `limit` keeps the row readable.
 */
export function similarTags(
  tag: string,
  vocabulary: { label: string; tags: string[] }[],
  opts: { threshold?: number; limit?: number } = {}
): Similar[] {
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 6;
  const out: Similar[] = [];
  for (const group of vocabulary) {
    for (const existing of group.tags) {
      if (existing === tag) continue;
      const score = similarity(tag, existing);
      if (score >= threshold) out.push({ tag: existing, group: group.label, score });
    }
  }
  return out
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
