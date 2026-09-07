// WHAT AN EXPLORER MAY BE CALLED (D-66).
//
// A handle is public, permanent in practice, and a URL segment - so these rules are load-bearing in
// three different ways and none of them is obvious from looking at the form.
import { describe, it, expect } from 'vitest';
import { cleanHandle, handleProblem, suffixed, RESERVED, HANDLE_MAX, HANDLE_MIN } from '../src/lib/handles';

const ok = (h: string) => handleProblem(cleanHandle(h)) === null;

describe('cleanHandle', () => {
  it('folds case, because a handle is an address and addresses are not case-sensitive', () => {
    expect(cleanHandle('FrunkQ')).toBe('frunkq');
  });

  it('strips accents rather than refusing them', () => {
    // "Renée" should become a usable handle, not an error message at the sign-up form.
    expect(cleanHandle('Renée')).toBe('renee');
    expect(cleanHandle('Jörg')).toBe('jorg');
  });

  it('turns spaces and punctuation into a single separator', () => {
    expect(cleanHandle('the star keeper')).toBe('the-star-keeper');
    expect(cleanHandle('a...b')).toBe('a-b');
    expect(cleanHandle('a   b')).toBe('a-b');
  });

  it('never leaves a leading or trailing separator', () => {
    expect(cleanHandle('  -nomad-  ')).toBe('nomad');
    expect(cleanHandle('!!nomad!!')).toBe('nomad');
  });

  it('caps the length, so the tidied name is never longer than the rule allows', () => {
    expect(cleanHandle('x'.repeat(200)).length).toBe(HANDLE_MAX);
  });

  it('gives an empty string for something with nothing usable in it', () => {
    expect(cleanHandle('!!!')).toBe('');
    expect(cleanHandle(null)).toBe('');
    expect(cleanHandle(undefined)).toBe('');
  });
});

describe('handleProblem', () => {
  it('accepts the ordinary shapes', () => {
    for (const h of ['nomad', 'frunkq', 'star-keeper', 'a_b_c', 'x99', 'the-42nd']) {
      expect(handleProblem(h), h).toBeNull();
    }
  });

  it('refuses one that is empty, too short or too long', () => {
    expect(handleProblem('')).toMatch(/Pick a name/);
    expect(handleProblem('a'.repeat(HANDLE_MIN - 1))).toMatch(/longer/);
    expect(handleProblem('a'.repeat(HANDLE_MAX + 1))).toMatch(/shorter/);
  });

  it('refuses a handle that starts or ends with a separator', () => {
    // These are the ones that read badly in a sentence and worse in a URL.
    expect(handleProblem('-nomad')).not.toBeNull();
    expect(handleProblem('nomad-')).not.toBeNull();
    expect(handleProblem('_nomad')).not.toBeNull();
  });

  it('refuses anything that is not letters, digits and a middle separator', () => {
    for (const h of ['no mad', 'no.mad', 'no/mad', 'nomad!', 'no@mad', 'nom%ad']) {
      expect(handleProblem(h), h).not.toBeNull();
    }
  });

  it('refuses a handle made only of digits', () => {
    // `/admin/explorers/2024` reads as a year, an id, or a page number - anything but a person.
    expect(handleProblem('2024')).toMatch(/at least one letter/);
  });

  it('keeps the names the hub needs for itself', () => {
    // A person called `support` or `admin` is the oldest trick there is, and a handle that reads as
    // a section of the site is a phishing surface in every message that mentions it.
    for (const h of ['admin', 'moderator', 'support', 'keeper', 'starsystemx', 'sse', 'login']) {
      expect(handleProblem(h), h).toMatch(/kept for the hub/);
    }
  });

  it('every reserved word is itself a valid handle, or reserving it does nothing', () => {
    // If a reserved word could never pass the other rules, listing it is decoration. This catches a
    // typo in the list - an entry with a space or a capital would silently protect nothing.
    for (const word of RESERVED) {
      expect(cleanHandle(word), word).toBe(word);
      expect(word.length, word).toBeGreaterThanOrEqual(HANDLE_MIN);
    }
  });

  it('says something a person can act on, every time', () => {
    // Every one of these is read by somebody who is trying to join and has just been told no.
    //
    // NOTE WHAT IS *NOT* IN THIS LIST, because the first draft got it wrong and the test said so:
    // `no mad` and a 40-character name are NOT failures - tidying turns them into `no-mad` and a
    // 24-character name, which is the whole point of tidying. Only what survives tidying and is
    // still wrong belongs here.
    for (const bad of ['', 'ab', '-no', '2024', 'admin', '!!!']) {
      const message = handleProblem(cleanHandle(bad) || bad);
      expect(message, bad).toBeTruthy();
      expect(message!.length, bad).toBeGreaterThan(15);
    }
  });

  it('tidying RESCUES what it can, rather than refusing it', () => {
    // The other half of the rule above, said out loud so nobody "fixes" it back.
    expect(handleProblem(cleanHandle('no mad'))).toBeNull();
    expect(handleProblem(cleanHandle('x'.repeat(40)))).toBeNull();
  });
});

describe('cleaning then judging', () => {
  it('accepts what a person is likely to type, once tidied', () => {
    for (const typed of ['FrunkQ', 'The Star Keeper', 'Renée', '  nomad  ']) {
      expect(ok(typed), typed).toBe(true);
    }
  });

  it('still refuses what tidying cannot rescue', () => {
    for (const typed of ['!!!', '42', 'ADMIN', 'a']) {
      expect(ok(typed), typed).toBe(false);
    }
  });
});

describe('suffixed', () => {
  it('appends the number', () => {
    expect(suffixed('nomad', 2)).toBe('nomad-2');
  });

  it('stays inside the length cap, or the suffix fails the rule it exists to satisfy', () => {
    const long = 'a'.repeat(HANDLE_MAX);
    const out = suffixed(long, 2);
    expect(out.length).toBeLessThanOrEqual(HANDLE_MAX);
    expect(handleProblem(out)).toBeNull();
  });

  it('never produces a double separator when it trims', () => {
    expect(suffixed('star-keeper-x'.padEnd(HANDLE_MAX, 'y').slice(0, HANDLE_MAX - 2) + '-a', 3))
      .not.toMatch(/--/);
    expect(handleProblem(suffixed('ab-', 2))).toBeNull();
  });

  it('produces a handle that passes the rules for every number it might use', () => {
    for (let n = 2; n <= 6; n++) {
      expect(handleProblem(suffixed('nomad', n)), String(n)).toBeNull();
      expect(handleProblem(suffixed('a'.repeat(HANDLE_MAX), n)), String(n)).toBeNull();
    }
  });
});
