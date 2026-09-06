// Custom tags (D-40): what a creator can propose, and what a reviewer is shown instead.
//
// The similarity tests are the ones that matter. The vocabulary is curated because free tags
// fragment, and the "+" is the door fragmenting comes through - so every duplicate this catches is
// a filter that keeps working, and every one it misses is a dead-end tag for ever.
import { describe, it, expect } from 'vitest';
import { toSlug, similarity, similarTags, readable, TAG_MAX } from '../src/lib/tagProposals';
import { mergeAccepted } from '../src/lib/server/tags';
import { DEFAULT_VOCABULARY, allowedTags } from '../src/lib/vocabulary';

describe('what a creator can propose', () => {
  it('makes a tag out of what a person actually types', () => {
    expect(toSlug('Stars Without Number')).toBe('stars-without-number');
    expect(toSlug('  Mothership  ')).toBe('mothership');
    expect(toSlug('Blades & Whispers')).toBe('blades-and-whispers');
    expect(toSlug('sci--fi')).toBe('sci-fi');
    expect(toSlug('-edge-')).toBe('edge');
  });

  it('folds accents, so one word cannot become two tags', () => {
    expect(toSlug('Córiolis')).toBe('coriolis');
  });

  it('refuses what is not a tag', () => {
    expect(toSlug('')).toBeNull();
    expect(toSlug('a')).toBeNull();
    expect(toSlug('!!!')).toBeNull();
    expect(toSlug('2000')).toBeNull(); // a number is not a description of a map
    expect(toSlug('x'.repeat(TAG_MAX + 1))).toBeNull();
  });

  it('reads back as words', () => {
    expect(readable('forged-in-the-dark')).toBe('forged in the dark');
  });
});

describe('finding the tag they meant', () => {
  it('catches a typing mistake', () => {
    expect(similarity('travellar', 'traveller')).toBeGreaterThan(0.8);
  });

  it('catches the longer form', () => {
    expect(similarity('hard-sf-setting', 'hard-sf')).toBeGreaterThan(0.4);
  });

  it('catches a reordering, which edit distance alone does not', () => {
    // This is why the three signals are maxed rather than averaged.
    expect(similarity('number-stars-without', 'stars-without-number')).toBeGreaterThan(0.9);
  });

  it('does not think two different tags are the same one', () => {
    expect(similarity('mothership', 'traveller')).toBeLessThan(0.4);
    expect(similarity('horror', 'trade')).toBeLessThan(0.5);
  });

  it('offers the near ones, best first, and never the word itself', () => {
    const near = similarTags('cyber-punk', DEFAULT_VOCABULARY);
    expect(near.map((s) => s.tag)).toContain('cyberpunk');
    expect(near.map((s) => s.tag)).not.toContain('cyber-punk');
    expect(near[0].score).toBeGreaterThanOrEqual(near[near.length - 1].score);
  });

  it('catches the near-miss that is a word apart', () => {
    expect(similarTags('post-apocalypse', DEFAULT_VOCABULARY).map((s) => s.tag)).toContain('post-apocalyptic');
  });

  // MEASURED, AND THE LIMIT IS WORTH KNOWING: a synonym that shares no letters is not a string
  // problem and no string match will find it. "sci-fi" does not suggest "hard-sf". That is the
  // reviewer's job, and the reason a person sees every word at all.
  it('does not pretend to catch a synonym', () => {
    expect(similarTags('sci-fi', DEFAULT_VOCABULARY).map((s) => s.tag)).not.toContain('hard-sf');
  });

  it('finds the plural and the near-miss of a real shipped tag', () => {
    // The exact failure the fuzzy match exists for: a creator types the game system with an s.
    expect(similarTags('mothership-rpg', DEFAULT_VOCABULARY).map((s) => s.tag)).toContain('mothership');
    expect(similarTags('travellers', DEFAULT_VOCABULARY).map((s) => s.tag)).toContain('traveller');
  });

  it('says nothing when the word is genuinely new', () => {
    expect(similarTags('kelp-forests', DEFAULT_VOCABULARY)).toHaveLength(0);
  });
});

describe('the vocabulary itself', () => {
  it('has no duplicate tag anywhere, which would make one filter two pills', () => {
    const all = DEFAULT_VOCABULARY.flatMap((g) => g.tags);
    expect(all.length).toBe(new Set(all).size);
  });

  it('carries the game systems the owner asked for, open options first', () => {
    const group = DEFAULT_VOCABULARY.find((g) => g.label === 'Game system')!;
    expect(group.tags[0]).toBe('system-agnostic');
    for (const t of ['traveller', 'mothership', 'stars-without-number', 'dnd-5e', 'the-expanse']) {
      expect(group.tags).toContain(t);
    }
  });

  it('keeps every tag to the slug rules, so a shipped tag and a proposed one cannot differ in kind', () => {
    for (const tag of allowedTags()) expect(toSlug(tag)).toBe(tag);
  });
});

describe('an accepted tag joins the list', () => {
  it('lands in its own group and is pickable at once', () => {
    const merged = mergeAccepted(DEFAULT_VOCABULARY, [{ tag: 'coriolis-third-horizon', group_label: 'Game system' }]);
    expect(merged.find((g) => g.label === 'Game system')!.tags).toContain('coriolis-third-horizon');
    expect(allowedTags(merged).has('coriolis-third-horizon')).toBe(true);
  });

  it('never duplicates one that is already there', () => {
    const merged = mergeAccepted(DEFAULT_VOCABULARY, [{ tag: 'traveller', group_label: 'Game system' }]);
    const tags = merged.find((g) => g.label === 'Game system')!.tags;
    expect(tags.filter((t) => t === 'traveller')).toHaveLength(1);
  });

  it('keeps a tag whose group has since gone, rather than dropping it off somebody\'s map', () => {
    const merged = mergeAccepted(DEFAULT_VOCABULARY, [{ tag: 'orbital-blues', group_label: 'Retired group' }]);
    expect(merged.find((g) => g.label === 'Retired group')!.tags).toEqual(['orbital-blues']);
  });

  it('changes nothing when there is nothing accepted', () => {
    expect(mergeAccepted(DEFAULT_VOCABULARY, [])).toBe(DEFAULT_VOCABULARY);
  });
});
