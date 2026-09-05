// THE CREATOR'S VOCABULARY — a broad, curated selection, not a free text box.
//
// ============================================================================================
// WHY CURATED RATHER THAN FREEFORM. Free tags fragment on contact with real users: "scifi",
// "sci-fi", "science fiction" and "SF" become four dead-end filters that each find a quarter of
// the maps. A fixed list means a filter for `hard-sf` finds every hard-SF map, which is the entire
// point of having tags at all.
//
// THREE TIERS, and they must not be merged for FILTERING:
//   auto_tags   facts the hub COMPUTED from the file      (checked - `player-safe`, `built-up`)
//   tags        the creator's pick from this list         (declared - `fantasy`, `hard-sf`)
//   —           nothing freeform, deliberately
//
// A creator could otherwise type "player-safe" into a free field and appear in a filter that is
// supposed to mean the hub verified it.
// ============================================================================================
//
// THIS LIST IS A STARTING POINT AND IS THE OWNER'S TO EDIT. It ships as a default and is overridden
// by the `creator_vocabulary` config row, so it can be changed without a deploy - which it will be,
// once real maps show which categories people actually reach for.

export interface VocabGroup {
  label: string;
  hint: string;
  tags: string[];
}

// WIDENED 2026-09-04 at the owner's request: "most folks seem to be making versions of our solar
// system ... when you type earth you are going to get LOTS - so we need to quickly give the users
// tags to show why theirs is different - realism levels, functional universe, what-if scenarios,
// far past, far future, etc." The groups below are the axes on which one Earth differs from the
// next. The tags a creator picks show on the card and filter the browse page.
export const DEFAULT_VOCABULARY: VocabGroup[] = [
  {
    label: 'How real is it',
    hint: 'How closely this follows the universe as it actually is.',
    tags: ['real-astronomy', 'plausible', 'stylised', 'invented', 'fantasy']
  },
  {
    label: 'When',
    hint: 'Where on the clock it sits.',
    tags: ['far-past', 'ancient', 'present-day', 'near-future', 'far-future', 'deep-time']
  },
  {
    label: 'What if',
    hint: 'The premise that makes this version different.',
    tags: [
      'alternate-history', 'what-if', 'terraformed', 'colonised', 'abandoned', 'dead-earth',
      // No 'megastructures' or 'dyson-structures' here: those are COUNTED from the file and offered
      // as browse filters (facets.ts ROLE_PILLS), not something a creator claims.
      'alien-earth', 'first-contact', 'uplifted', 'ai-run', 'post-human'
    ]
  },
  {
    label: 'Physics',
    hint: 'Whether the usual rules apply.',
    // The owner's "physics class change" - a map that deliberately bends what SSE would otherwise
    // derive. See docs/decisions.md Q-07: this reading needs confirming.
    tags: ['standard-physics', 'altered-physics', 'exotic-objects', 'ftl', 'no-ftl', 'generation-ships']
  },
  {
    label: 'Universe',
    hint: 'What kind of setting it belongs to.',
    // "functional universe" is the owner's phrase: a lived-in, working setting rather than a scenario.
    tags: ['original-setting', 'functional-universe', 'shared-universe', 'homage', 'homebrew', 'conversion']
  },
  {
    label: 'Flavour',
    hint: 'What sort of story it is for.',
    tags: [
      'hard-sf', 'space-opera', 'cyberpunk', 'horror', 'exploration', 'military', 'trade',
      'mystery', 'political', 'survival', 'noir', 'post-apocalyptic'
    ]
  },
  {
    label: 'What it is for',
    hint: 'How you would use it at the table.',
    tags: ['campaign-ready', 'one-shot', 'sandbox', 'teaching', 'reference', 'starter']
  },
  {
    label: 'Scale',
    hint: 'How much of it there is.',
    tags: ['solar-system', 'single-star', 'binary', 'cluster', 'sector', 'deep-space']
  }
];

/** Flat set, for validating what a creator submitted. */
export function allowedTags(vocab: VocabGroup[] = DEFAULT_VOCABULARY): Set<string> {
  return new Set(vocab.flatMap((g) => g.tags));
}

/**
 * Keep only tags that are in the vocabulary.
 *
 * Anything else is dropped SILENTLY rather than rejected - a creator whose tag list came from an
 * older vocabulary should not be blocked from saving their description, and a tag nobody can filter
 * on is no loss.
 */
export function sanitiseTags(input: unknown, vocab: VocabGroup[] = DEFAULT_VOCABULARY): string[] {
  const allowed = allowedTags(vocab);
  const raw = Array.isArray(input)
    ? input
    : String(input ?? '').split(',');
  const out = raw
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => allowed.has(t));
  return [...new Set(out)].slice(0, 12);
}

/** Parse the `creator_vocabulary` config row, falling back to the default when it is unusable. */
export function vocabularyFrom(value: unknown): VocabGroup[] {
  if (!Array.isArray(value) || !value.length) return DEFAULT_VOCABULARY;
  const groups = value.filter(
    (g: any) => g && typeof g.label === 'string' && Array.isArray(g.tags)
  ) as VocabGroup[];
  return groups.length ? groups : DEFAULT_VOCABULARY;
}
