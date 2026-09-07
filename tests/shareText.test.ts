// WHAT THE DISCORD POST SAYS (D-70).
//
// The stakes are higher than they look: Discord REFUSES an embed whose description is over 4096
// characters, so getting the truncation wrong does not produce an ugly post - it produces no post
// at all, and the maps it would silently drop are the ones with the most written about them.
import { describe, it, expect } from 'vitest';
import { shareBody, excerpt, DISCORD_DESCRIPTION_MAX } from '../src/lib/shareText';

describe('shareBody', () => {
  it('puts the hook first and the write-up after it', () => {
    const out = shareBody('A dying binary.', 'Three habitable moons and a lot of secrets.');
    expect(out).toBe('A dying binary.\n\nThree habitable moons and a lot of secrets.');
  });

  it('carries the write-up when there is no hook', () => {
    expect(shareBody(null, 'Just the write-up.')).toBe('Just the write-up.');
    expect(shareBody('', 'Just the write-up.')).toBe('Just the write-up.');
  });

  it('carries the hook when there is no write-up - the old behaviour, unbroken', () => {
    expect(shareBody('A dying binary.', null)).toBe('A dying binary.');
  });

  it('does not print the same words twice', () => {
    // Common: a creator pastes their blurb as the opening line of the description, or fills both
    // boxes with the same sentence. Printing it twice reads as a bug in the hub.
    expect(shareBody('Same words.', 'Same words.')).toBe('Same words.');
    expect(shareBody('A dying binary.', 'A dying binary. And three moons.'))
      .toBe('A dying binary. And three moons.');
  });

  it('says something true rather than nothing when a map has neither', () => {
    // An empty embed body reads as broken.
    expect(shareBody(null, null)).toContain('Free to download');
    expect(shareBody('   ', '  ')).toContain('Free to download');
  });

  it('NEVER exceeds the limit, whatever it is handed', () => {
    // THE ONE THAT MATTERS. Over the cap, Discord refuses the post and the map is not announced.
    const huge = 'word '.repeat(4000);
    expect(shareBody('A hook.', huge).length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_MAX);
    expect(shareBody(huge, huge).length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_MAX);
    expect(shareBody(null, 'x'.repeat(9000)).length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_MAX);
  });

  it('uses the room it has, rather than cutting to the first sentence', () => {
    // A truncation that only kept 30% of the allowance would be safe and useless.
    const long = 'A sentence about a star. '.repeat(500);
    expect(shareBody(null, long).length).toBeGreaterThan(DISCORD_DESCRIPTION_MAX * 0.8);
  });
});

describe('excerpt', () => {
  it('leaves anything that already fits completely alone', () => {
    expect(excerpt('Short.', 100)).toBe('Short.');
  });

  it('breaks at a paragraph when there is one late enough', () => {
    const text = 'First para.\n\n' + 'x'.repeat(40) + '\n\n' + 'y'.repeat(80);
    const out = excerpt(text, 70);
    expect(out).toMatch(/…$/);
    expect(out).not.toContain('y');
  });

  it('breaks at a sentence when there is no paragraph', () => {
    const text = 'One sentence here. Another sentence here. A third one that will not fit.';
    const out = excerpt(text, 45);
    expect(out.length).toBeLessThanOrEqual(45);
    // It ends on a full stop and an ellipsis, not halfway through a word.
    expect(out).toMatch(/\.\s…$/);
  });

  it('breaks at a word when there is neither', () => {
    const out = excerpt('alpha beta gamma delta epsilon zeta eta theta', 26);
    expect(out.length).toBeLessThanOrEqual(26);
    expect(out).toMatch(/…$/);
    // Whatever it kept, it kept whole words.
    for (const word of out.replace(/\s*…$/, '').split(' ')) {
      expect('alpha beta gamma delta epsilon zeta eta theta'.split(' ')).toContain(word);
    }
  });

  it('still obeys the limit when there is nothing to break on at all', () => {
    // One enormous word. Mid-word is the last resort and it must still not overflow.
    const out = excerpt('x'.repeat(500), 50);
    expect(out.length).toBeLessThanOrEqual(50);
  });
});
