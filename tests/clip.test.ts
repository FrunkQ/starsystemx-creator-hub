// The clip: a subtree as one pasteable thing. See src/lib/bundle/clip.ts for the why.
import { describe, it, expect } from 'vitest';
import { buildClip, subtreeOf, clipText } from '../src/lib/bundle/clip';
import { normalise } from '../src/lib/bundle/normalise';

const src = { site: 'Explorers', url: 'https://x/s/sol', title: 'Sol' };
const node = (id: string, parent: string | null, extra: Record<string, unknown> = {}) => ({
  node_id: id, parent_id: parent, snippet: { id, parentId: parent, name: id.toUpperCase(), ...extra }
});

const sol = [
  node('sun', null),
  node('earth', 'sun'),
  node('luna', 'earth'),
  node('mars', 'sun'),
  node('sirius', null),   // a different root entirely
  node('sirius-b', 'sirius')
];

describe('collecting a subtree', () => {
  it('takes the root and every descendant, parents before children', () => {
    const ids = subtreeOf(sol, 'sun').map((n) => n.node_id);
    expect(ids[0]).toBe('sun');
    expect(ids.indexOf('earth')).toBeLessThan(ids.indexOf('luna'));
    expect(ids).toEqual(expect.arrayContaining(['sun', 'earth', 'luna', 'mars']));
    expect(ids).not.toContain('sirius');
  });

  it('is a single node when a leaf is chosen', () => {
    expect(subtreeOf(sol, 'luna').map((n) => n.node_id)).toEqual(['luna']);
  });

  it('is empty for an id that is not there', () => {
    expect(subtreeOf(sol, 'nope')).toEqual([]);
    expect(buildClip(sol, 'nope', src)).toBeNull();
  });

  it('terminates on a cycle instead of hanging the page', () => {
    // A file can be damaged or hostile; a node that is its own ancestor must not loop forever.
    const cyclic = [node('a', 'b'), node('b', 'a')];
    expect(subtreeOf(cyclic, 'a').map((n) => n.node_id)).toEqual(['a', 'b']);
  });
});

describe('the clip envelope', () => {
  it('is marked and versioned, so a paste target can recognise it', () => {
    const clip = buildClip(sol, 'earth', src)!;
    expect(clip.sseClip).toBe(1);
    expect(clip.root).toBe('earth');
    // The url names the OBJECT, not the page (0.12.0).
    expect(clip.source).toEqual({ ...src, url: 'https://x/s/sol#node=earth' });
  });

  it('nulls the root parentId: where it lands is the paste target s decision', () => {
    const clip = buildClip(sol, 'earth', src)!;
    expect(clip.nodes[0].id).toBe('earth');
    expect(clip.nodes[0].parentId).toBeNull();
    // ...but a child keeps its link, because that is what makes it a child within the clip.
    expect(clip.nodes.find((n) => n.id === 'luna')?.parentId).toBe('earth');
  });

  it('does not mutate the stored snippet when nulling the root', () => {
    const rows = [node('earth', 'sun'), node('luna', 'earth')];
    buildClip(rows, 'earth', src);
    expect((rows[0].snippet as { parentId: string | null }).parentId).toBe('sun');
  });

  it('drops a snippet that is not an object rather than pasting a scalar', () => {
    const rows = [
      { node_id: 'r', parent_id: null, snippet: { id: 'r' } },
      { node_id: 'c', parent_id: 'r', snippet: 'garbage' as unknown }
    ];
    expect(buildClip(rows, 'r', src)!.nodes).toHaveLength(1);
  });

  it('is pretty-printed text on the clipboard', () => {
    const clip = buildClip(sol, 'luna', src)!;
    const text = clipText(clip);
    expect(text).toBe(JSON.stringify(clip, null, 2));
    expect(text.includes('  "sseClip": 1')).toBe(true);
    expect(JSON.parse(text).nodes).toHaveLength(1);
  });
});

describe('what the engine reads off a pasted node (D-58)', () => {
  // The engine coordinator, 2026-09-06: "the useful ask isn't a new field, it's a promise: that the
  // snippet keeps kind and roleHint... If a future snippetFor ever moved to a whitelist, 'Paste as
  // a new system' would silently stop being offered for every hub clip - no error, just an option
  // quietly greying out."
  //
  // A silent loss is the worst shape of failure, so it is pinned here rather than trusted to a
  // spread operator. It is also why the hub DECLINED to add a `rootKind` to the envelope: the app
  // would have to verify a claim against the nodes anyway (DATA-R4), and a second answer to "what
  // is this clip" is the fault both sides keep unpicking.
  const node = {
    id: 'alpha-a', name: 'Alpha Centauri A', kind: 'body', roleHint: 'star', parentId: null,
    classes: ['star/G2V'], radius_km: 850000, gmNotes: 'the players must not read this',
    image: { url: 'assets/images/alpha-a.png' }, model: { hash: 'deadbeef', url: 'assets/models/x.glb' }
  };
  const shaped = normalise({ nodes: [node] });
  const snippet = shaped.bodies[0].snippet as Record<string, unknown>;

  it('keeps kind and roleHint, which is what decides a clip can land in empty space', () => {
    expect(snippet.kind).toBe('body');
    expect(snippet.roleHint).toBe('star');
  });

  it('still takes out what would paste as a broken link, and the GM material', () => {
    expect(snippet.gmNotes).toBeUndefined();
    expect(snippet.image).toBeUndefined();
    expect(snippet.model).toBeUndefined();
  });

  it('keeps the physical facts a pasted body needs to be itself', () => {
    expect(snippet.id).toBe('alpha-a');
    expect(snippet.name).toBe('Alpha Centauri A');
    expect(snippet.classes).toEqual(['star/G2V']);
    expect(snippet.radius_km).toBe(850000);
  });
});

// ============================================================================================
// NOTHING TRAVELS UNCREDITED. The owner asked directly, 2026-09-06: *"does every copy/paste carry
// its attributions to copy into other maps?"*
//
// The answer has two halves and they meet exactly:
//
//   - An asset the BUNDLE carries (`assets/...`, a `model.hash`) is the only kind the attributions
//     file lists, and it is precisely the kind `snippetFor` REMOVES - it would paste a broken link
//     into somebody else's save. No asset, nothing to credit, nothing orphaned.
//   - An asset that is a real url - somebody else's hosting, or an app-shipped starter model -
//     survives the clip AND KEEPS ITS CREDIT FIELDS, because the snippet is a spread and a deny
//     list (D-58). The ISS is still the ISS, and it is still credited to NASA.
//
// So a clip can never carry a picture without its provenance. The gap that WOULD be a bug is the
// second case losing its credit while keeping its url, so that is what these pin.
// ============================================================================================
describe('a clip never carries art without its credit', () => {
  it('keeps the credit on a picture that travels, because the url still works elsewhere', () => {
    const shaped = normalise({
      nodes: [{
        id: 'iss', name: 'ISS', kind: 'construct', parentId: null,
        image: {
          url: 'https://images.example/iss.jpg',
          title: 'ISS over Earth', credit: 'A Photographer', license: 'CC BY 4.0',
          sourceUrl: 'https://images.example/iss'
        },
        model: { url: '/models/nasa/iss.glb', credit: 'NASA', license: 'Public domain' }
      }]
    });
    // A construct, deliberately: the owner copies stations and megastructures as often as bodies.
    const snippet = shaped.constructs[0].snippet as Record<string, any>;
    expect(snippet.image.url).toBe('https://images.example/iss.jpg');
    expect(snippet.image.credit).toBe('A Photographer');
    expect(snippet.image.license).toBe('CC BY 4.0');
    expect(snippet.image.sourceUrl).toBe('https://images.example/iss');
    expect(snippet.model.credit).toBe('NASA');
  });

  it('removes the WHOLE picture when the bundle carried it, credit and all - never a bare url', () => {
    // A half-stripped image - the url gone but the credit left behind, or the other way round -
    // would be either a broken link or a credit for nothing. It is all or nothing.
    const shaped = normalise({
      nodes: [{
        id: 'b', name: 'Bellwether', kind: 'body', parentId: null,
        image: { url: 'assets/images/b.png', credit: 'A Painter', license: 'CC BY 4.0' },
        model: { hash: 'deadbeef', url: 'assets/models/deadbeef.glb', credit: 'A Modeller' }
      }]
    });
    const snippet = shaped.bodies[0].snippet as Record<string, any>;
    expect(snippet.image).toBeUndefined();
    expect(snippet.model).toBeUndefined();
    expect(JSON.stringify(snippet)).not.toContain('A Painter');
    expect(JSON.stringify(snippet)).not.toContain('A Modeller');
  });

  it('carries the CARTOGRAPHER on the envelope, which is the credit a bundle asset cannot leave with', () => {
    // The map-level half: the engine records this as a content credit on paste (R-16), so the
    // receiving map says "includes work from X by Y" even though no file crossed over.
    const clip = buildClip(
      [{ node_id: 'a', parent_id: null, snippet: { id: 'a', name: 'A' } }],
      'a',
      { site: 'the hub', url: 'https://hub.test/s/m', title: 'A Map', creator: 'A Cartographer' }
    );
    expect(clip?.source.creator).toBe('A Cartographer');
    expect(clip?.source.title).toBe('A Map');
    expect(clip?.source.url).toBe('https://hub.test/s/m#node=a');
  });
});
