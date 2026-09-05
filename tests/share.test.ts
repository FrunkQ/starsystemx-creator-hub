// Sharing a map to Discord (src/lib/server/integrations/share.ts): the payload and the dedupe key.
import { describe, it, expect } from 'vitest';
import { buildShare, shareDedupeKey } from '../src/lib/server/integrations/share';

const system = {
  slug: 'local-neighbourhood', title: 'Local Neighbourhood', kind: 'starmap' as const, blurb: null, summary: 'Near stars.',
  cover_sha256: 'abc', system_count: 42, body_count: 161, construct_count: 11, hearts_count: 3, download_count: 9
};

describe('a share', () => {
  it('carries the page, the picture and the counts', () => {
    const s = buildShare(system, 'FrunkQ', 'https://x.test', true, 'published');
    expect(s.url).toBe('https://x.test/s/local-neighbourhood');
    expect(s.cover).toBe('https://x.test/asset/abc');
    expect(s.blurb).toBe('Near stars.');
    expect(s.counts).toEqual({ systems: 42, bodies: 161, constructs: 11 });
  });

  it('never links a cover that cannot be served', () => {
    expect(buildShare(system, null, 'https://x.test', false, 'updated').cover).toBeNull();
  });

  it('is one post per map per event per hour', () => {
    const a = shareDedupeKey('id1', 'published', new Date('2026-09-05T10:05:00Z'));
    const b = shareDedupeKey('id1', 'published', new Date('2026-09-05T10:55:00Z'));
    const c = shareDedupeKey('id1', 'published', new Date('2026-09-05T11:01:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(shareDedupeKey('id1', 'updated', new Date('2026-09-05T10:05:00Z'))).not.toBe(a);
  });
});
