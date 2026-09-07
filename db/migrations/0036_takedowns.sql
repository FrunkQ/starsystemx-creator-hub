-- Takedown requests, catalogued and kept (owner, 2026-09-07; D-69).
-- Run after 0035. Safe to run twice.
--
-- The owner: "takedowns should be catalogued and managed in the moderation stuff. eg: it is listed
-- there and will stay there until resolved one way or another" - and, when asked whether any of it
-- should go to Discord: "It stays in the hub - a moderator page to see incoming requests and
-- whether the info was removed or the request ignored. Stored forever alongside who the takedown
-- came from - just so we can track these for good."
--
-- WHY THIS IS NOT A `reports` ROW, which was the first thing to try:
--   * `reports.reporter_id` is `not null references creators` - a copyright claimant is a stranger
--     with no account, and the table cannot hold one.
--   * its check constraint demands a system_id or a sha256; a claim often arrives as a URL that
--     resolves to neither, or as a description of a work.
--   * a report is a NUDGE from a member. A takedown is a legal claim from outside, kept as a record
--     of what was asked and what the hub did about it. Different actor, different lifecycle.
--
-- ============================================================================================
-- THE ONE THING THAT MUST NOT BE GOT WRONG: `system_id` is `on delete set null`, NEVER cascade.
--
-- Taking the map down is very often the OUTCOME. On a cascade, acting on a claim would delete the
-- record of the claim - so the hub would destroy its own evidence at exactly the moment it most
-- needs it, and a second claim about the same work a year later would arrive with no history. The
-- URL and the title are copied in as TEXT for the same reason: they still read after the map is
-- gone.
-- ============================================================================================
--
-- STORED FOREVER, the owner's words. There is deliberately no delete path in the hub: resolving a
-- takedown moves it out of the open list, it does not remove it. Deleting a creator does not touch
-- these rows either - the claim is about what the hub published, not about who is still a member.

create type takedown_state as enum ('open', 'actioned', 'rejected', 'withdrawn');

create table if not exists takedowns (
  id              uuid primary key,
  created_at      timestamptz not null default now(),

  -- WHO IT CAME FROM, as they gave it. Kept because a claim with no claimant cannot be answered,
  -- checked, or defended - and because the same name arriving repeatedly is itself information.
  claimant_name   text,
  claimant_email  text not null,

  -- WHAT THEY POINTED AT. The url as typed, the map if the hub could resolve it, and the title at
  -- the time - so the row still says what it was about once the map is gone.
  url             text,
  system_id       uuid references systems (id) on delete set null,
  system_title    text,
  detail          text not null,

  -- HOW IT ENDED. `open` until somebody says otherwise; `actioned` = the material came down;
  -- `rejected` = the hub judged it not to be a valid claim; `withdrawn` = the claimant said so.
  -- The note is required by the code when leaving `open`, not by a constraint here: a check that
  -- fires on the last step of a moderation form is a worse experience than a sentence on the page.
  state           takedown_state not null default 'open',
  resolved_at     timestamptz,
  resolved_by     uuid references creators (id) on delete set null,
  outcome         text,

  -- Whether the notice reached an admin's inbox. The mail is the ALERT; this table is the record,
  -- and a claim that failed to mail must still be visible in the queue.
  mailed          boolean not null default false
);

-- The open ones first, which is the only ordering the queue ever wants.
create index if not exists takedowns_open_idx on takedowns (created_at desc) where state = 'open';
create index if not exists takedowns_system_idx on takedowns (system_id) where system_id is not null;

-- RLS ON, NO POLICIES - the standing rule from 0003, and the one 0029 shipped without and had to be
-- corrected for. Every read and write here goes through the service role in the Worker, so nothing
-- needs a policy; the anon key must reach none of it. This table holds a stranger's name and email.
alter table takedowns enable row level security;

comment on table takedowns is
  'Copyright and takedown claims from outside the hub. Kept permanently: resolving one moves it out '
  'of the open queue, it is never deleted. system_id is set null on map deletion because taking the '
  'map down is usually the outcome and the record must outlive it.';
