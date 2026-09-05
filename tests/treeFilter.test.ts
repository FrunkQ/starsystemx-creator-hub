// Filtering the tree by what is in the map (src/lib/treeFilter.ts).
import { describe, it, expect } from 'vitest';
import { EMPTY_FILTER, isActive, matches, visibleIds, tagCounts, roleCounts, tagParts } from '../src/lib/treeFilter';

const node = (id: string, parent: string | null, role: string, tags: string[] = [], extra = {}) =>
  ({ node_id: id, parent_id: parent, name: id, role_hint: role, tags, ...extra });

const sol = node('sol', null, 'star');
const earth = node('earth', 'sol', 'planet', ['ocean=water', 'life'], { snippet: { description: 'x'.repeat(40) }, image_sha256: 'abc' });
const luna = node('luna', 'earth', 'moon', ['tidally-locked']);
const mars = node('mars', 'sol', 'planet', ['dust-storms=seasonal']);
const tycho = node('tycho', 'sol', 'station', [], { model_sha256: 'm' });
const nodes = [sol, earth, luna, mars, tycho];

describe('the filter', () => {
  it('is off when nothing is set', () => {
    expect(isActive(EMPTY_FILTER)).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, text: '  ' })).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, role: 'moon' })).toBe(true);
  });

  it('matches a role, every listed tag, and a word in a name or a tag', () => {
    expect(matches(luna, { ...EMPTY_FILTER, role: 'moon' })).toBe(true);
    expect(matches(earth, { ...EMPTY_FILTER, role: 'moon' })).toBe(false);
    expect(matches(earth, { ...EMPTY_FILTER, tags: ['ocean=water', 'life'] })).toBe(true);
    expect(matches(earth, { ...EMPTY_FILTER, tags: ['ocean=water', 'ice'] })).toBe(false);
    expect(matches(mars, { ...EMPTY_FILTER, text: 'MARS' })).toBe(true);
    expect(matches(mars, { ...EMPTY_FILTER, text: 'seasonal' })).toBe(true);
    expect(matches(mars, { ...EMPTY_FILTER, text: 'ocean' })).toBe(false);
  });

  it('knows what is described, pictured and modelled', () => {
    expect(matches(earth, { ...EMPTY_FILTER, described: true })).toBe(true);
    expect(matches(mars, { ...EMPTY_FILTER, described: true })).toBe(false);
    expect(matches(earth, { ...EMPTY_FILTER, pictured: true })).toBe(true);
    expect(matches(tycho, { ...EMPTY_FILTER, modelled: true })).toBe(true);
    expect(matches(earth, { ...EMPTY_FILTER, modelled: true })).toBe(false);
  });

  it('shows a match and the path down to it, nothing else', () => {
    const { matched, visible } = visibleIds(nodes, { ...EMPTY_FILTER, role: 'moon' });
    expect([...matched]).toEqual(['luna']);
    expect([...visible].sort()).toEqual(['earth', 'luna', 'sol']);
  });

  it('counts tags and roles for the chips, most common first', () => {
    expect(tagCounts([earth, mars, luna, node('x', null, 'planet', ['life'])])[0]).toEqual(['life', 2]);
    expect(roleCounts(nodes)).toEqual({ star: 1, planet: 2, moon: 1, station: 1 });
  });

  it('splits a tag for display', () => {
    expect(tagParts('ocean=water')).toEqual({ key: 'ocean', value: 'water' });
    expect(tagParts('science/impact-record')).toEqual({ key: 'impact-record', value: null });
    expect(tagParts('spin-orbit-resonance=3:2')).toEqual({ key: 'spin-orbit-resonance', value: '3:2' });
  });
});
