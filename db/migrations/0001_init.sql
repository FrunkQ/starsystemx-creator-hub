-- StarSystemX Creator Hub - initial schema.
--
-- THE INVARIANTS THIS SCHEMA EXISTS TO ENFORCE (creator-hub-design.md 6):
--   1. A moderation verdict is per-HASH, not per-upload. It lives on `assets`, keyed by sha256,
--      and it OUTLIVES the account that uploaded it - or a banned image returns the moment its
--      uploader deletes themselves (design 7.2).
--   2. An upload is never blocked; an unreviewed ASSET is never served. `assets.review_state`
--      is the single source of truth and every read path consults it, including the download.
--   3. Gates are rows, not code. `config` is edited by an admin, never by a deploy.
--   4. A shared hash is refcounted by `system_assets`. Account deletion must not delete bytes
--      another creator's map still references.

-- ---------------------------------------------------------------------------------------------
-- Creators
-- ---------------------------------------------------------------------------------------------
create type creator_state as enum ('active', 'suspended', 'banned');
create type creator_role  as enum ('user', 'admin');

create table creators (
  id            uuid primary key,                  -- matches auth.users.id on Supabase
  handle        text unique not null,
  display_name  text,
  role          creator_role  not null default 'user',
  state         creator_state not null default 'active',
  created_at    timestamptz   not null default now()
);
create index creators_state_idx on creators (state);

-- ---------------------------------------------------------------------------------------------
-- The hash ledger. THE CENTRAL TABLE.
-- ---------------------------------------------------------------------------------------------
-- `sha256` is ALWAYS computed by the hub from the bytes themselves. It is never read off a path.
-- A bundle path may CLAIM a hash (assets/models/<sha256>.glb) and that claim is attacker-supplied:
-- a zip naming a file after an already-approved hash while carrying different bytes would inherit
-- that approval. See docs/contract-with-sse.md C-03.
create type asset_kind    as enum ('model', 'image');
create type review_state  as enum ('novel', 'approved', 'banned');
create type reject_reason as enum ('content', 'copyright', 'spam');

create table assets (
  sha256        char(64) primary key,
  kind          asset_kind   not null,
  byte_size     bigint       not null,
  mime          text         not null,
  review_state  review_state not null default 'novel',
  reject_reason reject_reason,
  -- NOT a cascade. The verdict must survive the reviewer's account and the uploader's (design 7.2).
  reviewed_by   uuid references creators (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  first_seen_at timestamptz  not null default now(),
  -- Queue ordering: highest-impact decisions first (design 6.4).
  usage_count   integer      not null default 0,
  report_count  integer      not null default 0,
  -- Set when behavioural signals flag the upload that introduced this hash (design 6.6). Flagged
  -- assets are moved to the FRONT of the queue; they are never auto-rejected.
  flagged       boolean      not null default false,
  constraint reject_reason_only_when_banned
    check (reject_reason is null or review_state = 'banned')
);
-- The review queue: unreviewed only, flagged first, then by how many maps are waiting on it.
create index assets_queue_idx on assets (review_state, flagged desc, report_count desc, usage_count desc, first_seen_at desc)
  where review_state = 'novel';

-- ---------------------------------------------------------------------------------------------
-- Published entries
-- ---------------------------------------------------------------------------------------------
create type system_state as enum ('draft', 'public', 'hidden', 'removed');
create type bundle_kind  as enum ('starmap', 'system');
-- Phase 4 tier hooks: present in the schema from phase 2, simply not exposed (design 8).
create type visibility   as enum ('public', 'unlisted', 'private');
create type account_tier as enum ('free', 'pro');

create table systems (
  id             uuid primary key,
  slug           text unique not null,
  creator_id     uuid not null references creators (id) on delete cascade,
  title          text not null,
  summary        text,
  description    text,
  kind           bundle_kind  not null,
  -- The format integer read out of the bundle. Recorded so that a future format change can find
  -- everything written by an older parser without re-reading every zip.
  bundle_format  integer not null,
  -- Which tree the creator chose to publish. `false` means computePlayerSnapshot output.
  published_gm_tree boolean not null default false,
  state          system_state not null default 'draft',
  visibility     visibility   not null default 'public',
  cover_sha256   char(64) references assets (sha256),
  hearts_count   integer not null default 0,
  download_count integer not null default 0,
  -- The stored bundle, keyed by its own content hash. Reassembled on download (see 6.2) rather
  -- than served raw, so a withheld asset is withheld from the download too.
  source_bytes   bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index systems_public_idx  on systems (state, visibility, created_at desc);
create index systems_hearts_idx  on systems (hearts_count desc) where state = 'public';
create index systems_creator_idx on systems (creator_id, updated_at desc);

-- ---------------------------------------------------------------------------------------------
-- The refcount, and the per-map asset manifest
-- ---------------------------------------------------------------------------------------------
-- One row per (map, asset) use. Deleting a creator cascades their maps and therefore their rows
-- here - but NOT the `assets` row, which other maps may still reference and whose verdict must
-- persist regardless. Refcount = count(*) over this table for a hash.
create type asset_role as enum ('model', 'node_image', 'player_image', 'cover');

create table system_assets (
  system_id      uuid     not null references systems (id) on delete cascade,
  sha256         char(64) not null references assets (sha256),
  role           asset_role not null,
  -- Where it sat in the bundle, so the download can be reassembled at the same paths.
  bundle_path    text     not null,
  -- The node or player-asset id this belongs to, for the node_image / player_image roles.
  node_ref       text,
  primary key (system_id, bundle_path)
);
create index system_assets_hash_idx on system_assets (sha256);

-- The creator's CLAIM about provenance, per map and asset. Deliberately stored per-map and not on
-- `assets`: two creators can upload the same bytes with different (or contradictory) claims, and
-- the review tool shows the claim beside the image precisely so a reviewer can judge whether it is
-- plausible (design 6.4). It is a claim, never a fact.
create table asset_claims (
  system_id   uuid     not null references systems (id) on delete cascade,
  sha256      char(64) not null references assets (sha256),
  title       text,
  credit      text,
  license     text,
  source_url  text,
  -- Mirrors the engine's own two flags (io/attributions.ts): nothing recorded at all, and the one
  -- combination that is actively wrong rather than merely unrecorded.
  no_provenance boolean not null default false,
  cc_by_breach  boolean not null default false,
  primary key (system_id, sha256)
);

-- ---------------------------------------------------------------------------------------------
-- Normalised content - what the page shows and what search reads
-- ---------------------------------------------------------------------------------------------
create table bodies (
  id          uuid primary key,
  system_id   uuid not null references systems (id) on delete cascade,
  node_id     text not null,
  parent_id   text,
  name        text not null,
  kind        text not null,
  role_hint   text,
  -- The copy-paste JSON snippet for this one node (design 2). Precomputed at upload: the page is
  -- SSR plus a cover image and must be fast at LOADING, not at rendering.
  snippet     jsonb,
  tags        text[] not null default '{}',
  image_sha256 char(64) references assets (sha256),
  unique (system_id, node_id)
);
create index bodies_system_idx on bodies (system_id);
create index bodies_name_idx   on bodies (lower(name));

create table constructs (
  id          uuid primary key,
  system_id   uuid not null references systems (id) on delete cascade,
  node_id     text not null,
  parent_id   text,
  name        text not null,
  kind        text not null,
  role_hint   text,
  snippet     jsonb,
  tags        text[] not null default '{}',
  model_sha256 char(64) references assets (sha256),
  image_sha256 char(64) references assets (sha256),
  unique (system_id, node_id)
);
create index constructs_system_idx on constructs (system_id);

-- ---------------------------------------------------------------------------------------------
-- Community
-- ---------------------------------------------------------------------------------------------
-- One heart per user per system - the constraint IS the primary key (design 6.5).
create table hearts (
  creator_id uuid not null references creators (id) on delete cascade,
  system_id  uuid not null references systems (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (creator_id, system_id)
);

create type report_target as enum ('system', 'asset');
create type report_state  as enum ('open', 'actioned', 'dismissed');

create table reports (
  id           uuid primary key,
  -- Signed-in reporters only: an anonymous report button is a griefing tool (design 6.5).
  reporter_id  uuid not null references creators (id) on delete cascade,
  target       report_target not null,
  system_id    uuid     references systems (id) on delete cascade,
  sha256       char(64) references assets (sha256),
  reason       text not null,
  detail       text,
  state        report_state not null default 'open',
  created_at   timestamptz not null default now(),
  -- One report per person per target: ten reports on one image is one decision, not ten (6.5).
  -- Collapsing happens on `assets.report_count`; this stops one reporter inflating it.
  constraint report_target_matches check (
    (target = 'system' and system_id is not null) or (target = 'asset' and sha256 is not null)
  )
);
create unique index reports_one_per_reporter_system on reports (reporter_id, system_id) where target = 'system';
create unique index reports_one_per_reporter_asset  on reports (reporter_id, sha256)    where target = 'asset';
create index reports_open_idx on reports (state, created_at desc) where state = 'open';

-- ---------------------------------------------------------------------------------------------
-- Gates - a config table, not code (design 6.3)
-- ---------------------------------------------------------------------------------------------
create table config (
  key        text primary key,
  value      jsonb not null,
  note       text,
  updated_by uuid references creators (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Rate limiting reads this. Only NOVEL hashes count against the daily allowance, so a creator
-- iterating on their own map does not burn the quota by lunchtime (design 6.3).
create table upload_events (
  id            uuid primary key,
  creator_id    uuid not null references creators (id) on delete cascade,
  system_id     uuid references systems (id) on delete set null,
  novel_hashes  integer not null default 0,
  total_hashes  integer not null default 0,
  bytes         bigint  not null default 0,
  is_update     boolean not null default false,
  flagged       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index upload_events_window_idx on upload_events (creator_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Audit. An admin action is always recorded - who, what, when, why (design 6.7).
-- ---------------------------------------------------------------------------------------------
-- Not bureaucracy: when a creator asks why their map vanished, the answer must exist.
create table admin_actions (
  id         uuid primary key,
  actor_id   uuid references creators (id) on delete set null,
  action     text not null,
  target     text not null,
  reason     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index admin_actions_recent_idx on admin_actions (created_at desc);
