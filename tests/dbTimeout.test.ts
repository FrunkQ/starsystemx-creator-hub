// The 27 Nov 2026 outage: a stalled database hung every page ~20 s, then 500. Every database call
// now gives up after DB_TIMEOUT_MS and the failure is recognised as "not answering".
import { describe, it, expect } from 'vitest';
import { timedFetch, isDbTimeout, DB_TIMEOUT_MS } from '../src/lib/server/db';

const never: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  });

describe('database call limit', () => {
  it('aborts a call that never answers, and the error reads as a timeout', async () => {
    const started = Date.now();
    const err = await timedFetch(50, never)('https://db.invalid/rest/v1/x').catch((e) => e);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(isDbTimeout(err)).toBe(true);
  });

  it('passes an answer through untouched', async () => {
    const ok: typeof fetch = async () => new Response('fine', { status: 200 });
    const res = await timedFetch(50, ok)('https://db.invalid/');
    expect(await res.text()).toBe('fine');
  });

  it("keeps the caller's own signal", async () => {
    const mine = new AbortController();
    const p = timedFetch(60_000, never)('https://db.invalid/', { signal: mine.signal }).catch((e) => e);
    mine.abort();
    expect(isDbTimeout(await p)).toBe(true);
  });

  it('recognises the message postgrest-js hands back, and nothing else', () => {
    expect(isDbTimeout({ message: 'TimeoutError: The operation was aborted due to timeout' })).toBe(true);
    expect(isDbTimeout(new Error('config unreadable: AbortError: signal timed out'))).toBe(true);
    expect(isDbTimeout(new Error('duplicate key value violates unique constraint'))).toBe(false);
    expect(isDbTimeout(null)).toBe(false);
  });

  it('is eight seconds', () => {
    expect(DB_TIMEOUT_MS).toBe(8_000);
  });
});
