// WHAT THE FAN-WORK NOTICE PROMISES (D-61).
//
// This is the hub's public position on other people's universes, written once and shown in five
// places. The tests that matter here are not about wording - they are about the notice being
// UNCONDITIONAL, about the named form actually naming what it disclaims, and about a creator's own
// text never being able to break the page or the header it lands in.
import { describe, it, expect } from 'vitest';
import {
  FAN_WORK_BADGE, FAN_WORK_FOOTER, FAN_WORK_ATTESTATION, SETTINGS, SETTING_MAX,
  cleanSetting, fanWorkNotice, fanWorkFileNotice, fanWorkHeader
} from '../src/lib/fanWork';
import { ATTESTATION_TEXT, ATTESTATION_TEXT_VERSION } from '../src/lib/attestation';

describe('cleanSetting', () => {
  it('gives null for every shape of "they did not answer"', () => {
    // Null and "my own universe" are the same absence, and both mean the blanket notice stands.
    for (const empty of [undefined, null, '', '   ', '\n\t ']) {
      expect(cleanSetting(empty)).toBeNull();
    }
  });

  it('tidies whitespace without touching the words', () => {
    expect(cleanSetting('  Star   Trek \n')).toBe('Star Trek');
  });

  it('does NOT correct the creator', () => {
    // A hub that title-cased somebody's declaration would be editing it on their behalf.
    expect(cleanSetting('star trek')).toBe('star trek');
    expect(cleanSetting('WARHAMMER 40,000')).toBe('WARHAMMER 40,000');
  });

  it('caps the length, because the notice has to read as a sentence', () => {
    expect(cleanSetting('x'.repeat(500))!.length).toBe(SETTING_MAX);
  });
});

describe('fanWorkNotice', () => {
  it('says something true when nobody named a setting', () => {
    // THE POINT OF THE BLANKET: the map that needs the notice most is the one where the field was
    // left empty, so an empty answer must never produce an empty notice.
    const blanket = fanWorkNotice(null);
    expect(blanket.length).toBeGreaterThan(80);
    expect(blanket).toMatch(/belongs to whoever owns it/);
    expect(blanket).toMatch(/Star System Explorer/);
    expect(blanket).toMatch(/No affiliation or endorsement is claimed/);
  });

  it('names the setting, three times, when there is one', () => {
    const notice = fanWorkNotice('Star Trek');
    expect(notice).toMatch(/unofficial fan work based on Star Trek/);
    // The three things a rights holder would want said: not endorsed, not owned, still theirs.
    expect(notice).toMatch(/not made, endorsed or approved by the owners of Star Trek/);
    expect(notice).toMatch(/no ownership of Star Trek is claimed/);
    expect(notice).toMatch(/trademarks and copyrights in Star Trek belong to their respective owners/);
  });

  it('disclaims on behalf of BOTH the creator and the hub', () => {
    // The owner's words: "no liability of ownership is made by the user or SSE." Both halves.
    for (const setting of [null, 'Dune']) {
      const notice = fanWorkNotice(setting);
      expect(notice).toMatch(/Star System Explorer/);
      expect(notice).toMatch(/person who made (the|this) map/);
    }
  });

  it('claims no fair-use finding, deliberately', () => {
    // Whether a given map qualifies is a question about that map in that country. A hub asserting
    // it on everybody's behalf would be making a legal claim it cannot stand behind.
    for (const setting of [null, 'The Expanse']) {
      expect(fanWorkNotice(setting)).not.toMatch(/fair (use|dealing)/i);
    }
  });

  it('treats a whitespace-only setting as no setting at all', () => {
    expect(fanWorkNotice('   ')).toBe(fanWorkNotice(null));
  });
});

describe('the notice that travels in the file', () => {
  it('carries the badge and the notice, and never a line long enough to wrap badly', () => {
    const text = fanWorkFileNotice('Warhammer 40,000');
    expect(text).toContain(FAN_WORK_BADGE.toUpperCase());
    expect(text).toMatch(/Warhammer 40,000/);
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
  });

  it('is written even when nothing was named', () => {
    expect(fanWorkFileNotice(null)).toContain(FAN_WORK_BADGE.toUpperCase());
  });

  it('points at the way to complain', () => {
    // A notice with no route attached is a shrug. This one says where to go.
    expect(fanWorkFileNotice(null)).toMatch(/copyright/i);
  });
});

describe('the header form', () => {
  it('is pure printable ASCII whatever the creator typed', () => {
    // A header value is bytes. A curly apostrophe or an accent thrown at `new Response` throws,
    // which would turn a courtesy notice into a download that 500s.
    for (const setting of [null, 'Blake’s 7', 'L’Empire Étoilé', '星际迷航']) {
      const header = fanWorkHeader(setting);
      expect(header).toMatch(/^[\x20-\x7e]*$/);
      expect(header.length).toBeGreaterThan(80);
    }
  });

  it('keeps the punctuation readable rather than dropping it', () => {
    expect(fanWorkHeader('Blake’s 7')).toContain("Blake's 7");
  });

  it('cannot be used to inject a second header', () => {
    // THE ONE GENUINELY DANGEROUS INPUT is a line break: that is what ends a header and starts the
    // next one. The words either side of it are harmless - "x-admin: yes" sitting inside a sentence
    // is a silly setting name, not a header - so this asserts the break is gone and nothing more.
    // `cleanSetting` takes the CR and LF out first; `fanWorkHeader` is the belt to that braces.
    const header = fanWorkHeader(cleanSetting('Dune\r\nx-admin: yes'));
    expect(header).not.toMatch(/[\r\n]/);
    expect(fanWorkHeader('Dune\r\nx-admin: yes')).not.toMatch(/[\r\n]/);
  });
});

describe('where the wording is shown', () => {
  it('the attestation carries the fan-work sentence', () => {
    // If these ever come apart, a creator ticks a box that does not say what the hub relies on.
    expect(ATTESTATION_TEXT).toContain(FAN_WORK_ATTESTATION);
  });

  it('the attestation version was bumped when the wording changed', () => {
    // The version is stored WITH each answer. Changing the text without bumping this makes every
    // older record claim words its creator never saw.
    expect(ATTESTATION_TEXT_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('the footer line is short enough to live on every page', () => {
    expect(FAN_WORK_FOOTER.length).toBeLessThan(140);
    expect(FAN_WORK_FOOTER).toMatch(/belong to their owners/);
  });
});

describe('the suggestion list', () => {
  it('has no duplicates - it is a datalist, and a repeat looks like a bug', () => {
    expect(new Set(SETTINGS).size).toBe(SETTINGS.length);
  });

  it('holds only names short enough to be accepted by the field they feed', () => {
    for (const name of SETTINGS) expect(cleanSetting(name)).toBe(name);
  });
});
