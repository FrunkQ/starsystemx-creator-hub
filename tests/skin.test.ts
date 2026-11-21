// THE CHART ROOM SKIN (D-93). Three promises the stylesheets make, checked so a later edit cannot
// quietly break them: every colour comes from the shared skin file; the Night chart is the same in
// both places it is written (the device asking for dark, and the toggle); and every font the skin
// names is a file that ships.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const SKIN = readFileSync('static/skin/chart-room.css', 'utf8');
const APP = readFileSync('src/app.css', 'utf8');

/** The `--cr-*` declarations inside the first block that follows `marker`. */
function block(css: string, marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  expect(start, `no block at ${marker}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start + marker.length - 1);
  const close = css.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--cr-[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('the chart room skin', () => {
  it('the hub stylesheet names no colour of its own: every one is a skin token', () => {
    const noComments = APP.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(noComments.match(/rgba?\(/g) ?? []).toEqual([]);
  });

  it('the Night chart is written the same for the device setting and for the toggle', () => {
    const device = block(SKIN, ':root:not([data-theme="light"]) {');
    const chosen = block(SKIN, ':root[data-theme="dark"] {');
    expect(Object.keys(device).length).toBeGreaterThan(10);
    expect(device).toEqual(chosen);
  });

  it('the Night chart overrides only tokens the Chart room defines', () => {
    const light = block(SKIN, ':root {');
    const dark = block(SKIN, ':root[data-theme="dark"] {');
    for (const k of Object.keys(dark)) expect(light, k).toHaveProperty(k);
  });

  it('carries the values of SSE4\'s chart room theme (packages/skins/chart-room/src/themes.ts)', () => {
    const light = block(SKIN, ':root {');
    const dark = block(SKIN, ':root[data-theme="dark"] {');
    // A spot check of the identity, not the whole table: ground, ink and the one accent.
    expect(light['--cr-ground']).toBe('#EFEAE0');
    expect(light['--cr-ink']).toBe('#1E2A33');
    expect(light['--cr-accent']).toBe('#B4471F');
    expect(dark['--cr-ground']).toBe('#0B1117');
    expect(dark['--cr-accent']).toBe('#5EB8FF');
    expect(light['--cr-radius']).toBe('0px');
  });

  it('every font the skin names ships beside it, with its licence', () => {
    const urls = [...SKIN.matchAll(/url\('\.\/(fonts\/[^']+)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(7);
    for (const u of urls) expect(existsSync('static/skin/' + u), u).toBe(true);
    const files = readdirSync('static/skin/fonts');
    for (const family of ['newsreader', 'ibm-plex-sans', 'ibm-plex-mono']) {
      expect(files).toContain(`LICENSE-${family}.txt`);
    }
  });

  it('is loaded before the hub stylesheet, with the remembered choice applied before paint', () => {
    const html = readFileSync('src/app.html', 'utf8');
    const skin = html.indexOf('/skin/chart-room.css');
    expect(skin).toBeGreaterThan(0);
    expect(html.indexOf('%sveltekit.head%')).toBeGreaterThan(skin);
    expect(html).toMatch(/localStorage\.getItem\('sx-theme'\)/);
  });
});
