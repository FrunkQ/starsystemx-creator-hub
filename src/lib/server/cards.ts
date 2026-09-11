// The columns a card is drawn from, in ONE place, so the front page, /browse, the account page
// and the list API read the same shape - and so a column the database does not have YET is
// dropped from the read rather than failing the whole page (tolerant.ts). A push deploys in
// minutes; the migration that adds the column runs when the owner pastes it, which can be later.
import type { SystemRow } from './database.types';

export const CARD_COLUMNS = [
  'slug', 'title', 'summary', 'blurb', 'kind', 'cover_sha256', 'hearts_count', 'comments_count',
  'info_density', 'download_count', 'auto_tags', 'tags', 'body_count', 'construct_count', 'system_count',
  'fan_setting'
] as const;

/** Columns a card read survives without: each named by a migration that may not have run. */
export const CARD_OPTIONAL = ['comments_count', 'info_density', 'fan_setting'] as const;

/** The orders a list of maps can be asked for. The web offers three; the app's panel adds `discussed`. */
export type CardSort = 'loved' | 'new' | 'detailed' | 'discussed';

/**
 * THE ORDER A LIST OF MAPS IS SHOWN IN - one function for the front page, /browse and the app's list,
 * which each carried their own copy of these clauses until D-89.
 *
 * ============================================================================================
 * MAPS WITH PROBLEMS COME LAST, whatever the sort (owner, 2026-09-11: "Problem maps should be
 * deprioritised on searches/browsing"). Not hidden: a map that half-works may still be what somebody
 * is looking for, and it wears its `needs-a-fix` pill wherever it appears (D-88). But a browser
 * should meet every map that opens before any map that might not.
 *
 * IN THE QUERY, NOT AFTER IT. Every list here is cut short in the database - twenty-four, sixty, a
 * page of the app's ten - so sorting the rows once they arrive would only reshuffle a page, and a
 * healthy map just past the cut would lose its place to a broken one inside it.
 *
 * `problems` IS NULL FOR A HEALTHY MAP, so ascending with nulls first puts all of those ahead. Among
 * the maps that do have problems, Postgres orders the lists themselves - a shorter list before a
 * longer one - and the chosen sort applies after that. Fewer problems first is a fair order for the
 * back of the queue; nobody browses there for the ranking.
 *
 * Safe to order on because 0040 has run (2026-09-11). An ORDER on a missing column cannot be
 * tolerated the way a missing projected column can (D-71) - which is also why this lives here, beside
 * the note, rather than in a route where tests/tolerantPages.test.ts would rightly refuse it.
 * ============================================================================================
 */
export function orderCards<Q>(query: Q, sort: CardSort): Q {
  const q = (query as any).order('problems', { ascending: true, nullsFirst: true });
  switch (sort) {
    case 'new':
      return q.order('created_at', { ascending: false });
    case 'detailed':
      // Most written up first (D-30) - the effort the meter rewards, put in front of people.
      return q.order('info_density', { ascending: false, nullsFirst: false }).order('hearts_count', { ascending: false });
    case 'discussed':
      return q.order('comments_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    default:
      return q.order('hearts_count', { ascending: false }).order('created_at', { ascending: false });
  }
}

export type CardRow = Pick<SystemRow,
  'slug' | 'title' | 'summary' | 'blurb' | 'kind' | 'cover_sha256' | 'hearts_count' | 'download_count' |
  'auto_tags' | 'tags' | 'body_count' | 'construct_count' | 'system_count'
> & { comments_count?: number; info_density?: number | null; fan_setting?: string | null };
