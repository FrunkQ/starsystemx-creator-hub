// The licence suggestions (D-59), and the one thing that must stay true about them.
import { describe, it, expect } from 'vitest';
import { LICENCES, needsCredit } from '../src/lib/licences';
import { breachesCcBy, noProvenance } from '../src/lib/bundle/attribution';

const entry = (license: string, credit?: string) =>
  ({ path: 'x', kind: 'image' as const, usedBy: [], license, credit });

describe('the list', () => {
  it('offers something for the common answers', () => {
    for (const wanted of ['My own work', 'CC0 1.0 (public domain)', 'CC BY 4.0']) {
      expect(LICENCES).toContain(wanted);
    }
  });

  it('says the same thing once', () => {
    expect(LICENCES.length).toBe(new Set(LICENCES).size);
  });

  it('is a suggestion and not a validation - anything a person types is a licence', () => {
    // Nothing here checks membership, and nothing should: a licence the hub has not heard of is
    // somebody's real licence. This test exists so that stays deliberate.
    expect(noProvenance(entry('Bespoke terms from the artist'))).toBe(false);
  });
});

describe('the list agrees with the gate', () => {
  // A suggestion the gate then refuses, for a reason the creator cannot see, would be worse than
  // no suggestion at all. So: every CC-BY variant here needs a name, and nothing else does.
  it('every attribution licence it offers is one the gate asks a name for', () => {
    for (const l of LICENCES.filter(needsCredit)) {
      expect(breachesCcBy(entry(l)), l).toBe(true);
      expect(breachesCcBy(entry(l, 'Ada Lovelace')), l).toBe(false);
    }
  });

  it('and none of the others is refused for having nobody named', () => {
    for (const l of LICENCES.filter((x) => !needsCredit(x))) {
      expect(breachesCcBy(entry(l)), l).toBe(false);
    }
  });

  it('does not mistake CC0 for an attribution licence', () => {
    // The one that looks like it should trip and must not: CC0 asks for nothing.
    expect(needsCredit('CC0 1.0 (public domain)')).toBe(false);
    expect(breachesCcBy(entry('CC0 1.0 (public domain)'))).toBe(false);
  });

  it('catches the spellings a person types by hand', () => {
    for (const l of ['CC-BY 4.0', 'cc by-sa', 'Creative Commons CC BY']) expect(needsCredit(l), l).toBe(true);
  });
});
