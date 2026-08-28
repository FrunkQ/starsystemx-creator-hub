// The public-sharing gate, computed from the DOCUMENT.
//
// WHAT THESE TESTS DO NOT PROVE: that this mirror matches what the engine actually writes. That
// needs the canonical fixture (design 4) and cannot be faked here. What they do prove is that the
// gate closes on the cases it exists for, and - the important one - that it does not consult
// ATTRIBUTIONS.md, which is a user-supplied file inside a user-supplied zip.
import { describe, it, expect } from 'vitest';
import { checkProvenance, collectAttributions } from '../src/lib/bundle/attribution';
import { readProvenance } from '../src/lib/bundle/provenance';
import { detectGmContent } from '../src/lib/bundle/gmContent';
import { normalise } from '../src/lib/bundle/normalise';

const withImage = (image: Record<string, unknown>) => ({
  nodes: [{ id: 'n1', name: 'Kepler', image: { url: 'assets/images/n1.jpg', ...image } }]
});

describe('the provenance gate', () => {
  it('opens for a save carrying no uploaded assets at all', () => {
    expect(checkProvenance({ nodes: [{ id: 'n1', name: 'Kepler' }] }).mayPublish).toBe(true);
  });

  it('closes when an asset has nothing recorded', () => {
    const v = checkProvenance(withImage({}));
    expect(v.missing).toHaveLength(1);
    expect(v.mayPublish).toBe(false);
  });

  it('opens when any one provenance field is filled in', () => {
    for (const field of ['credit', 'license', 'sourceUrl']) {
      expect(checkProvenance(withImage({ [field]: 'x' })).mayPublish).toBe(true);
    }
  });

  it('IGNORES ATTRIBUTIONS.md entirely - the gate cannot be opened by editing a markdown file', () => {
    // A doc whose assets are uncredited stays blocked no matter what the bundle claims elsewhere.
    // This is the whole reason the mirror exists rather than a markdown parser.
    const doc = withImage({});
    expect(checkProvenance(doc).mayPublish).toBe(false);
    // Nothing in the function signature even accepts the rendered file.
    expect(checkProvenance.length).toBeLessThanOrEqual(3);
  });

  it('reports a CC-BY breach but does not block on it by default', () => {
    const doc = withImage({ license: 'CC-BY 4.0' });
    const v = checkProvenance(doc);
    expect(v.breaches).toHaveLength(1);
    // The design's gate is missing.length === 0. A licence counts as provenance, so this passes.
    expect(v.mayPublish).toBe(true);
    // ...and blocks only when the owner turns it on (docs/decisions.md Q-02).
    expect(checkProvenance(doc, {}, { blockCcByBreach: true }).mayPublish).toBe(false);
  });
});

describe('what gets collected', () => {
  it('credits one shared hull once, however many ships use it', () => {
    const entries = collectAttributions({
      nodes: [
        { id: 'a', name: 'Ship A', model: { hash: 'h1', credit: 'Someone' } },
        { id: 'b', name: 'Ship B', model: { hash: 'h1', credit: 'Someone' } }
      ]
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].usedBy).toEqual(['Ship A', 'Ship B']);
  });

  it('does not claim a remote image - that is someone else s hosting to credit', () => {
    const entries = collectAttributions({
      nodes: [{ id: 'a', name: 'A', image: { url: 'https://example.com/pic.jpg' } }]
    });
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a player asset for a node image', () => {
    // THE TRAP the engine's own comment names: 'assets/images/player/' STARTS WITH
    // 'assets/images/', so a node-image match must exclude it explicitly rather than by luck.
    const entries = collectAttributions({
      nodes: [{ id: 'a', name: 'A', image: { url: 'assets/images/player/logo.png', credit: 'x' } }]
    });
    expect(entries).toHaveLength(0);
  });

  it('collects player-view graphics, which are assets too', () => {
    const entries = collectAttributions({
      nodes: [],
      playerAssets: [{ id: 'p1', name: 'Sector map', dataUrl: 'assets/images/player/p1.jpg' }]
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('image');
  });

  it('walks a campaign as well as a single system', () => {
    const entries = collectAttributions({
      systems: [{ name: 'Sol', system: { nodes: [{ id: 'a', name: 'Earth', image: { url: 'assets/images/a.jpg' } }] } }]
    });
    expect(entries[0].usedBy).toEqual(['Earth (Sol)']);
  });
});

// ------------------------------------------------------------------------------------------------
// The CAPABILITY MARKER. Separate from the contract number on purpose - see bundle/provenance.ts.
// ------------------------------------------------------------------------------------------------
describe('the capability marker', () => {
  it('reads the engine build that wrote the save', () => {
    expect(readProvenance({ appVersion: '3.0.161' }).createdWith).toBe('3.0.161');
  });

  it('treats absence as absence, not as an error and not as a default', () => {
    // A save from before the stamp is legitimate. It is also the case the owner asked us to accept
    // as legacy rather than refuse.
    expect(readProvenance({}).createdWith).toBeNull();
    expect(readProvenance(null).createdWith).toBeNull();
    expect(readProvenance({ appVersion: 42 }).createdWith).toBeNull();
  });

  it('never invents a baseMapVersion', () => {
    // The engine is explicit that a map built from scratch has no base and carries none, so absent
    // must stay absent rather than becoming 0 or 1.
    expect(readProvenance({}).baseMapVersion).toBeNull();
    expect(readProvenance({ baseMapVersion: 2 }).baseMapVersion).toBe(2);
  });

  it('caps a hostile version string rather than displaying it', () => {
    expect(readProvenance({ appVersion: 'x'.repeat(500) }).createdWith).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------
// GM content detection. Replaces a radio button the uploader could answer WRONGLY - and the wrong
// answer was the one that leaks somebody's campaign.
// ------------------------------------------------------------------------------------------------
describe('detecting GM-only content', () => {
  it('finds nothing in a clean player export', () => {
    const r = detectGmContent({ nodes: [{ id: 'a', name: 'Earth', tags: [{ key: 'world/terran' }] }] });
    expect(r.hasGmContent).toBe(false);
    expect(r.summary).toEqual([]);
  });

  it('is CERTAIN when it says yes - every marker is one the player snapshot removes', () => {
    expect(detectGmContent({ nodes: [{ id: 'a', name: 'A', gmNotes: 'the villain lives here' }] }).hasGmContent).toBe(true);
    expect(detectGmContent({ nodes: [{ id: 'a', name: 'A', object_playerhidden: true }] }).hasGmContent).toBe(true);
    expect(detectGmContent({ nodes: [{ id: 'a', name: 'A', tags: [{ key: 'x', secret: true }] }] }).hasGmContent).toBe(true);
    expect(detectGmContent({ nodes: [{ id: 'a', name: 'A', overrides: { anomalies: { tempK: 'reactor' } } }] }).hasGmContent).toBe(true);
    expect(detectGmContent({ gmNotes: 'campaign notes', nodes: [] }).hasGmContent).toBe(true);
  });

  it('reads the undo history under its one permitted spelling', () => {
    // The engine allows exactly `undoHistory` and strips it on every outbound path, so its
    // presence means the file never went through a normal export.
    expect(detectGmContent({ undoHistory: [{ op: 'delete' }], nodes: [] }).hasGmContent).toBe(true);
    expect(detectGmContent({ undoHistory: [], nodes: [] }).hasGmContent).toBe(false);
    expect(detectGmContent({ undoStack: [{ op: 'delete' }], nodes: [] }).hasGmContent).toBe(false);
  });

  it('does not treat a hidden-description FLAG as proof, because the flag survives redaction', () => {
    // The player snapshot deletes the description but leaves the flag, so the flag alone proves
    // nothing. Only the flag with the text still attached is evidence.
    expect(detectGmContent({ nodes: [{ id: 'a', name: 'A', description_playerhidden: true }] }).hasGmContent).toBe(false);
    expect(detectGmContent({
      nodes: [{ id: 'a', name: 'A', description_playerhidden: true, description: 'the truth' }]
    }).hasGmContent).toBe(true);
  });

  it('counts and names what it found, so the warning is actionable', () => {
    const r = detectGmContent({
      nodes: [
        { id: 'a', name: 'Vault', gmNotes: 'x' },
        { id: 'b', name: 'Relay', gmNotes: 'y' },
        { id: 'c', name: 'Ghost', object_playerhidden: true }
      ]
    });
    expect(r.summary).toContain('GM notes on 2 objects');
    expect(r.summary).toContain('1 object that is hidden from players');
    expect(r.findings.find((f) => f.kind === 'gmNotes')?.examples).toContain('Vault');
  });

  it('walks a campaign, not just a single system', () => {
    const r = detectGmContent({
      systems: [{ name: 'Sol', system: { nodes: [{ id: 'a', name: 'Mars', gmNotes: 'secret base' }] } }]
    });
    expect(r.hasGmContent).toBe(true);
    expect(r.findings[0].examples).toContain('Mars (Sol)');
  });

  it('never throws on hostile or empty input', () => {
    for (const doc of [null, undefined, 42, 'nope', [], {}, { nodes: null }, { systems: 'x' }]) {
      expect(() => detectGmContent(doc)).not.toThrow();
    }
  });
});

// ------------------------------------------------------------------------------------------------
// The `meta` block: the creator's write-up, authored in the app. See docs/sse-integration-spec.md.
// ------------------------------------------------------------------------------------------------
describe('the write-up carried in the save', () => {
  it('prefers meta when present', () => {
    const n = normalise({
      name: 'old name',
      meta: { title: 'The Hystrine Reach', summary: 'A dying binary.', tags: ['Hard-SF', ' binary '] },
      nodes: []
    });
    expect(n.title).toBe('The Hystrine Reach');
    expect(n.summary).toBe('A dying binary.');
    expect(n.tags).toEqual(['hard-sf', 'binary']);
  });

  it('falls back exactly as it did before meta existed', () => {
    // Absent is the normal case for every save that exists today, and must never be an error.
    expect(normalise({ name: 'Sirius', nodes: [] }).title).toBe('Sirius');
    expect(normalise({ nodes: [] }).title).toBe('Untitled');
    expect(normalise({ nodes: [] }).tags).toEqual([]);
  });

  it('clamps hostile lengths and ignores non-string tags', () => {
    const n = normalise({
      meta: { title: 'x'.repeat(500), summary: 'y'.repeat(5000), tags: ['ok', 42, null, {}] },
      nodes: []
    });
    expect(n.title.length).toBe(120);
    expect(n.summary?.length).toBe(300);
    expect(n.tags).toEqual(['ok']);
  });
});
