-- Content credits: which other cartographers' work a map includes, read back out of the save.
--
-- Run after 0017. Safe to run twice. Tolerated when unrun (src/lib/server/tolerant.ts).
--
-- When somebody pastes a clip into their campaign, the engine records who it came from
-- (docs/sse-requirements.md R-16): `contentCredits: [{ title, creator, url, site }]` on the
-- document, printed in ATTRIBUTIONS.md. The hub reads that list on upload and shows it on the
-- page - "includes work from X by Y" with a link back - so credit follows content through as many
-- hands as it passes. Null for a map that carries none.
alter table systems add column if not exists content_credits jsonb;
