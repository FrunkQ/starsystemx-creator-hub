-- Device-code pairing, and the app tokens it issues.
--
-- WHY NOT JUST HAND THE APP A SUPABASE SESSION: a session can change the account's email and
-- password. An app token cannot. It is scoped to publishing, it is listed on /account with a name
-- and a last-used date, and the person can revoke it there - so a leaked app token is a nuisance
-- rather than a lost account.
--
-- NOTHING HERE STORES A SECRET IN THE CLEAR. Both the device code and the token are stored as
-- sha256 hashes: the hub can verify what it is shown, and a leak of this table hands over nothing
-- usable. Same reasoning as the asset ledger - the bytes decide, and we keep only the fingerprint.

-- ---------------------------------------------------------------------------------------------
-- 1. The pairing handshake
-- ---------------------------------------------------------------------------------------------
create table device_codes (
  -- The SECRET half, hashed. The app holds the plaintext and proves it on every poll.
  device_code_hash char(64) primary key,

  -- The half a human reads aloud and types. Short, and useless on its own: approving it needs a
  -- signed-in browser session, so knowing a user_code grants nothing.
  user_code        text not null,

  client           text not null,
  client_version   text,

  -- Null until somebody approves it in a browser. That approval is the whole security boundary.
  creator_id       uuid references creators (id) on delete cascade,
  approved_at      timestamptz,

  -- Set when the app has collected its token. A code is single-use; a second poll gets nothing.
  consumed_at      timestamptz,

  -- Rate limiting. An app polling faster than the interval it was given is told to slow down.
  last_polled_at   timestamptz,
  poll_count       integer not null default 0,

  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

-- The lookup the approval page does. Unique only among codes still in play, so a user_code can be
-- reused once its original has expired - with ten-minute lifetimes it otherwise exhausts quickly.
create unique index device_codes_user_code_live
  on device_codes (user_code) where consumed_at is null;
create index device_codes_expiry on device_codes (expires_at);

-- ---------------------------------------------------------------------------------------------
-- 2. The tokens
-- ---------------------------------------------------------------------------------------------
create table app_tokens (
  id           uuid primary key,
  -- sha256 of the token. The plaintext is shown to the app once and never stored.
  token_hash   char(64) not null unique,
  creator_id   uuid not null references creators (id) on delete cascade,

  -- What the person sees on /account: "Star System Explorer 3.0.190 on this computer".
  name         text not null,

  -- Deliberately narrow. A token may publish; it may not touch the account itself.
  scopes       text[] not null default '{publish}',

  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index app_tokens_creator on app_tokens (creator_id) where revoked_at is null;

alter table device_codes enable row level security;
alter table app_tokens   enable row level security;

-- A person may SEE their own tokens (to revoke them). Never the hash, and the app never reads
-- these at all - it holds a token rather than querying for one.
create policy app_tokens_own_read on app_tokens for select using (creator_id = auth.uid());

-- device_codes: RLS on, no policy. Service role only - a pairing handshake is nobody else's
-- business, and being able to list live user_codes would defeat the whole mechanism.

insert into config (key, value, note) values
  ('device_pairing_enabled', 'true',
   'Master switch for in-app sign-in. false makes /api/device/* return 404, which is the kill switch if pairing is ever abused.'),
  ('device_code_ttl_seconds', '600',
   'How long a pairing code is valid. Ten minutes: long enough to walk to another device, short enough that an abandoned code is not left lying around.'),
  ('device_poll_interval_seconds', '5',
   'How often an app may poll. Polling faster is answered with slow_down.');
