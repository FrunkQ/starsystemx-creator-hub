-- The custom rules a map carries (owner, 2026-09-08; D-71).
-- Run after 0036. Safe to run twice.
--
-- The owner asked what should happen when somebody copies a body that needs a custom liquid, engine
-- or biosphere, and chose: "1 and 2 should ride on the back... i.e. the site has a browse option for
-- all these custom overrides... and they can be copied and pasted in using the mechanism from 1."
--
-- WHAT THIS IS. Custom definitions do not live on the node - they live on the STARMAP, in
-- `rulePackOverrides`, and the app builds an effective rule pack of shipped-plus-overrides. So a
-- clip of nodes alone arrives somewhere that has never heard of the liquid those nodes name, and
-- the lookup returns undefined WITHOUT COMPLAINING: the body pastes, and its phase, appearance and
-- climate quietly fall back. This column is what lets a clip carry the rules with it.
--
-- ONE COLUMN, NOT AN INDEX TABLE, and that is a deliberate choice about scale rather than laziness.
-- A browse page wants one row per customisation across every map, which looks like a job for a
-- `system_overrides` table - but that table would be DERIVED from this column, and a derived table
-- is a second thing to keep in step on every upload, re-index and takedown. The library has tens of
-- maps. Deriving the list at read time costs nothing at that size and cannot go stale. When it is
-- thousands, index it then - `readOverrides` in src/lib/bundle/overrides.ts is already the one
-- function that would fill it.
--
-- STORED WHOLE AND UNMODIFIED, in the engine's own shape under the engine's own name. The hub reads
-- names out of it for the browse page and carries it to a paste; it never rewrites it. Which node
-- field references which definition is engine knowledge, and a hub that guessed at it would quietly
-- stop carrying a liquid the day somebody invented a new way to name one (D-58's reasoning).
alter table public.systems add column if not exists rule_overrides jsonb;

comment on column public.systems.rule_overrides is
  'starmap.rulePackOverrides from the uploaded save: the GM custom liquids, gases, atmosphere '
  'mixes, pigments, biosphere forms, fuels, engines and sensors. Whole and unmodified. Null when '
  'the map customises nothing, which is most of them.';
