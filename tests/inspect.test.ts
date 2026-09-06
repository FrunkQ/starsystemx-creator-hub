// Inspecting a broken file without being broken by it (src/lib/bundle/inspect.ts).
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { inspectBytes, parseReport, openDepthAtEnd, requiredAssets } from '../src/lib/bundle/inspect';

const doc = {
  bundleFormat: 1, appVersion: '3.0.301', revision: 7, exportMode: 'gm', name: 'Test',
  nodes: [
    { id: 'sol', kind: 'body', name: 'Sol', roleHint: 'star' },
    { id: 'earth', kind: 'body', name: 'Earth', parentId: 'sol', image: { url: 'assets/images/earth.png' }, gmNotes: 'secret' },
    { id: 'ghost', kind: 'body', name: 'Ghost', parentId: 'nowhere' },
    { kind: 'body', name: 'No id' },
    { id: 'sol', kind: 'body', name: 'Sol again' }
  ]
};
const text = JSON.stringify(doc);

describe('inspecting a save', () => {
  it('reads the versions and counts the objects, complete and not', () => {
    const r = inspectBytes(strToU8(text));
    expect(r.container).toBe('json');
    expect(r.doc?.parse.ok).toBe(true);
    expect(r.doc?.appVersion).toBe('3.0.301');
    expect(r.doc?.revision).toBe(7);
    expect(r.doc?.kind).toBe('system');
    expect(r.doc?.nodes).toBe(5);
    expect(r.doc?.complete).toBe(4);
    expect(r.doc?.incomplete).toEqual(['No id']);
    expect(r.doc?.orphans).toEqual(['ghost -> nowhere']);
    expect(r.doc?.duplicateIds).toEqual(['sol']);
    expect(r.doc?.gmNotes).toBe(1);
    expect(r.requires).toEqual(['assets/images/earth.png']);
  });

  it('says a JSON file was cut short, and where', () => {
    const cut = text.slice(0, Math.floor(text.length * 0.6));
    const r = inspectBytes(strToU8(cut));
    expect(r.doc?.parse.ok).toBe(false);
    if (r.doc && !r.doc.parse.ok) {
      expect(r.doc.parse.truncated).toBe(true);
      expect(r.doc.parse.near.length).toBeGreaterThan(0);
    }
    expect(r.warnings.some((w) => w.includes('cut short'))).toBe(true);
  });

  it('tells a broken document from a truncated one', () => {
    const p = parseReport('{"a": 1, "b": }');
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.truncated).toBe(false);
    expect(openDepthAtEnd('{"a": [1, 2')).toBe(2);
    expect(openDepthAtEnd('{"a": "unterminated')).toBeGreaterThan(0);
    expect(openDepthAtEnd('{"a": "}"}')).toBe(0);
  });

  it('lists what a zip holds and what the document needs but the zip lacks', () => {
    const bytes = zipSync({
      'starmap.json': strToU8(JSON.stringify({ ...doc, systems: [{ name: 'S', system: { nodes: doc.nodes } }] })),
      'assets/images/other.png': strToU8('png'),
      'ATTRIBUTIONS.md': strToU8('# credits')
    });
    const r = inspectBytes(bytes);
    expect(r.container).toBe('zip');
    expect(r.zip?.ok).toBe(true);
    expect(r.zip?.truncated).toBe(false);
    expect(r.zip?.docPath).toBe('starmap.json');
    expect(r.zip?.hasAttributions).toBe(true);
    expect(r.doc?.kind).toBe('starmap');
    expect(r.doc?.systems).toBe(1);
    expect(r.missing).toEqual(['assets/images/earth.png']);
    expect(r.unreferenced).toEqual(['assets/images/other.png']);
  });

  it('survives a truncated zip and says so', () => {
    const whole = zipSync({ 'system.json': strToU8(text) });
    const r = inspectBytes(whole.slice(0, whole.length - 30));
    expect(r.container).toBe('zip');
    expect(r.zip?.truncated).toBe(true);
    expect(r.warnings.some((w) => w.includes('truncated'))).toBe(true);
  });

  it('survives something that is neither', () => {
    // Plain words are now READ AS A LOG rather than refused (D-40): when the app falls over, text
    // is what a person has to hand. Actual binary is still refused, and empty is still empty.
    const r = inspectBytes(strToU8('hello there'));
    expect(r.container).toBe('text');
    expect(r.log?.errors).toBe(0);
    expect(inspectBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00])).container).toBe('unknown');
    expect(inspectBytes(new Uint8Array()).warnings[0]).toContain('empty');
  });

  it('finds every asset path the document names, once', () => {
    expect(requiredAssets('{"a":"assets/images/x.png","b":"assets/images/x.png","c":"assets/models/m.glb","d":"assets/other.txt"}'))
      .toEqual(['assets/images/x.png', 'assets/models/m.glb']);
  });
});
