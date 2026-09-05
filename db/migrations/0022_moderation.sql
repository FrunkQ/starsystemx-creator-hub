-- Moderation of people, and account deletion (owner, 2026-09-05; docs/decisions.md D-28).
--
-- Run after 0021. Safe to run twice. Tolerated unrun by the writes (state_note is dropped from
-- an update the schema cannot hold yet) but NOT by deletion with "keep my comments": until the
-- comment's creator link is nullable, deleting a creator cascades their comments away.

-- 1. A COMMENT CAN OUTLIVE ITS AUTHOR. Deleting an account is the person's right and the hub's
--    tool against spam; whether their comments go with them is the person's choice (the owner:
--    "user will have option on account removal"). A kept comment shows as "a former explorer".
alter table comments alter column creator_id drop not null;
alter table comments drop constraint if exists comments_creator_id_fkey;
alter table comments add constraint comments_creator_id_fkey
  foreign key (creator_id) references creators (id) on delete set null;

-- 2. WHY. A suspended or banned account, and a map taken down, each carry the reason in plain
--    words for the person it happened to. The terms promise "we will usually say why, because that
--    is decent"; this is where the saying lives. The audit log keeps who and when.
alter table creators add column if not exists state_note text;
alter table systems  add column if not exists state_note text;
