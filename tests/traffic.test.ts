// Traffic counting: cheap to record, batched to flush, honest about what it approximates.
import { describe, it, expect } from 'vitest';
import { TrafficCounter, categoryOf } from '../src/lib/server/traffic';

describe('what a request counts as', () => {
  it('sorts paths into the buckets that map onto bills', () => {
    expect(categoryOf('/asset/abc')).toBe('asset');
    expect(categoryOf('/private/asset/abc')).toBe('asset');
    expect(categoryOf('/api/download/sol')).toBe('download');
    expect(categoryOf('/api/maps')).toBe('api');
    expect(categoryOf('/api/upload')).toBe('upload');
    expect(categoryOf('/api/screenshots')).toBe('upload');
    expect(categoryOf('/api/debug/abc')).toBe('upload');
    expect(categoryOf('/s/sol')).toBe('page');
    expect(categoryOf('/')).toBe('page');
    expect(categoryOf('/_app/immutable/x.js')).toBe('other');
  });
});

describe('the counter', () => {
  it('accumulates by day and category and flushes in batches', () => {
    const c = new TrafficCounter();
    const day = new Date('2026-09-04T10:00:00Z');
    for (let i = 0; i < 5; i++) c.record('page', 1000, 0, day);
    c.record('download', 300_000, 0, day);
    c.record('upload', 200, 2_000_000, day);
    c.record('page', 500, 0, new Date('2026-09-05T01:00:00Z'));
    expect(c.due(day.getTime())).toBe(false);
    const rows = c.drain();
    expect(rows).toEqual([
      { day: '2026-09-04', category: 'page', requests: 5, bytes: 5000, bytes_in: 0 },
      { day: '2026-09-04', category: 'download', requests: 1, bytes: 300_000, bytes_in: 0 },
      { day: '2026-09-04', category: 'upload', requests: 1, bytes: 200, bytes_in: 2_000_000 },
      { day: '2026-09-05', category: 'page', requests: 1, bytes: 500, bytes_in: 0 }
    ]);
    expect(c.drain()).toEqual([]);
  });

  it('is due after twenty requests, or after forty-five seconds with anything pending', () => {
    const c = new TrafficCounter();
    const t0 = Date.now();
    for (let i = 0; i < 19; i++) c.record('api', 10);
    expect(c.due(t0)).toBe(false);
    c.record('api', 10);
    expect(c.due(t0)).toBe(true);
    const d = new TrafficCounter();
    d.record('page', 10);
    expect(d.due(t0 + 44_000)).toBe(false);
    expect(d.due(t0 + 46_000)).toBe(true);
    // Nothing pending is never due, however long it has been.
    expect(new TrafficCounter().due(t0 + 1e9)).toBe(false);
  });

  it('never records negative or fractional bytes', () => {
    const c = new TrafficCounter();
    c.record('page', -5);
    c.record('page', 12.9);
    expect(c.drain()[0].bytes).toBe(12);
  });
});
