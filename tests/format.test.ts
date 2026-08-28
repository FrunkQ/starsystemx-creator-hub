// The format gate is the one thing standing between a stranger's zip and a public database, so it
// is the thing most worth testing. All of this runs without a fixture.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkBundleFormat } from '../src/lib/bundle/format';

const OPTS = { acceptUnstamped: false, unstampedAs: 1 };

/** The module reads KNOWN_BUNDLE_FORMATS at call time, so a mock swaps the deploy's knowledge. */
async function withKnownFormats(formats: number[], fn: (check: typeof checkBundleFormat) => void | Promise<void>) {
  vi.resetModules();
  vi.doMock('../src/lib/bundle/contract', async (orig) => ({
    ...(await orig<typeof import('../src/lib/bundle/contract')>()),
    KNOWN_BUNDLE_FORMATS: formats
  }));
  const mod = await import('../src/lib/bundle/format');
  await fn(mod.checkBundleFormat);
}

afterEach(() => { vi.resetModules(); vi.doUnmock('../src/lib/bundle/contract'); });

describe('the format gate as it ships today', () => {
  it('refuses everything, because no fixture has been verified yet', () => {
    const v = checkBundleFormat({ bundleFormat: 1 }, OPTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('no-parser-yet');
  });

  it('refuses an unstamped bundle by default', () => {
    const v = checkBundleFormat({ name: 'Sol' }, OPTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('unstamped');
  });

  it('never throws on hostile input', () => {
    for (const doc of [null, undefined, 42, 'nope', [], { bundleFormat: {} }, { bundleFormat: -1 }]) {
      expect(() => checkBundleFormat(doc, OPTS)).not.toThrow();
      expect(checkBundleFormat(doc, OPTS).ok).toBe(false);
    }
  });
});

describe('the format gate once a fixture has been verified', () => {
  it('accepts a format it knows, and does not restamp a save that carries its own', async () => {
    await withKnownFormats([1], (check) => {
      expect(check({ bundleFormat: 1 }, OPTS)).toEqual({ ok: true, format: 1, legacyStamped: false });
    });
  });

  it('refuses a NEWER format politely rather than parsing it', async () => {
    await withKnownFormats([1], (check) => {
      const v = check({ bundleFormat: 9 }, OPTS);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.code).toBe('too-new');
        // The message must tell the creator what to do, not name an internal integer.
        expect(v.message).toMatch(/newer Star System Explorer/);
      }
    });
  });

  it('treats an unstamped bundle as the configured floor only when told to', async () => {
    await withKnownFormats([1], (check) => {
      expect(check({}, { acceptUnstamped: true, unstampedAs: 1 }).ok).toBe(true);
      expect(check({}, { acceptUnstamped: false, unstampedAs: 1 }).ok).toBe(false);
    });
  });

  // Q-01, answered by the owner: legacy saves are accepted and BASE-STAMPED by the hub. The flag
  // is what keeps that assumption visible in the database instead of invisible.
  it('marks a base-stamped legacy save as such, and a self-stamped one as not', async () => {
    await withKnownFormats([1], (check) => {
      const legacy = check({ name: 'An old save' }, { acceptUnstamped: true, unstampedAs: 1 });
      expect(legacy).toEqual({ ok: true, format: 1, legacyStamped: true });

      const stamped = check({ bundleFormat: 1 }, { acceptUnstamped: true, unstampedAs: 1 });
      expect(stamped.ok && stamped.legacyStamped).toBe(false);
    });
  });

  it('refuses a format that was retired', async () => {
    await withKnownFormats([3, 4], (check) => {
      const v = check({ bundleFormat: 2 }, OPTS);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.code).toBe('unknown');
    });
  });
});
