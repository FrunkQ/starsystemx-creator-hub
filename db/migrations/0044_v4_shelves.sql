-- Star System Explorer 4 on Explorers: V4 campaigns and packs, on their own shelves (D-98; SSE4 build
-- plan X2 and tags design 5.7, package TG15). Safe to run twice.
--
-- ============================================================================================
-- WHAT THIS DOES NOT TOUCH: every statement below creates something NEW. No existing table, column,
-- row or stored map is altered. The V3 library (`systems` and everything hanging off it) is exactly
-- as it was; V4 items live beside it, not inside it, because they are a different kind of file
-- (one JSON document, no zip, no images) with a different check.
--
-- LOCKED TO THE SERVER: row-level security ON and NO policies, the standing rule from 0003.
--
-- THE FILE IS SERVED AS STORED. A pack's bytes are never rewritten: SSE4 works out the pack's own
-- content hash from them, and a re-serialised pack would hash differently. `sha256` is the hash of
-- the stored bytes, so anyone can check a download against the listing.
--
-- STATES ARE TEXT WITH A CHECK, not enums, so the file stays safe to run twice (`create type` is not).
-- ============================================================================================

create table if not exists v4_items (
  id                         uuid primary key,
  slug                       text unique not null,
  -- campaign: an SSE4 campaign save (`sse.campaign-save/1`), GM record removed before storing.
  -- pack: an SSE4 pack manifest (`sse.pack/1`), stored byte for byte.
  kind                       text not null check (kind in ('campaign', 'pack')),
  -- Like a map: deleting the account deletes what it published (systems do the same, 0001).
  creator_id                 uuid not null references creators (id) on delete cascade,
  title                      text not null,
  summary                    text,
  -- PACKS: what the manifest says, copied out so a shelf can be listed without opening files.
  pack_id                    text,
  pack_version               text,
  -- The manifest's own kinds (base-physics, physics, universe, game-system, presentation, suite),
  -- plus `tag-set` when a pack carries tags and nothing else.
  pack_kinds                 text[] not null default '{}',
  fictional                  boolean not null default false,
  licence                    text,
  kernel_range               text,
  requires                   jsonb not null default '[]',
  -- Counts of what it provides (flows, templates, dressing rules, tag groups...), for the listing.
  provides                   jsonb not null default '{}',
  -- CAMPAIGNS: the universe it belongs to, the state hash it was saved at, and its event count.
  universe_root              text,
  state_hash                 text,
  event_count                integer,
  -- The pack stack it was made under, `[{id, version}]`, bottom to top.
  stack                      jsonb not null default '[]',
  -- The stored file: its hash, size, and where it is in the bundles bucket (`v4/<sha256>.json`).
  sha256                     char(64) not null,
  byte_size                  integer not null,
  -- Which setting this is unofficial fan work of, if any (D-61, the same field as `systems`).
  fan_setting                text,
  -- public: listed and served. held: kept, not served, with a note (D-79's hold). removed: kept
  -- for the record, never served.
  state                      text not null default 'public' check (state in ('public', 'held', 'removed')),
  hold_note                  text,
  download_count             integer not null default 0,
  -- The upload attestation, with the version of the text that was shown (as for maps).
  attestation_text_version   integer,
  attested_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
-- ONE PACK VERSION, ONCE: a published version is never replaced, only followed by a newer one, so a
-- campaign that names `id@version` always fetches the same bytes.
create unique index if not exists v4_items_pack_version on v4_items (pack_id, pack_version) where kind = 'pack';
create index if not exists v4_items_shelf_idx on v4_items (kind, state, created_at desc);
create index if not exists v4_items_creator_idx on v4_items (creator_id, created_at desc);

-- REPORTS on V4 items. The V3 `reports` table is tied to maps and image hashes by a check, and is
-- left as it is; this is the same shape for the new items.
create table if not exists v4_reports (
  id           uuid primary key,
  reporter_id  uuid not null references creators (id) on delete cascade,
  item_id      uuid not null references v4_items (id) on delete cascade,
  reason       text not null check (reason in ('content', 'copyright', 'spam', 'other')),
  detail       text,
  state        text not null default 'open' check (state in ('open', 'closed')),
  created_at   timestamptz not null default now(),
  -- One report per person per item: ten reports on one pack is one decision, not ten.
  constraint v4_reports_once unique (reporter_id, item_id)
);
create index if not exists v4_reports_open_idx on v4_reports (state, created_at desc) where state = 'open';

alter table v4_items   enable row level security;
alter table v4_reports enable row level security;

comment on table v4_items is
  'SSE4 campaigns and packs (D-98). Beside the V3 library, not in it. Files live in the bundles bucket at v4/<sha256>.json and are served exactly as stored.';
