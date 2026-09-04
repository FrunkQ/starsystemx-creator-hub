-- Where things are, and how a creator wants their cover drawn.
--
-- Run after 0014. Safe to run twice. The code that writes these columns is already deployed and
-- tolerates their absence (src/lib/server/tolerant.ts); until this runs the tree falls back to
-- ordering by size, and the cover designer keeps working but forgets its choices on re-upload.

-- ---------------------------------------------------------------------------------------------
-- "How far out", per node (owner, 2026-09-04: "for a starmap it will be distance from origin ...
-- inside a system, orbits")
-- ---------------------------------------------------------------------------------------------
-- distance: the orbit's semi-major axis in AU for a body or construct; for a system's root in a
-- starmap, the map distance from the origin star (the one nearest the map's centre). map_x/map_y:
-- a starmap root's position relative to that origin, for the constellation cover. Null = unknown.
alter table bodies     add column if not exists distance double precision;
alter table bodies     add column if not exists map_x    double precision;
alter table bodies     add column if not exists map_y    double precision;
alter table constructs add column if not exists distance double precision;
alter table constructs add column if not exists map_x    double precision;
alter table constructs add column if not exists map_y    double precision;

-- ---------------------------------------------------------------------------------------------
-- The cover designer's choices (D-22)
-- ---------------------------------------------------------------------------------------------
-- Present only when the cover is one the hub drew to the creator's design; the hub redraws it with
-- the same choices on every re-upload. Null for a real picture or the plain default card.
alter table systems add column if not exists cover_options jsonb;

-- Who may use the designer: 'free' (everyone, the launch setting) or 'pro'. A config row, so it
-- can become a Pro feature without a deploy. Read by src/lib/server/config.ts.
insert into config (key, value, note)
values ('cover_designer_tier', '"free"', 'Who may design a cover: "free" or "pro". Owner: free for now.')
on conflict (key) do nothing;

-- The domain printed bottom-right on a generated cover. Defaults in code to explorers.starsystemx.com.
insert into config (key, value, note)
values ('cover_label', '"explorers.starsystemx.com"', 'The domain printed on generated covers.')
on conflict (key) do nothing;
