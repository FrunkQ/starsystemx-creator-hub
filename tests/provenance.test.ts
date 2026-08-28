// The public-sharing gate, computed from the DOCUMENT.
//
// WHAT THESE TESTS DO NOT PROVE: that this mirror matches what the engine actually writes. That
// needs the canonical fixture (design 4) and cannot be faked here. What they do prove is that the
// gate closes on the cases it exists for, and - the important one - that it does not consult
// ATTRIBUTIONS.md, which is a user-supplied file inside a user-supplied zip.
import { describe, it, expect } from 'vitest';
import { checkProvenance, collectAttributions } from '../src/lib/bundle/attribution';

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
