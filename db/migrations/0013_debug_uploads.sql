-- Admin-issued one-shot links, so a user can send a broken save for diagnosis.
--
-- ============================================================================================
-- THIS DELIBERATELY BYPASSES EVERYTHING. No account, no attestation, no provenance gate, no hash
-- ledger, no facets, no review queue. That is the point - a file that crashes the parser must be
-- collectable precisely BECAUSE it cannot go through the normal path.
--
-- So the bounds have to do all the work the pipeline usually does:
--   * only an admin can create a link
--   * one upload per link, then it is spent
--   * 24 hours, then it is dead
--   * the file is NEVER served to anyone but an admin, and never enters the public library
--   * it is not parsed, not hashed into the ledger, not indexed, not counted
-- ============================================================================================
--
-- AND THE PART THAT IS EASY TO MISS: a debug upload is the MOST sensitive file on the hub. It is
-- somebody's raw campaign - GM notes, hidden systems, secrets intact - handed over in confidence to
-- get a bug fixed. It has had no redaction and no review. Holding those indefinitely would sit
-- badly beside "we know almost nothing about you, on purpose", so they carry a retention window and
-- the admin list shows their age.

create table debug_invites (
  id           uuid primary key,
  -- sha256 of the link token. The plaintext exists only in the URL the admin sends.
  token_hash   char(64) not null unique,
  created_by   uuid references creators (id) on delete set null,
  -- "Bug #14, Sam's crash on load" - so a stale link is recognisable a week later.
  note         text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Set the moment a file arrives. One link, one upload.
  used_at      timestamptz
);
create index debug_invites_live on debug_invites (expires_at) where used_at is null;

create table debug_uploads (
  id            uuid primary key,
  invite_id     uuid references debug_invites (id) on delete set null,
  -- What the uploader called it, and what they said about it. Both are free text from an
  -- anonymous stranger: display them escaped and never interpret them.
  filename      text not null,
  byte_size     bigint not null,
  user_note     text,
  -- R2 key under the debug/ prefix. Nothing but the admin route ever reads it.
  storage_key   text not null,
  uploaded_at   timestamptz not null default now()
);
create index debug_uploads_recent on debug_uploads (uploaded_at desc);

alter table debug_invites enable row level security;
alter table debug_uploads enable row level security;
-- RLS on, NO policy on either: service role only. There is no view of these for anybody else, and
-- an anonymous uploader must not be able to read back what anyone else sent.

insert into config (key, value, note) values
  ('debug_uploads_enabled', 'true',
   'Master switch for admin debug links. false makes every /debug/* route 404 - the kill switch if a link ever leaks.'),
  ('debug_invite_ttl_hours', '24',
   'How long a debug link works. The owner asked for a day.'),
  ('debug_max_bytes', '104857600',
   '100 MB. Larger than a normal upload on purpose: the files worth diagnosing are often the awkward ones.'),
  ('debug_retention_days', '30',
   'How long a debug upload is kept. These are unredacted campaigns handed over in confidence, so they should not accumulate forever. The admin page shows age; deletion is manual until a cron exists.');
