// Stripping GM content. The tests lean hard on ONE property: when this says "clean", it must be.
//
// Detection only has to be right when it says YES; stripping has to be right when it says ALL
// CLEAR. A missed marker here is a published secret, not a missing warning.
import { describe, it, expect } from 'vitest';
import { stripGmContent } from '../src/lib/bundle/strip';
import { detectGmContent } from '../src/lib/bundle/gmContent';

describe('stripping GM content', () => {
  it('removes every marker the detector knows about', () => {
    const doc = {
      gmNotes: 'campaign secrets',
      undoHistory: [{ op: 'delete' }],
      nodes: [
        { id: 'a', name: 'A', gmNotes: 'the villain' },
        { id: 'b', name: 'B', tags: [{ key: 'x', secret: true }, { key: 'y' }] },
        { id: 'c', name: 'C', overrides: { anomalies: { tempK: 'reactor' }, tempK: 1100 } },
        { id: 'd', name: 'D', description_playerhidden: true, description: 'the truth' }
      ]
    };
    const r = stripGmContent(doc);
    expect(r.ok).toBe(true);
    expect(detectGmContent(r.doc).hasGmContent).toBe(false);

    // The pinned VALUE survives - a world really is 1100 K. Only the GM's stated REASON goes.
    expect(r.doc.nodes[2].overrides.tempK).toBe(1100);
    expect(r.doc.nodes[2].overrides.anomalies).toBeUndefined();
    // A non-secret tag is untouched.
    expect(r.doc.nodes[1].tags).toEqual([{ key: 'y' }]);
  });

  it('removes a hidden node AND its whole subtree', () => {
    // A moon orbiting a secret planet must not outlive its parent.
    const r = stripGmContent({
      nodes: [
        { id: 'star', name: 'Star' },
        { id: 'p', name: 'Secret planet', parentId: 'star', object_playerhidden: true },
        { id: 'm', name: 'Its moon', parentId: 'p' },
        { id: 'm2', name: 'A moon of the moon', parentId: 'm' }
      ]
    });
    expect(r.ok).toBe(true);
    expect(r.doc.nodes.map((n: any) => n.id)).toEqual(['star']);
  });

  it('drops a whole system when its ROOT is hidden - the GM hide-this-system lever', () => {
    const r = stripGmContent({
      systems: [
        { id: 's1', name: 'Visible', system: { nodes: [{ id: 'a', kind: 'barycenter' }] } },
        { id: 's2', name: 'Hidden', system: { nodes: [{ id: 'b', kind: 'barycenter', object_playerhidden: true }] } }
      ],
      routes: [{ fromId: 's1', toId: 's2' }, { fromId: 's1', toId: 's1' }]
    });
    expect(r.ok).toBe(true);
    expect(r.doc.systems.map((s: any) => s.id)).toEqual(['s1']);
    // A route to a system that no longer exists would dangle.
    expect(r.doc.routes).toEqual([{ fromId: 's1', toId: 's1' }]);
  });

  it('does not mutate the document it was given', () => {
    const doc = { nodes: [{ id: 'a', gmNotes: 'secret' }] };
    stripGmContent(doc);
    expect(doc.nodes[0].gmNotes).toBe('secret');
  });

  it('reports what it took out, in terms a creator can read', () => {
    const r = stripGmContent({
      nodes: [
        { id: 'a', gmNotes: 'x' }, { id: 'b', gmNotes: 'y' },
        { id: 'c', object_playerhidden: true }
      ]
    });
    expect(r.removed.join('; ')).toMatch(/GM notes from 2 objects/);
    expect(r.removed.join('; ')).toMatch(/1 hidden object/);
  });

  it('is a no-op on an already-clean document', () => {
    const r = stripGmContent({ nodes: [{ id: 'a', name: 'A', tags: [{ key: 'world/terran' }] }] });
    expect(r.ok).toBe(true);
    expect(r.removed).toEqual([]);
  });

  it('never throws on hostile input', () => {
    for (const doc of [null, undefined, 42, [], {}, { nodes: null }, { systems: 'x' }]) {
      expect(() => stripGmContent(doc)).not.toThrow();
    }
  });
});
