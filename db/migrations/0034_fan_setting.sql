-- 0034: which universe a map is fan work OF (D-61).
--
-- The owner, 2026-09-06: "people are going to be putting together their fave sci-fi universe - we
-- need to ensure everyone knows this is fan made content and no liability of ownership is made by
-- the user or SSE."
--
-- ONE NULLABLE COLUMN, and null carries no blame. The hub's notice is unconditional: every map page
-- and every download says the same thing whether this is filled in or not (src/lib/fanWork.ts). A
-- name here makes the notice SPECIFIC - "an unofficial fan work based on Star Trek", naming what is
-- disclaimed - which is a stronger statement than a generic one, and that is the only thing it does.
--
-- WHY NOT A TAG. There is already a Universe tag group and a Game system one, and a setting nearly
-- fits. It is not a tag because a tag is a shared vocabulary that goes through review before it can
-- be used, and a creator must not have to wait for a moderator before they can disclaim somebody
-- else's trademark. Tags are for finding maps; this is a declaration.
--
-- Free text on purpose. `SETTINGS` in src/lib/fanWork.ts is a suggestion list, never a check - the
-- same rule as licences: a setting the hub has not heard of is somebody's real setting.
alter table public.systems add column if not exists fan_setting text;

comment on column public.systems.fan_setting is
  'The existing universe this map is unofficial fan work of, as the creator typed it. Null means '
  'they did not name one - the blanket fan-work notice applies to every map either way.';
