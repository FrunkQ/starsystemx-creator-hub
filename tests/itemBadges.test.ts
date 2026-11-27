// SP14: an item's badges, worked out from the item and never typed by its maker.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { v4Badges, v3Badges, ITEM_BADGES } from '../src/lib/itemBadges';
import { readV4 } from '../src/lib/v4/read';

const ids = (b: { id: string }[]) => b.map((x) => x.id);

describe('SSE4 item badges (SP14)', () => {
  it('a ship pack carrying a flow shows Constructs, Parts and Physics, physics as the warning', () => {
    const b = v4Badges({ kind: 'pack', pack_kinds: ['universe'], provides: { ship_designs: 3, parts: 12, flows: 1 }, requires: [] });
    expect(ids(b)).toEqual(['v4', 'constructs', 'parts', 'physics', 'free']);
    expect(b.filter((x) => x.warn).map((x) => x.id)).toEqual(['physics']);
  });
  it('a physics kind is Physics even with nothing listed', () => {
    expect(ids(v4Badges({ kind: 'pack', pack_kinds: ['physics'], provides: {} }))).toContain('physics');
  });
  it('a universe pack with nothing named is a Setting', () => {
    expect(ids(v4Badges({ kind: 'pack', pack_kinds: ['universe'], provides: { other_thing: 1 } }))).toEqual(['v4', 'setting', 'free']);
  });
  it('a campaign, fan-made, needing packs, off the shelf', () => {
    const b = v4Badges({ kind: 'campaign', fan_setting: 'Traveller', requires: [{}, {}], state: 'withdrawn' });
    expect(ids(b)).toEqual(['v4', 'campaign', 'fan', 'free', 'needs', 'withdrawn']);
    expect(b.find((x) => x.id === 'needs')?.words).toBe('Needs 2 packs');
  });
  it('fictional physics is marked', () => {
    expect(ids(v4Badges({ kind: 'pack', pack_kinds: ['physics'], fictional: true }))).toContain('fictional');
  });
  it('reads a real SSE4 pack fixture', () => {
    const read = readV4(readFileSync('tests/fixtures/v4/dressing-toy.json'), 50 * 1024 * 1024);
    expect(read.ok).toBe(true);
    if (!read.ok || read.item.kind !== 'pack') return;
    const b = v4Badges({ kind: 'pack', pack_kinds: read.item.kinds, provides: read.item.provides, requires: read.item.requires });
    expect(ids(b)[0]).toBe('v4');
    expect(ids(b)).toContain('free');
    expect(ids(b).length).toBeGreaterThan(2);
  });
});

describe('V3 map badges (SP14)', () => {
  it('every V3 map shows V3, Free and what it is', () => {
    expect(ids(v3Badges({ kind: 'starmap' }))).toEqual(['v3', 'campaign', 'free']);
    expect(ids(v3Badges({ kind: 'system', auto_tags: ['ships'], fan_setting: 'Elite' }))).toEqual(['v3', 'system', 'constructs', 'fan', 'free']);
  });
});

describe('the table', () => {
  it('every badge has words and a line, ids once', () => {
    expect(new Set(ITEM_BADGES.map((b) => b.id)).size).toBe(ITEM_BADGES.length);
    for (const b of ITEM_BADGES) { expect(b.words.split(' ').length).toBeLessThanOrEqual(2); expect(b.line.length).toBeGreaterThan(10); }
  });
  it('only Physics warns', () => {
    expect(ITEM_BADGES.filter((b) => b.warn).map((b) => b.id)).toEqual(['physics']);
  });
});
