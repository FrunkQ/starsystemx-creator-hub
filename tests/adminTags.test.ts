// ONLY THE ADMIN PUTS A MAP ON THE APP'S STARTER LIST (D-91).
//
// The owner, 2026-09-11: "only the admin may set the `default` tag ... it must be stripped or refused
// when anyone else puts it on a map (upload and edit alike) - tag= now matches cartographer tags, so
// this is the only thing keeping other maps off the app's starter list."
//
// So every door is pinned here, both ways: nobody else can ADD it, and nobody else can TAKE IT OFF.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { keepAdminTags, withAdminTag, isAdminTag, STARTER_TAG, TAG_LIMIT } from '../src/lib/adminTags';
import { sanitiseTags } from '../src/lib/vocabulary';
import { proposeTag, loadVocabulary } from '../src/lib/server/tags';

describe('the rule', () => {
  it('is default, whatever its case or spacing', () => {
    expect(STARTER_TAG).toBe('default');
    for (const t of ['default', 'Default', ' DEFAULT ']) expect(isAdminTag(t), t).toBe(true);
    expect(isAdminTag('defaults')).toBe(false);
    expect(isAdminTag('starter')).toBe(false);
  });

  it('any door but the switch: cannot add it', () => {
    expect(keepAdminTags(['fantasy', 'default'], [])).toEqual(['fantasy']);
    expect(keepAdminTags(['Default'], null)).toEqual([]);
  });

  it('any door but the switch: cannot take it away either', () => {
    // The creator re-uploads, or ticks a different box - the map stays on the starter list.
    expect(keepAdminTags(['hard-sf'], ['fantasy', 'default'])).toEqual(['hard-sf', 'default']);
    expect(keepAdminTags([], ['default'])).toEqual(['default']);
  });

  it('is never the tag the limit cuts', () => {
    const twelve = Array.from({ length: TAG_LIMIT }, (_, i) => 'tag-' + i);
    const out = keepAdminTags(twelve, ['default']);
    expect(out).toHaveLength(TAG_LIMIT);
    expect(out[out.length - 1]).toBe('default');
  });

  it('the switch turns it on and off and touches nothing else', () => {
    expect(withAdminTag(['fantasy'], STARTER_TAG, true)).toEqual(['fantasy', 'default']);
    expect(withAdminTag(['fantasy', 'default'], STARTER_TAG, true)).toEqual(['fantasy', 'default']);
    expect(withAdminTag(['default', 'fantasy'], STARTER_TAG, false)).toEqual(['fantasy']);
  });
});

describe('every door', () => {
  it('the vocabulary never lets it through, even if it got into the list', () => {
    const vocab = [{ label: 'Use', hint: '', tags: ['starter', 'default'] }];
    expect(sanitiseTags(['starter', 'default'], vocab)).toEqual(['starter']);
  });

  it('nor offers it as a box to tick or a filter to pick', async () => {
    // A config row or an old accepted proposal that says `default` must not surface as a choice.
    const sb = {
      from: (table: string) => table === 'config'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: [{ label: 'Use', hint: '', tags: ['starter', 'default'] }] } }) }) }) }
        : { select: () => ({ eq: async () => ({ data: [{ tag: 'default', group_label: 'Use' }], error: null }) }) }
    } as never;
    const groups = await loadVocabulary(sb);
    expect(groups.flatMap((g) => g.tags)).not.toContain('default');
    expect(groups.flatMap((g) => g.tags)).toContain('starter');
  });

  it('a tag proposal for it is refused before anything is written', async () => {
    const sb = { from: () => { throw new Error('nothing should be read or written'); } } as never;
    const result = await proposeTag(sb, { text: 'Default', group: 'Use', creatorId: 'c', systemId: 's', vocabulary: [{ label: 'Use', hint: '', tags: [] }] });
    expect(result.kind).toBe('bad');
  });

  it('upload and the manage page both go through the guard, with what the map already had', () => {
    const ingest = readFileSync('src/lib/server/ingest.ts', 'utf8');
    expect(ingest).toContain('tags: keepAdminTags(shaped.tags, a.previousTags)');
    expect(ingest).toContain("previousTags = Array.isArray(prev?.tags)");
    const manage = readFileSync('src/routes/manage/[id]/+page.server.ts', 'utf8');
    expect(manage).toContain("keepAdminTags(sanitiseTags(form.getAll('tags'), await loadVocabulary(sb)), before.tags)");
  });

  it('a reviewer cannot accept it, merge into it, or apply it', () => {
    const review = readFileSync('src/routes/admin/tags/+page.server.ts', 'utf8');
    expect(review).toContain('if (!systemId || isAdminTag(tag)) return;');
    expect(review).toContain('if (isAdminTag(tag)) return fail(400');
    expect(review).toContain('if (isAdminTag(into)) return fail(400');
  });

  it('the switch is the only other thing that writes it, and it is admin only', () => {
    const writers = globSync('src/**/*.ts').map((f) => f.split('\\').join('/'))
      .filter((f) => f !== 'src/lib/adminTags.ts' && readFileSync(f, 'utf8').includes('withAdminTag('));
    expect(writers).toEqual(['src/routes/s/[slug]/+page.server.ts']);
    const page = readFileSync('src/routes/s/[slug]/+page.server.ts', 'utf8');
    const action = page.slice(page.indexOf('starter: async'));
    expect(action.slice(0, 300)).toContain("if (!env || !isAdmin(locals.viewer)) throw error(404, 'Not found');");
  });
});
