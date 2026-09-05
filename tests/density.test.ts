// Information density: src/lib/bundle/density.ts. Coverage times length, weighted by what the
// object is; the level relative to the best on the hub.
import { describe, it, expect } from 'vitest';
import {
  informationDensity, densityLevel, densitySummary, FULL_DESCRIPTION
} from '../src/lib/bundle/density';

const para = 'x'.repeat(FULL_DESCRIPTION);
const doc = (nodes: unknown[]) => ({ nodes });
let n = 0;
const body = (roleHint: string, description?: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'n' + n++, kind: 'body', roleHint, description, ...extra });

describe('information density', () => {
  it('is zero with nothing written', () => {
    expect(informationDensity(doc([body('planet'), body('star')])).raw).toBe(0);
  });

  it('is one when every object that counts has a full paragraph', () => {
    const d = informationDensity(doc([body('planet', para), body('star', para)]));
    expect(d.raw).toBe(1);
    expect(d.described).toBe(2);
    expect(d.total).toBe(2);
    expect(d.avgLength).toBe(FULL_DESCRIPTION);
  });

  it('is coverage times length: half the objects, or half a paragraph, is a half', () => {
    expect(informationDensity(doc([body('planet', para), body('planet')])).raw).toBe(0.5);
    expect(informationDensity(doc([body('planet', 'x'.repeat(FULL_DESCRIPTION / 2))])).raw).toBe(0.5);
  });

  it('gives nothing extra for a novel', () => {
    expect(informationDensity(doc([body('planet', 'x'.repeat(FULL_DESCRIPTION * 4))])).raw).toBe(1);
  });

  it('ignores small objects and barycentres, and counts a moon at half', () => {
    const rock = body('planet', undefined, { massKg: 1e18 });
    const bary = { id: 'b', kind: 'barycenter', roleHint: 'barycenter' };
    expect(informationDensity(doc([body('planet', para), rock, bary])).raw).toBe(1);
    // A described planet and an undescribed moon: 1 / (1 + 0.5).
    expect(informationDensity(doc([body('planet', para), body('moon')])).raw).toBe(0.667);
    expect(informationDensity(doc([body('planet', para), rock, bary])).total).toBe(1);
  });

  it('a placeholder is not a description', () => {
    expect(informationDensity(doc([body('planet', 'TODO')])).raw).toBe(0);
    expect(informationDensity(doc([body('planet', '   -   ')])).described).toBe(0);
  });

  it('reads only the public description - GM notes are withheld from players', () => {
    expect(informationDensity(doc([{ id: 'g', kind: 'body', roleHint: 'planet', gmNotes: para }])).raw).toBe(0);
  });

  it('a station counts in full', () => {
    expect(informationDensity(doc([{ id: 's', kind: 'construct', roleHint: 'station', description: para }])).raw).toBe(1);
  });
});

describe('the level', () => {
  it('is 0 for nothing, 5 for the best, and a fifth of the best is a 1', () => {
    expect(densityLevel(0, 0.8)).toBe(0);
    expect(densityLevel(0.8, 0.8)).toBe(5);
    expect(densityLevel(0.16, 0.8)).toBe(1);
    expect(densityLevel(0.17, 0.8)).toBe(2);
    expect(densityLevel(0.5, 0.8)).toBe(4);
  });

  it('is absolute when no best is known', () => {
    expect(densityLevel(0.5, null)).toBe(3);
    expect(densityLevel(1, null)).toBe(5);
  });

  it('never exceeds 5 when a map beats the recorded best', () => {
    expect(densityLevel(0.9, 0.8)).toBe(5);
  });

  it('says it in words', () => {
    expect(densitySummary(3, { raw: 0.5, total: 40, described: 24, avgLength: 140 }))
      .toBe('Information 3 of 5: 24 of 40 objects described, about 140 characters each.');
    expect(densitySummary(0, { raw: 0, total: 9, described: 0, avgLength: 0 })).toContain('none of its 9 objects');
    expect(densitySummary(0, null)).toContain('nothing here');
  });
});
