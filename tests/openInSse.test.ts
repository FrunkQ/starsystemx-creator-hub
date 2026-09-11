// The one-click links into the app (src/lib/openInSse.ts): "Open in Star System Explorer" for a
// campaign, "Add System to SSE" for a single system (D-92, R-18) - each on its own prefix, nothing
// until a prefix exists, and nothing for a map whose kind is not known.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sseLink, openLink, ssePrefixes, NO_PREFIXES } from '../src/lib/openInSse';
import { GATE_FALLBACKS } from '../src/lib/server/config';

const PROD = 'https://starsystemx.com/?open=';
const BETA = 'https://beta.starsystemx.com/?open=';
const BOTH = { open: PROD, addSystem: BETA };

describe('open a campaign, add a system', () => {
  it('is nothing until the engine can receive a URL', () => {
    expect(sseLink(NO_PREFIXES, 'https://x.test', 'sol', 'starmap')).toBeNull();
    expect(sseLink({ open: '', addSystem: '' }, 'https://x.test', 'sol', 'system')).toBeNull();
  });

  it('a campaign opens, on the campaign prefix, with the download URL encoded', () => {
    expect(sseLink(BOTH, 'https://x.test', 'local-neighbourhood', 'starmap')).toEqual({
      href: PROD + 'https%3A%2F%2Fx.test%2Fapi%2Fdownload%2Flocal-neighbourhood',
      label: 'Open in Star System Explorer',
      short: 'Open in SSE',
      title: 'Open this map in Star System Explorer, in a new tab'
    });
  });

  it('a single system is ADDED - the owner\'s words - on its own prefix', () => {
    // The engine's beta takes a system through `?open=` and offers to place it (R-18); production
    // still refuses one, which is the whole reason the prefixes are separate.
    const link = sseLink(BOTH, 'https://x.test', 'sol', 'system')!;
    expect(link.label).toBe('Add System to SSE');
    expect(link.href).toBe(BETA + 'https%3A%2F%2Fx.test%2Fapi%2Fdownload%2Fsol');
  });

  it('a system never borrows the campaign prefix, and "off" really is off for systems only', () => {
    expect(sseLink({ open: PROD, addSystem: 'off' }, 'https://x.test', 'sol', 'system')).toBeNull();
    expect(sseLink({ open: PROD, addSystem: 'off' }, 'https://x.test', 'lh', 'starmap')?.href).toContain(PROD);
  });

  it('is nothing when the kind is not known - fail closed, never a dead end', () => {
    expect(sseLink(BOTH, 'https://x.test', 'sol', null)).toBeNull();
    expect(sseLink(BOTH, 'https://x.test', 'sol', undefined)).toBeNull();
    expect(openLink(BOTH, 'https://x.test', 'sol', 'nebula')).toBeNull();
  });
});

describe('the config rows are addresses, or they are off', () => {
  it('refuses a prefix that is not an http(s) URL', () => {
    for (const bad of ['off', 'beta.starsystemx.com/?open=', '   ']) {
      expect(sseLink({ open: bad, addSystem: bad }, 'https://x.test', 'sol', 'starmap'), bad).toBeNull();
      expect(sseLink({ open: bad, addSystem: bad }, 'https://x.test', 'sol', 'system'), bad).toBeNull();
    }
  });

  it('tolerates a row somebody pasted with whitespace round it', () => {
    expect(openLink({ open: '  ' + PROD + '  ', addSystem: null }, 'https://x.test', 'sol', 'starmap'))
      .toBe(PROD + 'https%3A%2F%2Fx.test%2Fapi%2Fdownload%2Fsol');
  });

  it('the system prefix defaults to BETA by name, whatever the campaign default is', () => {
    // Production (v3.1.48) still refuses a single system. Moving campaigns to production must not
    // move systems with them - that waits for the owner's release and a change to the row.
    expect(GATE_FALLBACKS.add_system_in_sse_url).toBe(BETA);
    expect(ssePrefixes(GATE_FALLBACKS)).toEqual({ open: GATE_FALLBACKS.open_in_sse_url, addSystem: BETA });
    expect(readFileSync('db/migrations/0041_add_system_in_sse.sql', 'utf8')).toContain("'add_system_in_sse_url'");
  });
});

describe('what the app reads to credit a system it adds', () => {
  it('title and by on GET /api/maps/<slug> are contract', () => {
    // "A link names only a download, so this is the only place the app can learn who made the system
    // it is adding" (engine R-18). Renaming either would add systems to campaigns uncredited.
    const detail = readFileSync('src/routes/api/maps/[slug]/+server.ts', 'utf8');
    expect(detail).toContain('title: map.title,');
    expect(detail).toContain('by: creator?.display_name ?? creator?.handle ?? null,');
  });
});
