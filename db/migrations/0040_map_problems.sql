-- What the hub found wrong with a map, and whether staff have seen it (owner, 2026-09-11; D-88).
-- Run after 0039. Safe to run twice.
--
-- The owner, after a public map was found with every body missing: "Worth having a 'problematic'
-- map status that triggers when it spots something like this - with advice on the issue to help
-- them resolve it themselves." And then: "tags the map with a pill and help", "advises not to
-- publish until fixed. And if published mods/admin get a note that a 'dodgy' map has been
-- uploaded", "A new issues tab near reports/takedowns/comments".
--
-- ============================================================================================
-- A COLUMN OF FINDINGS, NOT A STATE. `systems.state` is PERMISSION (may this be seen) and
-- `hold_note` is a MODERATOR'S judgement (D-79). This is neither: it is what the hub READ in the
-- file - written on upload and on every re-index, from the bytes, by `bundle/problems.ts`. So it
-- clears itself the moment a new version no longer has the problem, and nobody has to remember to
-- take a flag down.
--
-- Null means none. Each entry is { code, severity, title, detail, fix }: the fix is the point, in
-- steps the creator can follow in Star System Explorer.
-- ============================================================================================
alter table public.systems add column if not exists problems jsonb;

comment on column public.systems.problems is
  'What the hub found wrong with this map when it last read the file: a list of '
  '{code, severity, title, detail, fix}. Null means nothing. Rewritten on every upload and re-index, '
  'so it clears itself when the file is fixed.';

-- STAFF HAVE SEEN IT. The Issues tab counts public maps with problems nobody has looked at, and a
-- badge that can never reach zero teaches people to stop reading it - a creator may never fix their
-- map. "Noted" takes it out of the count and leaves the pill and the advice where they are. It is
-- cleared whenever the problems CHANGE, because noting one fault is not noting the next.
alter table public.systems add column if not exists problems_noted_at timestamptz;
alter table public.systems add column if not exists problems_noted_by uuid references creators (id) on delete set null;

create index if not exists systems_problems_idx on public.systems (updated_at desc)
  where problems is not null;
