-- Information density (owner, 2026-09-05; docs/decisions.md D-30).
--
-- Run after 0022. Safe to run twice; tolerated unrun (the two columns are dropped from a write
-- the schema cannot hold yet, and the lists read without them).
--
-- How much of a map has been written about, as the hub measures it on upload and re-index
-- (src/lib/bundle/density.ts): the raw score 0..1 to rank and compare against the best on the
-- hub, and the detail behind it (objects that count, how many are described, mean length) for
-- the tooltip and the nudge on the manage page.
alter table systems add column if not exists info_density real;
alter table systems add column if not exists info_detail  jsonb;
create index if not exists systems_density_idx on systems (info_density desc) where state = 'public';
