-- Custom tags, proposed by creators and reviewed before anyone else can use them (D-40).
-- Run after 0028. Safe to run twice.
--
-- The owner, 2026-09-06: "all yah categories should have the option of adding custom tags. With a
-- +. But I will always review and on review page similar named tags (fuzzy search) can be shown
-- next time it and be swapped in on a click instead. Otherwise accepting it makes it a tag for
-- everyone to use."
--
-- ONE TABLE FOR BOTH STATES, because a proposal and an accepted tag are the same row at different
-- moments, and the history is the useful part: who asked for it, on which map, and what a reviewer
-- decided. A merged row keeps `merged_into` so the same word proposed again can be answered
-- instantly and the same way.
--
-- THE VOCABULARY IS STILL CODE plus the `creator_vocabulary` config row (src/lib/vocabulary.ts).
-- Accepted rows here are MERGED INTO it at read time, in their group - so accepting a tag makes it
-- pickable by everyone on the next request, with no deploy and no config edit.
create table if not exists tag_proposals (
  tag           text primary key,                 -- the slug, lowercase, hyphenated
  group_label   text not null,                    -- which vocabulary group it was proposed under
  state         text not null default 'pending',  -- pending | accepted | merged | rejected
  merged_into   text,                             -- the existing tag a reviewer swapped it for
  proposed_by   uuid references creators(id) on delete set null,
  system_id     uuid references systems(id) on delete set null,
  uses          integer not null default 1,       -- how many creators have asked for this word
  note          text,                             -- the reviewer's reason, when there is one
  created_at    timestamptz not null default now(),
  decided_by    uuid references creators(id) on delete set null,
  decided_at    timestamptz,
  constraint tag_proposals_state_ck check (state in ('pending', 'accepted', 'merged', 'rejected'))
);

-- The queue reads pending-first, oldest-first: a creator waiting on a word should not be overtaken.
create index if not exists tag_proposals_state_idx on tag_proposals (state, created_at);
