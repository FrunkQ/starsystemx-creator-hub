-- Trusted uploaders, and a map that can be put on hold (owner, 2026-09-10; D-78, D-79).
-- Run after 0038. Safe to run twice.
--
-- ============================================================================================
-- TRUSTED (D-78). The owner: "I wanna be able to tag users as 'trusted' in which case their
-- pictures are 'pre-approved' without a manual review and can be used right away. NB: they will
-- still appear on my review list (as pre-approved) and I still have the same control to withdraw
-- them. Just so they get a non-stop workflow. They can also have more relaxed upload limits
-- (configurable) - eg: 10 a day."
--
-- READ THAT SECOND SENTENCE AGAIN, because it is the whole design and it is easy to skip: a trusted
-- creator's pictures are approved WITHOUT WAITING, and they STILL APPEAR IN THE QUEUE. This is not
-- a bypass. It reverses the ORDER of trust and review, it does not remove the review - the reviewer
-- sees everything they saw before, marked, and every power they had they still have.
--
-- WHY THAT ORDER IS SAFE HERE AND NOT IN GENERAL: the hub can withdraw an approval at any time and
-- the ledger keys on BYTES, so banning a hash removes it from every map at once, retrospectively.
-- The cost of being wrong is minutes of exposure, not a permanent hole. That is a very different
-- trade from a system where "approved" cannot be taken back.
--
-- A COLUMN ON `creators`, not a role. Trust is not a rank: a trusted explorer is not staff, cannot
-- see anybody else's unreviewed pictures, and has no moderation powers at all. Folding it into
-- `creator_role` would have made it one, and would have collided with `moderator` the first time
-- somebody was both.
-- ============================================================================================
alter table public.creators add column if not exists trusted boolean not null default false;

comment on column public.creators.trusted is
  'Their uploads are approved on arrival instead of waiting in the queue - and still appear in it, '
  'marked, with every moderator power unchanged. Not a role: confers no ability to see or judge '
  'anybody else content.';

-- AND THE MARK THAT KEEPS THE PROMISE. "They will still appear on my review list (as
-- pre-approved)" is the half of the owner's sentence that makes the rest acceptable, and it needs a
-- way to tell three approvals apart that otherwise look identical in this table:
--
--   a reviewer said yes           reviewed_by is set
--   the hub drew it (D-21)        nothing set, and it is not user content at all
--   a trusted creator uploaded it nothing set, and it IS user content nobody has looked at
--
-- Without this column the third is indistinguishable from the second, and the queue would either
-- fill with the hub's own generated covers or show none of the pictures it is promising to show.
alter table public.assets add column if not exists approved_on_trust boolean not null default false;

comment on column public.assets.approved_on_trust is
  'Approved on arrival because the uploader is trusted, not because anybody looked. Keeps it in the '
  'review queue marked as pre-approved - the reviewer sees it and can still withdraw it.';

create index if not exists assets_pre_approved_idx on public.assets (first_seen_at desc)
  where approved_on_trust and review_state = 'approved';

-- ============================================================================================
-- ON HOLD (D-79). The owner: "We probably need to have a means to 'put a map on hold' - allow peeps
-- to download it with a warning that this file may have problems and to bring it to my attention if
-- it does not work."
--
-- THE STATE THAT WAS MISSING is between `public` and `removed`. Today a map with a suspected fault
-- has two possible answers and both are wrong: leave it up and say nothing, so people download
-- something broken and blame the hub; or take it down, so a map that is probably fine disappears
-- and its creator is punished for a suspicion.
--
-- SO IT IS A FLAG, NOT A `state`. `systems.state` is public/draft/removed and is about PERMISSION -
-- may this be seen. A hold is about CONFIDENCE - does this work. They are different questions and a
-- map can be any combination of them, so folding hold into the state enum would have meant a
-- taken-down map could not also be flagged as broken, and restoring one would silently clear the
-- other.
--
-- THE DOWNLOAD STAYS OPEN, which is the owner's whole point. A file nobody can fetch is a file
-- nobody can diagnose, and the person best placed to say what is wrong with it is the person trying
-- to use it. The warning asks them to say so.
-- ============================================================================================
alter table public.systems add column if not exists hold_note text;
alter table public.systems add column if not exists held_at timestamptz;
alter table public.systems add column if not exists held_by uuid references creators (id) on delete set null;

comment on column public.systems.hold_note is
  'Why this map is on hold, shown to anybody about to download it. Null means not on hold. The map '
  'stays downloadable on purpose: a file nobody can fetch is a file nobody can diagnose.';

create index if not exists systems_held_idx on public.systems (held_at desc) where held_at is not null;
