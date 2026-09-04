-- Re-indexing: the derived rows can be rebuilt from the bundle the hub already holds.
--
-- Run after 0019. Safe to run twice; tolerated unrun (src/lib/server/tolerant.ts).
--
-- Every column the hub DERIVES from a save - the tree rows, distances, positions, roles, facets,
-- credits - can now be recomputed from the stored bundle without a re-upload (server/reindex.ts).
-- `reindexed_at` says when that last happened; null means the rows predate the current reader,
-- and the map's page re-indexes it once on first view. Set on every upload and every re-index.
alter table systems add column if not exists reindexed_at timestamptz;
