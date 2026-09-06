// THE CREDIT WRITE-BACK (D-62). The owner: "that is critical to this."
//
// What these pin: a credit typed on the hub reaches every node that uses the asset, reaches the
// attributions file, and CANNOT quietly delete provenance the app already recorded. The last one is
// the dangerous direction - a patch that blanked a credit while claiming to improve it would be
// worse than never having run.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyCredits, renderAttributions, creditedDoc, type ClaimsByPath, type CreditClaim } from '../src/lib/bundle/credits';
import { collectAttributions, checkProvenance, noProvenance } from '../src/lib/bundle/attribution';
import { openBundle } from '../src/lib/bundle/open';
import { MODELS_DIR, IMAGES_DIR, PLAYER_IMAGES_DIR } from '../src/lib/bundle/contract';

const claim = (m: Record<string, CreditClaim>): ClaimsByPath => new Map(Object.entries(m));

/** The docs here are engine saves: loosely typed on purpose, exactly as `applyCredits` sees them. */
type Doc = any;

describe('applyCredits', () => {
  it('credits an image on the node that uses it', () => {
    const doc: Doc = { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png' } }] };
    const { patched } = applyCredits(doc, claim({
      [IMAGES_DIR + 'a.png']: { credit: 'A Painter', license: 'CC BY 4.0' }
    }));
    expect(patched).toBe(1);
    expect(doc.nodes[0].image).toMatchObject({ credit: 'A Painter', license: 'CC BY 4.0' });
  });

  it('credits a model by its PATH, not by trusting the hash to be the hub\'s own', () => {
    // The hub hashes bytes; `model.hash` is the engine's and arrives inside a stranger's zip. The
    // path is what `collectAttributions` reads, so the patch and the gate cannot disagree.
    const doc: Doc = { nodes: [{ id: 'a', model: { hash: 'abc', url: MODELS_DIR + 'abc.glb' } }] };
    const { patched } = applyCredits(doc, claim({ [MODELS_DIR + 'abc.glb']: { credit: 'A Modeller' } }));
    expect(patched).toBe(1);
    expect(doc.nodes[0].model.credit).toBe('A Modeller');
  });

  it('credits EVERY node using the same asset, not just the first', () => {
    // One hull on two ships is one entry in the attributions file and two nodes in the save. A
    // patch that stopped at the first would leave the second uncredited in the doc itself.
    const doc: Doc = {
      nodes: [
        { id: 'a', model: { hash: 'h', url: MODELS_DIR + 'h.glb' } },
        { id: 'b', model: { hash: 'h', url: MODELS_DIR + 'h.glb' } }
      ]
    };
    const { patched } = applyCredits(doc, claim({ [MODELS_DIR + 'h.glb']: { credit: 'A Modeller' } }));
    expect(patched).toBe(2);
    expect(doc.nodes[1].model.credit).toBe('A Modeller');
  });

  it('reaches nodes inside a starmap\'s systems, not only a bare node list', () => {
    const doc: Doc = { systems: [{ name: 'Reach', system: { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png' } }] } }] };
    const { patched } = applyCredits(doc, claim({ [IMAGES_DIR + 'a.png']: { credit: 'A Painter' } }));
    expect(patched).toBe(1);
    expect(doc.systems[0].system.nodes[0].image.credit).toBe('A Painter');
  });

  it('credits a player asset, which is keyed on dataUrl and not on an image node', () => {
    const doc: Doc = { playerAssets: [{ id: 'p', dataUrl: PLAYER_IMAGES_DIR + 'map.png' }] };
    const { patched } = applyCredits(doc, claim({ [PLAYER_IMAGES_DIR + 'map.png']: { credit: 'A Cartographer' } }));
    expect(patched).toBe(1);
    expect(doc.playerAssets[0].credit).toBe('A Cartographer');
  });

  it('does not mistake a player image for an ordinary one', () => {
    // PLAYER_IMAGES_DIR starts with IMAGES_DIR. The engine's own code has this trap and so must
    // this: a node image claim must never land on a player asset by prefix accident.
    const doc: Doc = { nodes: [{ id: 'a', image: { url: PLAYER_IMAGES_DIR + 'map.png' } }] };
    const { patched } = applyCredits(doc, claim({ [PLAYER_IMAGES_DIR + 'map.png']: { credit: 'X' } }));
    expect(patched).toBe(0);
  });

  it('NEVER blanks a credit the app already recorded', () => {
    // The dangerous direction. The hub form can be submitted with a box empty; an empty box is
    // "not answered", never "delete what is there".
    const doc: Doc = { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png', credit: 'A Painter', license: 'CC BY 4.0' } }] };
    applyCredits(doc, claim({ [IMAGES_DIR + 'a.png']: { credit: '', license: null, sourceUrl: 'https://x.test' } }));
    expect(doc.nodes[0].image.credit).toBe('A Painter');
    expect(doc.nodes[0].image.license).toBe('CC BY 4.0');
    expect(doc.nodes[0].image.sourceUrl).toBe('https://x.test');
  });

  it('reports nothing patched when the claim already matches, so a download stays byte-identical', () => {
    const doc: Doc = { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png', credit: 'A Painter' } }] };
    expect(applyCredits(doc, claim({ [IMAGES_DIR + 'a.png']: { credit: 'A Painter' } })).patched).toBe(0);
    expect(creditedDoc(doc, 'starmap', claim({ [IMAGES_DIR + 'a.png']: { credit: 'A Painter' } }))).toBeNull();
  });

  it('touches nothing when a claim matches no asset in this save', () => {
    const doc: Doc = { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png' } }] };
    expect(applyCredits(doc, claim({ [IMAGES_DIR + 'gone.png']: { credit: 'X' } })).patched).toBe(0);
  });

  it('writes only the four fields the attribution reader looks at', () => {
    const doc: Doc = { nodes: [{ id: 'a', image: { url: IMAGES_DIR + 'a.png' } }] };
    applyCredits(doc, claim({ [IMAGES_DIR + 'a.png']: { credit: 'A Painter' } }));
    expect(Object.keys(doc.nodes[0].image).sort()).toEqual(['credit', 'url']);
  });
});

describe('the gate agrees with the patch', () => {
  it('a credit typed on the hub opens the publish gate in the FILE too', () => {
    // THE WHOLE POINT. Before D-62 the gate was satisfied by `asset_claims` while the file it
    // served still had nothing recorded - the hub saying one thing and shipping another.
    const doc: Doc = { nodes: [{ id: 'a', name: 'Bellwether', image: { url: IMAGES_DIR + 'a.png' } }] };
    expect(checkProvenance(doc).mayPublish).toBe(false);

    applyCredits(doc, claim({ [IMAGES_DIR + 'a.png']: { credit: 'A Painter', license: 'CC BY 4.0' } }));
    expect(checkProvenance(doc).mayPublish).toBe(true);
    expect(checkProvenance(doc, {}, { blockCcByBreach: true }).mayPublish).toBe(true);
  });
});

describe('renderAttributions', () => {
  it('describes what the doc now says, including who uses what', () => {
    const doc: Doc = {
      nodes: [
        { id: 'a', name: 'Bellwether', image: { url: IMAGES_DIR + 'a.png', credit: 'A Painter', license: 'CC BY 4.0' } },
        { id: 'b', name: 'Tally', image: { url: IMAGES_DIR + 'b.png' } }
      ]
    };
    const md = renderAttributions(collectAttributions(doc), 'starmap');
    expect(md).toContain('**0 models, 2 images.**');
    expect(md).toContain('- Used by: Bellwether');
    expect(md).toContain('- Credit: A Painter');
    expect(md).toContain('- Licence: CC BY 4.0');
    // The one still missing is named as missing, in the engine's own words.
    expect(md).toContain('- _No provenance recorded._');
    expect(md).toContain('1 asset has no provenance recorded at all.');
  });

  it('counts in the plural properly - a stray "1 images" reads as a bug', () => {
    const one = renderAttributions(collectAttributions({
      nodes: [{ id: 'a', name: 'A', image: { url: IMAGES_DIR + 'a.png', credit: 'X' } }]
    }), 'system');
    expect(one).toContain('**0 models, 1 image.**');
  });

  it('says so when the hub filled some of it in', () => {
    // The engine's own text claims the file was written on export. Letting that stand over credits
    // typed on a web page would be a small lie that costs somebody an hour.
    const entries = collectAttributions({ nodes: [{ id: 'a', name: 'A', image: { url: IMAGES_DIR + 'a.png', credit: 'X' } }] });
    expect(renderAttributions(entries, 'starmap', true)).toContain('filled in on the hub');
    expect(renderAttributions(entries, 'starmap', false)).not.toContain('filled in on the hub');
  });

  it('names the document it describes, so a system save does not claim to be a campaign', () => {
    expect(renderAttributions([], 'system')).toContain('`system.json`');
    expect(renderAttributions([], 'starmap')).toContain('`starmap.json`');
  });
});

describe('against the real engine fixture', () => {
  const bundle = readFileSync('tests/fixtures/creator-hub-bundle.sse.zip');
  const opened = openBundle(new Uint8Array(bundle));
  if (!opened.ok) throw new Error('fixture will not open: ' + opened.message);

  it('the fixture starts with exactly one uncredited asset', () => {
    // If this ever changes, the assertion below is testing nothing - so it is stated out loud.
    const missing = collectAttributions(opened.doc).filter(noProvenance);
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe(IMAGES_DIR + 'moon-c.png');
  });

  it('crediting that one asset makes the whole save publishable', () => {
    const doc = JSON.parse(JSON.stringify(opened.doc));
    expect(checkProvenance(doc).mayPublish).toBe(false);

    const patched = creditedDoc(doc, 'starmap', claim({
      [IMAGES_DIR + 'moon-c.png']: { credit: 'A Painter', license: 'CC BY 4.0', sourceUrl: 'https://example.test/tally' }
    }));
    expect(patched).not.toBeNull();
    expect(checkProvenance(patched!.doc).mayPublish).toBe(true);

    // And the attributions file that ships beside it agrees, rather than still saying it is missing.
    expect(patched!.attributions).not.toContain('_No provenance recorded._');
    expect(patched!.attributions).toContain('https://example.test/tally');
    // The credits that were already right are still there, untouched.
    expect(patched!.attributions).toContain('Runner hull');
    expect(patched!.attributions).toContain('A Cartographer');
  });

  it('the regenerated file keeps the same assets in the same sections', () => {
    const doc = JSON.parse(JSON.stringify(opened.doc));
    const before = collectAttributions(doc);
    const patched = creditedDoc(doc, 'starmap', claim({
      [IMAGES_DIR + 'moon-c.png']: { credit: 'A Painter' }
    }))!;
    for (const e of before) expect(patched.attributions).toContain(e.path);
    expect(patched.attributions).toContain('## 3D models');
    expect(patched.attributions).toContain('## Images');
  });
});
