// The columns a card is drawn from, in ONE place, so the front page, /browse, the account page
// and the list API read the same shape - and so a column the database does not have YET is
// dropped from the read rather than failing the whole page (tolerant.ts). A push deploys in
// minutes; the migration that adds the column runs when the owner pastes it, which can be later.
import type { SystemRow } from './database.types';

export const CARD_COLUMNS = [
  'slug', 'title', 'summary', 'blurb', 'kind', 'cover_sha256', 'hearts_count', 'comments_count',
  'info_density', 'download_count', 'auto_tags', 'tags', 'body_count', 'construct_count', 'system_count'
] as const;

/** Columns a card read survives without: each named by a migration that may not have run. */
export const CARD_OPTIONAL = ['comments_count', 'info_density'] as const;

export type CardRow = Pick<SystemRow,
  'slug' | 'title' | 'summary' | 'blurb' | 'kind' | 'cover_sha256' | 'hearts_count' | 'download_count' |
  'auto_tags' | 'tags' | 'body_count' | 'construct_count' | 'system_count'
> & { comments_count?: number; info_density?: number | null };
