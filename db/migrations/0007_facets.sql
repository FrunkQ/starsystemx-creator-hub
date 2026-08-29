-- Derived facets: what is in a map, counted, for the page and for finding it.
--
-- DERIVED AT UPLOAD FROM THE DOCUMENT, never from a creator's claim. The creator's own tags live in
-- `systems.tags` alongside these; `auto_tags` are facts the hub computed and can stand behind.
--
-- WHY TWO TAG COLUMNS RATHER THAN ONE MERGED LIST: a creator can write anything in their own tags,
-- including "player-safe". Keeping the derived ones separate means a filter on `player-safe` returns
-- maps the hub CHECKED, not maps that claimed it. Merge them for display; never for filtering.

alter table systems add column auto_tags text[] not null default '{}';

-- The counts. Small enough to be columns, and columns sort and filter without unpacking JSON.
alter table systems add column system_count    integer not null default 0;
alter table systems add column body_count      integer not null default 0;
alter table systems add column construct_count integer not null default 0;
alter table systems add column carried_images  integer not null default 0;
alter table systems add column carried_models  integer not null default 0;

-- The long tail: per-role and per-namespace counts. JSONB because the key set is the engine's to
-- change, and a new roleHint should not need a migration here.
alter table systems add column role_counts    jsonb not null default '{}'::jsonb;
alter table systems add column tag_namespaces jsonb not null default '{}'::jsonb;

-- Discovery. A GIN index over the derived tags is what makes "show me campaigns with stations and
-- no GM notes" a single indexed query rather than a scan.
create index systems_auto_tags_idx on systems using gin (auto_tags);
create index systems_tags_idx      on systems using gin (tags);

-- Browse ordering: newest-first within the public set, which is the default view.
create index systems_browse_idx on systems (created_at desc)
  where state = 'public' and visibility = 'public';
