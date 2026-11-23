// SSE4 ON EXPLORERS (D-98): reading V4 campaigns and packs, and the migration that holds them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readV4, validPackId, shelfOf, providesLine, SEMVER, containsOf, containsSlug, cleanContains } from '../src/lib/v4/read';
import { packSlug, creditChain } from '../src/lib/server/v4';

const enc = (o: unknown) => new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o));
const MAX = 50 * 1024 * 1024;
// Real SSE4 pack fixtures, copied from star-system-explorer tests/fixtures/packs.
const dressing = readFileSync('tests/fixtures/v4/dressing-toy.json');
const base = readFileSync('tests/fixtures/v4/base-toy.json');

const campaign = {
  schema: 'sse.campaign-save/1', saved_at: '2026-11-22T10:00:00Z', title: 'Kestrel Reach', root: 'u:kestrel',
  state_hash: 'abc123',
  export: { format: 'sse.chronicle-export/1', root: 'u:kestrel', events: [{ kind: 'authored.set' }, { kind: 'authored.set' }],
    record: { notes: ['the GM secret'] }, record_head: 'r9' },
  workspace: { applied: {}, undo: [{ secret: 'undo' }], redo: [{ secret: 'redo' }], now_yr: 0 },
  stack: { added: [{ format: 'sse.pack/1', id: 'acme.ports', version: '1.2.0' }], campaign: null }
};

describe('reading a V4 pack', () => {
  it('reads a real SSE4 universe pack and serves its bytes untouched', () => {
    const r = readV4(new Uint8Array(dressing), MAX);
    expect(r.ok).toBe(true);
    if (!r.ok || r.item.kind !== 'pack') return;
    expect(r.item.packId).toBe('test.dressing-toy');
    expect(r.item.version).toBe('0.1.0');
    expect(r.item.provides.dressing_rules).toBeGreaterThan(0);
    expect(r.item.provides.templates).toBeGreaterThan(0);
    // THE BYTES ARE THE SAME BYTES: SSE4 hashes the pack itself.
    expect(Buffer.from(r.bytes).equals(dressing)).toBe(true);
    expect(shelfOf(r.item.kinds)).toBe('game-system');
    expect(shelfOf(['base-physics'])).toBe('physics');
    expect(shelfOf(['presentation'])).toBe('looks');
  });

  it('reads a real physics pack', () => {
    const r = readV4(new Uint8Array(base), MAX);
    expect(r.ok).toBe(true);
    if (r.ok && r.item.kind === 'pack') expect(r.item.provides.flows).toBeGreaterThan(0);
  });

  it('refuses a pack SSE4 would refuse, saying every reason', () => {
    const r = readV4(enc({ format: 'sse.pack/1', id: 'NoDots', version: '1.0', kind: ['warp'], licence: '' }), MAX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('bad-pack');
    expect(r.problems).toHaveLength(5); // id, version, kind, kernel range, licence
  });

  it('follows sse-pack on ids and semver on versions', () => {
    expect(validPackId('acme.ports')).toBe(true);
    expect(validPackId('acme.ports_2-x.more')).toBe(true);
    expect(validPackId('acme')).toBe(false);
    expect(validPackId('Acme.ports')).toBe(false);
    expect(validPackId('acme..ports')).toBe(false);
    expect(SEMVER.test('1.2.3')).toBe(true);
    expect(SEMVER.test('1.2.3-beta.1+b5')).toBe(true);
    expect(SEMVER.test('01.2.3')).toBe(false);
    expect(SEMVER.test('1.2')).toBe(false);
  });

  it('calls a pack of tags and nothing else a tag set', () => {
    const r = readV4(enc({ format: 'sse.pack/1', id: 'a.tags', version: '1.0.0', kind: ['universe'], kernel_range: '^0.1',
      licence: 'CC-BY-4.0', provides: { other: { tags: { groups: [{}, {}] } } } }), MAX);
    expect(r.ok && r.item.kind === 'pack' && r.item.kinds).toEqual(['universe', 'tag-set']);
  });

  it('says what it provides in words', () => {
    expect(providesLine({ lenses: 2, boxes: 1, dressing_rules: 1, templates: 3 })).toBe('3 templates, 1 dressing rule, 2 lenses, 1 box');
    expect(providesLine({ warp_gates: 2 })).toBe('2 warp gates');
  });
});

describe('reading a V4 campaign', () => {
  it('takes the GM record and undo history out, and keeps the rest', () => {
    const r = readV4(enc(campaign), MAX);
    expect(r.ok).toBe(true);
    if (!r.ok || r.item.kind !== 'campaign') return;
    expect(r.item).toMatchObject({ root: 'u:kestrel', stateHash: 'abc123', events: 2, stack: [{ id: 'acme.ports', version: '1.2.0' }] });
    const stored = new TextDecoder().decode(r.bytes);
    expect(stored).not.toContain('the GM secret');
    expect(stored).not.toContain('record_head');
    expect(stored).not.toContain('undo"},');
    const back = JSON.parse(stored);
    expect(back.export.events).toHaveLength(2);
    expect(back.state_hash).toBe('abc123');
    expect(back.workspace.undo).toEqual([]);
  });

  it('refuses a damaged save, a clip, a V3 save and junk, in words', () => {
    const broken = { ...campaign, export: { ...campaign.export, root: 'u:other' } };
    expect(readV4(enc(broken), MAX)).toMatchObject({ ok: false, code: 'bad-campaign' });
    expect(readV4(enc({ sseClip: 2, generation: 'v4' }), MAX)).toMatchObject({ ok: false, code: 'clip' });
    expect(readV4(enc({ bundleFormat: 1, systems: [] }), MAX)).toMatchObject({ ok: false, code: 'v3' });
    expect(readV4(enc('not json {'), MAX)).toMatchObject({ ok: false, code: 'not-json' });
    expect(readV4(new Uint8Array(), MAX)).toMatchObject({ ok: false, code: 'empty' });
    expect(readV4(enc(campaign), 10)).toMatchObject({ ok: false, code: 'too-big' });
  });
});

describe('addresses and credit', () => {
  it('gives a pack version its own address', () => {
    expect(packSlug('acme.ports', '1.2.0')).toBe('acme.ports-1.2.0');
    expect(packSlug('acme.ports', '1.2.0+Build')).toBe('acme.ports-1.2.0-build');
  });
  it('names the maker and the page in the credit chain', () => {
    expect(creditChain({ title: 'Ports', slug: 'acme.ports-1.2.0' }, { handle: 'ada', display_name: 'Ada' }, 'https://x.test'))
      .toEqual([{ name: 'Ada', handle: 'ada', title: 'Ports', url: 'https://x.test/v/acme.ports-1.2.0', site: 'Explorers' }]);
  });
});

describe('the V4 migration', () => {
  const sql = readFileSync('db/migrations/0044_v4_shelves.sql', 'utf8').replace(/--.*$/gm, '');
  it('only adds', () => {
    expect(sql).not.toMatch(/^\s*(drop|delete|update|truncate)\b/im);
    expect(sql).not.toMatch(/\b(drop (table|column|type)|delete from|truncate)\b/i);
    const created = [...sql.matchAll(/create table if not exists (\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(['v4_items', 'v4_reports']);
    for (const m of sql.matchAll(/alter table (\w+)/gi)) expect(created).toContain(m[1]);
    for (const t of created) expect(sql).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/create type/i);
  });
});

describe('opening in SSE4', () => {
  it('hands SSE4 the listing URL, encoded, on its one Open door', async () => {
    const { sse4OpenUrl } = await import('../src/lib/addresses');
    expect(sse4OpenUrl('https://explorers.starsystemx.com/api/v4/acme.ports-1.2.0'))
      .toBe('https://v4.starsystemx.com/?explorers=https%3A%2F%2Fexplorers.starsystemx.com%2Fapi%2Fv4%2Facme.ports-1.2.0');
  });
});

describe('the V4 file header reaches SSE4', () => {
  it('exposes x-sse-sha256 to cross-origin scripts (withCors spreads PUBLIC_CORS last, so it must be there)', async () => {
    const { withCors } = await import('../src/lib/server/cors');
    const h = withCors({ 'x-sse-sha256': 'abc' });
    expect(h['access-control-expose-headers']).toContain('x-sse-sha256');
    expect(h['access-control-expose-headers']).toContain('x-fan-work');
  });
});

describe('the "contains" filter, read from the pack itself (example-packs note, question 6)', () => {
  it('finds the small things that have no shelf of their own', () => {
    expect(containsOf({ units: [{}, {}], other: {
      calendar: { months: [] }, ship_styles: [{}, {}, {}], programs: [{}], sensors: [{}], overlays: [{}],
      views: [{}], names: { schemes: [] }, about: { title: 'x' }
    } })).toEqual({ unit_schemes: 2, calendars: 1, ship_styles: 3, programs: 1, sensors: 1, overlays: 1, view_styles: 1, name_schemes: 1 });
  });
  it('folds synonyms and the weather and life families, and keeps a key it has never heard of', () => {
    expect(containsSlug('tags')).toBe('tag_groups');
    expect(containsSlug('weather_zonal')).toBe('weather');
    expect(containsSlug('life_budget')).toBe('life');
    expect(containsSlug('Warp Gates')).toBe('warp_gates');
    expect(containsSlug('about')).toBeNull();
    expect(containsOf({ other: { weather_zonal: {a: 1}, weather_giants: {a: 1}, dressing: { rules: [{}, {}] } } }))
      .toEqual({ weather: 1, dressing_rules: 2 });
  });
  it('takes only a safe slug from a query string, because it goes into a database filter', () => {
    expect(cleanContains('ship_styles')).toBe('ship_styles');
    expect(cleanContains('a,b')).toBeNull();
    expect(cleanContains('x)or(')).toBeNull();
    expect(cleanContains(null)).toBeNull();
  });
});
