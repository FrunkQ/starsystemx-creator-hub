// Credit that points at the object, follows a copy of a copy back to its original, and runs the
// other way: "used in".
import { describe, it, expect } from 'vitest';
import { buildClip, deepLink, nodeFromHash, slugOfUrl, originChain } from '../src/lib/bundle/clip';
import { normalise, creditSlugs } from '../src/lib/bundle/normalise';

const src = { site: 'Explorers', url: 'https://x/s/beta', title: 'Beta', creator: 'bob' };

describe('a deep link', () => {
  it('names the object on its page, and reads back', () => {
    expect(deepLink('https://x/s/beta', 'sol sun')).toBe('https://x/s/beta#node=sol%20sun');
    expect(deepLink('https://x/s/beta#node=old', 'p')).toBe('https://x/s/beta#node=p');
    expect(nodeFromHash('#node=sol%20sun')).toBe('sol sun');
    expect(nodeFromHash('#other')).toBeNull();
    expect(nodeFromHash('')).toBeNull();
  });

  it('is what a clip carries as its source url', () => {
    const clip = buildClip([{ node_id: 'e', parent_id: null, snippet: { id: 'e' } }], 'e', src)!;
    expect(clip.source.url).toBe('https://x/s/beta#node=e');
    expect(clip.source.chain).toBeUndefined();
  });
});

describe('the slug in a hub url', () => {
  it('is found whatever the host and whatever follows', () => {
    expect(slugOfUrl('https://explorers.starsystemx.com/s/local-neighbourhood#node=sol')).toBe('local-neighbourhood');
    expect(slugOfUrl('https://old-host.workers.dev/s/Local-Neighbourhood')).toBe('local-neighbourhood');
    expect(slugOfUrl('https://x/browse')).toBeNull();
    expect(slugOfUrl(null)).toBeNull();
  });
});

describe('the chain back to the true source', () => {
  const alphaCredit = { title: 'Alpha', creator: 'alice', url: 'https://x/s/alpha#node=earth', chain: [] };

  it('is empty for an object made in the map it is copied from', () => {
    expect(originChain({ node_id: 'e', parent_id: null, snippet: {}, tags: ['world/terran'] }, [alphaCredit])).toEqual([]);
  });

  it('names the map an object was pasted from, with its cartographer, from the credits', () => {
    const root = { node_id: 'e', parent_id: null, snippet: {}, tags: ['origin/hub=https://x/s/alpha#node=earth'] };
    expect(originChain(root, [alphaCredit])).toEqual([{ url: 'https://x/s/alpha#node=earth', title: 'Alpha', creator: 'alice' }]);
  });

  it('matches the credit by map even when the object link differs', () => {
    const root = { node_id: 'e', parent_id: null, snippet: {}, tags: ['origin/hub=https://x/s/alpha#node=mars'] };
    expect(originChain(root, [alphaCredit])[0].creator).toBe('alice');
  });

  it('keeps the url even when no credit explains it', () => {
    const root = { node_id: 'e', parent_id: null, snippet: {}, tags: ['origin/hub=https://x/s/mystery'] };
    expect(originChain(root, [])).toEqual([{ url: 'https://x/s/mystery', title: null, creator: null }]);
  });

  it('carries the earlier chain first: a copy of a copy still names the original', () => {
    // Gamma pasted from Beta, which had pasted from Alpha. Copying out of Gamma names Alpha first.
    const betaCredit = {
      title: 'Beta', creator: 'bob', url: 'https://x/s/beta#node=e',
      chain: [{ url: 'https://x/s/alpha#node=earth', title: 'Alpha', creator: 'alice' }]
    };
    const root = { node_id: 'e2', parent_id: null, snippet: { id: 'e2' }, tags: ['origin/hub=https://x/s/beta#node=e'] };
    const clip = buildClip([root], 'e2', { ...src, url: 'https://x/s/gamma', title: 'Gamma', creator: 'carol' }, [betaCredit])!;
    expect(clip.source.chain).toEqual([
      { url: 'https://x/s/alpha#node=earth', title: 'Alpha', creator: 'alice' },
      { url: 'https://x/s/beta#node=e', title: 'Beta', creator: 'bob' }
    ]);
    expect(clip.source.url).toBe('https://x/s/gamma#node=e2');
  });
});

describe('what a save says about its credits, read back', () => {
  it('keeps the chain and derives the slugs for "used in"', () => {
    const n = normalise({ nodes: [], contentCredits: [{
      title: 'Beta', creator: 'bob', url: 'https://x/s/beta#node=e',
      chain: [{ url: 'https://x/s/alpha#node=earth', title: 'Alpha', creator: 'alice' }, { url: 'javascript:no' }]
    }] });
    expect(n.contentCredits[0].chain).toEqual([{ url: 'https://x/s/alpha#node=earth', title: 'Alpha', creator: 'alice' }]);
    expect(creditSlugs(n.contentCredits).sort()).toEqual(['alpha', 'beta']);
  });
});
