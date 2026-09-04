// The clip: a subtree as one pasteable thing. See src/lib/bundle/clip.ts for the why.
import { describe, it, expect } from 'vitest';
import { buildClip, subtreeOf, clipText } from '../src/lib/bundle/clip';

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
