-- SSE4 items: two more states, `withdrawn` and `draft` (store packs design 9.6 and question 6,
-- packages SP15 and SP8; D-101). Run after 0044. Safe to run twice.
--
-- ============================================================================================
-- WHAT THIS CHANGES: the list of states `v4_items.state` may hold. Nothing else. No row is
-- rewritten, no column is added or dropped, no file is touched. The check is dropped and added
-- again with two more words in it; adding it reads every row of `v4_items` once to confirm they
-- fit, and that table holds one row per published SSE4 item (a handful today), so it is instant.
--
--   withdrawn  the maker took their own item off the shelf (SP15). Not listed or searched; the file
--              is still served at its exact address, so a campaign that already names it keeps
--              working. The maker can put it back. A moderator's `held` is different: only staff
--              lift it, and a held file is not served.
--   draft      uploaded but not yet published (SP8, accepted by the owner on 27 Nov). Seen only by
--              its maker. Nothing writes it until SP8 is built; it is here so one change covers both.
--
-- UNTIL THIS RUNS the hub works as before: "take it off the shelf" says it is waiting on this
-- change, and nothing else is affected.
-- ============================================================================================

alter table v4_items drop constraint if exists v4_items_state_check;
alter table v4_items add constraint v4_items_state_check
  check (state in ('public', 'held', 'removed', 'withdrawn', 'draft'));

comment on column v4_items.state is
  'public: listed and served. held: a moderator''s hold, not served. removed: kept for the record, never served. withdrawn: taken off the shelf by its maker, not listed, still served at its exact address. draft: not yet published, seen only by its maker (0045).';
