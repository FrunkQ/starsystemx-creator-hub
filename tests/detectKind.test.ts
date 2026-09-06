// WHAT A SAVE IS, read from the save (D-48).
//
// The owner uploaded a single system and the hub called it a campaign - as it had called every
// plain `.json` upload a campaign, because `openBundle` had no filename to read and filled the gap
// with `starmap.json`. The document was never ambiguous; it simply was not the thing being asked.
import { describe, it, expect } from 'vitest';
import { strToU8 } from 'fflate';
import { detectKind, DOC_NAME } from '../src/lib/bundle/contract';
import { openBundle } from '../src/lib/bundle/open';

const SYSTEM = { bundleFormat: 1, name: 'Regina', nodes: [{ id: 'a', kind: 'body', name: 'Regina' }] };
const STARMAP = { bundleFormat: 1, name: 'The Reach', systems: [{ name: 'Regina', system: { nodes: [] } }] };

describe('the document decides', () => {
  it('a save with `nodes` is one system', () => {
    expect(detectKind(SYSTEM)).toBe('system');
  });

  it('a save with `systems` is a campaign', () => {
    expect(detectKind(STARMAP)).toBe('starmap');
  });

  it('an EMPTY campaign is still a campaign - the key is the statement, not its length', () => {
    expect(detectKind({ systems: [] })).toBe('starmap');
  });

  it('prefers `systems` when a file somehow carries both', () => {
    expect(detectKind({ systems: [], nodes: [] })).toBe('starmap');
  });

  it('never throws on what a stranger uploaded', () => {
    for (const junk of [null, undefined, 42, 'text', [], { nodes: 'not an array' }]) {
      expect(() => detectKind(junk)).not.toThrow();
    }
  });
});

describe('the filename is the tie-breaker, not the answer', () => {
  it('is used only when the document says nothing either way', () => {
    expect(detectKind({}, 'x/system.json')).toBe('system');
    expect(detectKind({}, 'x/starmap.json')).toBe('starmap');
  });

  // THE FAULT, EXACTLY: a zip whose document is one system does not become a campaign because of
  // the path it was found at, and vice versa.
  it('does not overrule a document that has spoken', () => {
    expect(detectKind(SYSTEM, 'starmap.json')).toBe('system');
    expect(detectKind(STARMAP, 'system.json')).toBe('starmap');
  });
});

describe('a plain .json upload', () => {
  it('is opened as what it is, not as a starmap', () => {
    const opened = openBundle(strToU8(JSON.stringify(SYSTEM)));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(detectKind(opened.doc, opened.docPath)).toBe('system');
    // The path matters beyond the kind: a stripped save is rebuilt as a zip under this name, and a
    // single system written into `starmap.json` is a bundle that lies about itself.
    expect(opened.docPath).toBe(DOC_NAME.system);
  });

  it('still opens a campaign as a campaign', () => {
    const opened = openBundle(strToU8(JSON.stringify(STARMAP)));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.docPath).toBe(DOC_NAME.starmap);
  });
});
