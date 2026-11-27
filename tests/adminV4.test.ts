// SP16: every admin page takes SSE4 items, or says on the page why it does not.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTarget, describeAction } from '../src/lib/auditLog';
import { v4SlugOf } from '../src/lib/addresses';

describe('admin pages cover SSE4 (SP16)', () => {
  const dir = 'src/routes/admin';
  const pages = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it.each(pages)('%s reads SSE4 items or says why not', (page) => {
    const read = (f: string) => (existsSync(`${dir}/${page}/${f}`) ? readFileSync(`${dir}/${page}/${f}`, 'utf8') : '');
    const text = read('+page.server.ts') + read('+page.svelte');
    expect(/v4_items|v4_reports|SSE4/.test(text), `${page} neither reads v4 tables nor mentions SSE4`).toBe(true);
  });
});

describe('the log reads SSE4 actions (SP16)', () => {
  it('names the item by its slug', () => {
    expect(parseTarget('v4.hold', 'v4_item:sse.sol-today-0.1.0')).toEqual({ kind: 'v4_item', id: 'sse.sol-today-0.1.0' });
  });
  it('has words for every v4 action', () => {
    for (const a of ['v4.hold', 'v4.restore', 'v4.remove', 'v4.dismiss', 'v4.edit', 'v4.withdraw', 'v4.return']) {
      expect(describeAction(a).verb).not.toBe(a.replace(/[.\-_]/g, ' '));
    }
  });
});

describe('a takedown claim names an SSE4 item (SP16)', () => {
  it('reads the slug from an item address', () => {
    expect(v4SlugOf('https://explorers.starsystemx.com/v/sse.sol-today-0.1.0')).toBe('sse.sol-today-0.1.0');
    expect(v4SlugOf('https://explorers.starsystemx.com/v/kestrel-reach/?x=1')).toBe('kestrel-reach');
  });
  it('leaves anything else alone', () => {
    expect(v4SlugOf('https://explorers.starsystemx.com/s/some-map')).toBeNull();
    expect(v4SlugOf(null)).toBeNull();
  });
});
