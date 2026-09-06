// THE VOCABULARY AS THE HUB ACTUALLY SERVES IT, and the proposals waiting to join it (D-40).
//
// ============================================================================================
// THREE LAYERS, read in this order, and the third is the new one:
//   1. `DEFAULT_VOCABULARY` in `$lib/vocabulary` - the curated list, in code.
//   2. the `creator_vocabulary` config row - the owner's override, no deploy needed.
//   3. ACCEPTED ROWS IN `tag_proposals` - words creators asked for and a reviewer said yes to.
//
// The third layer is what makes "accepting it makes it a tag for everyone to use" true on the next
// request rather than the next deploy. It merges into the group the tag was proposed under, and
// creates that group only if the vocabulary has since lost it - a tag whose group has gone is
// still a real tag somebody's map carries, and dropping it silently would take the tag off the map.
// ============================================================================================
import type { Db } from './database.types';
import { DEFAULT_VOCABULARY, vocabularyFrom, type VocabGroup } from '$lib/vocabulary';
import { toSlug } from '$lib/tagProposals';

export interface Proposal {
  tag: string;
  group_label: string;
  state: 'pending' | 'accepted' | 'merged' | 'rejected';
  merged_into: string | null;
  proposed_by: string | null;
  system_id: string | null;
  uses: number;
  note: string | null;
  created_at: string;
}

/** The vocabulary a creator picks from and a submission is validated against. */
export async function loadVocabulary(sb: Db): Promise<VocabGroup[]> {
  const [{ data: row }, accepted] = await Promise.all([
    sb.from('config').select('value').eq('key', 'creator_vocabulary').maybeSingle(),
    acceptedTags(sb)
  ]);
  return mergeAccepted(vocabularyFrom(row?.value ?? null), accepted);
}

/** Accepted custom tags, as `[tag, group]`. Empty when the table is not there yet. */
export async function acceptedTags(sb: Db): Promise<{ tag: string; group_label: string }[]> {
  try {
    const { data, error } = await sb.from('tag_proposals')
      .select('tag, group_label').eq('state', 'accepted');
    if (error) return [];
    return (data ?? []) as { tag: string; group_label: string }[];
  } catch {
    // A deploy that runs ahead of migration 0029 has the curated vocabulary and no custom tags,
    // which is exactly what it had yesterday. Never a broken page.
    return [];
  }
}

/** PURE: fold accepted tags into their groups, in order, without duplicating anything. */
export function mergeAccepted(
  vocab: VocabGroup[], accepted: { tag: string; group_label: string }[]
): VocabGroup[] {
  if (!accepted.length) return vocab;
  const out = vocab.map((g) => ({ ...g, tags: [...g.tags] }));
  for (const { tag, group_label } of accepted) {
    let group = out.find((g) => g.label === group_label);
    if (!group) {
      group = { label: group_label, hint: 'Added by explorers, kept by a reviewer.', tags: [] };
      out.push(group);
    }
    if (!group.tags.includes(tag)) group.tags.push(tag);
  }
  return out;
}

/**
 * A creator asks for a word.
 *
 * IDEMPOTENT AND HONEST ABOUT WHAT ALREADY HAPPENED, because the same word will be asked for by
 * several people and the second person deserves the first person's answer:
 *   - already in the vocabulary   -> `have`, and the caller just applies it
 *   - accepted earlier            -> `have`, same thing
 *   - merged earlier              -> `merged`, and the caller applies what it was merged INTO
 *   - rejected earlier            -> `no`, quietly; asking again does not reopen it
 *   - pending                     -> `waiting`, and the count of people asking goes up
 */
export type ProposeResult =
  | { kind: 'have'; tag: string }
  | { kind: 'merged'; tag: string }
  | { kind: 'waiting'; tag: string }
  | { kind: 'no'; tag: string }
  | { kind: 'bad'; message: string };

export async function proposeTag(
  sb: Db,
  input: { text: string; group: string; creatorId: string; systemId: string; vocabulary: VocabGroup[] }
): Promise<ProposeResult> {
  const tag = toSlug(input.text);
  if (!tag) return { kind: 'bad', message: 'That is not a tag. Two to thirty-two letters, and it cannot be all digits.' };

  const group = input.vocabulary.find((g) => g.label === input.group);
  if (!group) return { kind: 'bad', message: 'That group does not exist.' };

  // Already a tag anybody can pick, in any group: nothing to propose.
  for (const g of input.vocabulary) if (g.tags.includes(tag)) return { kind: 'have', tag };

  const { data: existing } = await sb.from('tag_proposals').select('*').eq('tag', tag).maybeSingle();
  if (existing) {
    const row = existing as unknown as Proposal;
    if (row.state === 'accepted') return { kind: 'have', tag };
    if (row.state === 'merged' && row.merged_into) return { kind: 'merged', tag: row.merged_into };
    if (row.state === 'rejected') return { kind: 'no', tag };
    // Pending: one more person wants it. That is the number a reviewer should see first.
    await sb.from('tag_proposals').update({ uses: (row.uses ?? 1) + 1 }).eq('tag', tag);
    return { kind: 'waiting', tag };
  }

  const { error } = await sb.from('tag_proposals').insert({
    tag,
    group_label: group.label,
    state: 'pending',
    proposed_by: input.creatorId,
    system_id: input.systemId,
    uses: 1
  });
  if (error) return { kind: 'bad', message: 'That could not be saved: ' + error.message };
  return { kind: 'waiting', tag };
}

/** The queue, oldest first: somebody waiting on a word should not be overtaken. */
export async function pendingProposals(sb: Db, limit = 100): Promise<Proposal[]> {
  const { data, error } = await sb.from('tag_proposals')
    .select('*').eq('state', 'pending').order('created_at', { ascending: true }).limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as Proposal[];
}
