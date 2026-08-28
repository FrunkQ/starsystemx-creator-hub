-- Creator write-ups and screenshots, the attestation record, and the Patreon/Discord hooks.
--
-- Three separate things land together because they share one idea: the hub's account is the hinge.
-- A creator writes up their map, takes responsibility for its provenance, and their identity links
-- outward to Discord (a badge) and Patreon (a tier). All of it hangs off `creators.id`.

-- ---------------------------------------------------------------------------------------------
-- 1. The capability marker, and legacy stamping
-- ---------------------------------------------------------------------------------------------
-- TWO DIFFERENT VERSIONS, and conflating them is the mistake this guards against:
--
--   bundle_format  a CONTRACT number. "can this parser read this layout at all". Bumped only on a
--                  breaking layout change. Already present.
--   created_with   a CAPABILITY MARKER. "what could the app do when this was made". This is the
--                  engine's existing `appVersion` build stamp, and it is NOT a parse gate - a
--                  future SSE loads an older map fine. It tells a reader which features to expect
--                  and lets us find every map made before some capability existed.
alter table systems add column created_with text;

-- A map uploaded before the engine stamped anything. We base-stamp it as format 1 ourselves rather
-- than refuse it - the pre-stamp layout is known and stable, and refusing it would close the hub to
-- every save anyone currently has. Recorded so the assumption is visible rather than invisible.
alter table systems add column legacy_stamped boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. The creator's write-up and screenshots
-- ---------------------------------------------------------------------------------------------
-- The pitch. `description` already exists; these are the parts a creator writes to attract people
-- rather than parts derived from the bundle.
alter table systems add column blurb text;
alter table systems add column tags text[] not null default '{}';

-- SCREENSHOTS ARE ORDINARY ASSETS AND GO THROUGH THE ORDINARY LEDGER. That is the whole point of
-- keying moderation on bytes: a creator-uploaded screenshot is reviewed exactly like a bundled
-- picture, is deduped against it, and inherits an existing verdict if those bytes are already known.
-- No second moderation path, because a second path is a second thing to get wrong.
create table system_screenshots (
  system_id  uuid     not null references systems (id) on delete cascade,
  sha256     char(64) not null references assets (sha256),
  ordinal    integer  not null,
  caption    text,
  created_at timestamptz not null default now(),
  primary key (system_id, sha256)
);
create index system_screenshots_order_idx on system_screenshots (system_id, ordinal);

-- ---------------------------------------------------------------------------------------------
-- 3. The attestation - "we have to assume they are honest, and they take responsibility"
-- ---------------------------------------------------------------------------------------------
-- A creator may credit everything to themselves and there is no way to disprove it. So the hub does
-- the one thing it honestly can: it ASKS, plainly, and RECORDS the answer.
--
-- Append-only and versioned on purpose. If the wording changes, an old attestation still says what
-- was actually agreed to at the time - which is the only thing that makes it worth anything if a
-- claim is ever disputed. Never update a row here; insert a new one.
create table attestations (
  id           uuid primary key,
  system_id    uuid not null references systems (id) on delete cascade,
  -- NOT cascade: who took responsibility must outlive the account, for the same reason a
  -- moderation verdict does.
  creator_id   uuid references creators (id) on delete set null,
  -- Which wording they agreed to. Bump in code when the text changes.
  text_version integer not null,
  -- The exact text shown, stored with the answer. A version number alone is a promise that the
  -- deploy history is intact; the text is the evidence.
  text_shown   text not null,
  attested_at  timestamptz not null default now()
);
create index attestations_system_idx on attestations (system_id, attested_at desc);

-- ---------------------------------------------------------------------------------------------
-- 4. Linked identities - Discord and Patreon
-- ---------------------------------------------------------------------------------------------
create type identity_provider as enum ('discord', 'patreon');

create table creator_identities (
  creator_id       uuid not null references creators (id) on delete cascade,
  provider         identity_provider not null,
  -- The provider's own id for this person. UNIQUE per provider: one Discord account cannot be
  -- linked to two hub accounts, or a single Patreon pledge could grant Pro to a dozen of them.
  provider_user_id text not null,
  handle           text,
  avatar_url       text,
  -- Refresh tokens live here and NOWHERE in the client. Null when the provider does not issue one
  -- or when the link is identity-only.
  refresh_token    text,
  scopes           text[] not null default '{}',
  linked_at        timestamptz not null default now(),
  last_synced_at   timestamptz,
  primary key (creator_id, provider),
  unique (provider, provider_user_id)
);

-- ---------------------------------------------------------------------------------------------
-- 5. Entitlements - what a creator is entitled to, and WHY
-- ---------------------------------------------------------------------------------------------
-- Deliberately a grant LEDGER rather than a tier column that somebody sets. The same three
-- questions come up every time and only a ledger answers them: why does this person have Pro, when
-- does it lapse, and what happens when they cancel but a manual grant is also in play.
create type entitlement_source as enum ('patreon', 'manual', 'grandfathered', 'gift');

create table entitlements (
  id           uuid primary key,
  creator_id   uuid not null references creators (id) on delete cascade,
  source       entitlement_source not null,
  tier         account_tier not null,
  -- The provider's id for the thing that granted this - a Patreon member id, say - so a webhook
  -- can find the row it needs to revoke without guessing.
  external_ref text,
  note         text,
  granted_by   uuid references creators (id) on delete set null,
  granted_at   timestamptz not null default now(),
  -- Null means open-ended. A Patreon grant sets this to the paid-through date so a missed webhook
  -- degrades into a lapse rather than into free Pro forever.
  expires_at   timestamptz,
  revoked_at   timestamptz
);
create index entitlements_active_idx on entitlements (creator_id) where revoked_at is null;
create index entitlements_ref_idx on entitlements (source, external_ref);

-- The effective tier: the best ACTIVE grant. Free when there is none.
create or replace function creator_tier(p_creator_id uuid) returns account_tier
language sql stable as $$
  select coalesce(
    (select 'pro'::account_tier
       from entitlements
      where creator_id = p_creator_id
        and tier = 'pro'
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      limit 1),
    'free'::account_tier
  );
$$;

-- Denormalised onto `creators` so a page render does not need the subquery. Maintained by trigger;
-- `creator_tier()` above stays the source of truth and can always recompute it.
alter table creators add column account_tier account_tier not null default 'free';

create or replace function refresh_creator_tier() returns trigger language plpgsql as $$
declare target uuid;
begin
  target := coalesce(new.creator_id, old.creator_id);
  update creators set account_tier = creator_tier(target) where id = target;
  return null;
end $$;

create trigger entitlements_refresh_tier
  after insert or update or delete on entitlements
  for each row execute function refresh_creator_tier();

-- ---------------------------------------------------------------------------------------------
-- 6. Badges - what the hub says about someone, OUTWARD
-- ---------------------------------------------------------------------------------------------
-- The inbound direction (Patreon says you paid) is entitlements above. This is the other one: the
-- hub knows things Patreon and Discord do not - that you published a map, that people liked it -
-- and that is what a community badge should actually reward.
create table creator_badges (
  creator_id uuid not null references creators (id) on delete cascade,
  badge      text not null,
  earned_at  timestamptz not null default now(),
  primary key (creator_id, badge)
);

-- ---------------------------------------------------------------------------------------------
-- 7. The outbox - every outbound integration call
-- ---------------------------------------------------------------------------------------------
-- Assigning a Discord role is a network call to somebody else's service, and it will fail. An
-- outbox makes it retryable and IDEMPOTENT instead of a fire-and-forget that silently drops a
-- badge nobody notices is missing for a month.
create type outbox_state as enum ('pending', 'sent', 'failed', 'abandoned');

create table integration_outbox (
  id          uuid primary key,
  kind        text not null,          -- e.g. 'discord.role.add', 'discord.role.remove'
  creator_id  uuid references creators (id) on delete cascade,
  payload     jsonb not null,
  state       outbox_state not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  -- Collapses duplicates: re-deriving the same intent twice must not queue it twice.
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index integration_outbox_pending_idx on integration_outbox (state, created_at)
  where state = 'pending';

-- ---------------------------------------------------------------------------------------------
-- 8. RLS for the new tables - same posture: deny by default
-- ---------------------------------------------------------------------------------------------
alter table system_screenshots  enable row level security;
alter table attestations        enable row level security;
alter table creator_identities  enable row level security;
alter table entitlements        enable row level security;
alter table creator_badges      enable row level security;
alter table integration_outbox  enable row level security;

create policy screenshots_public_read on system_screenshots for select
  using (exists (select 1 from systems s
                 where s.id = system_screenshots.system_id
                   and s.state = 'public' and s.visibility = 'public'));

-- Badges are public: that is what a badge is for.
create policy badges_public_read on creator_badges for select using (true);

-- A creator may see their own linked accounts, but NOT the token column - which is why the app
-- never selects it through the anon key and why there is no policy granting update here.
create policy identities_own_read on creator_identities for select using (creator_id = auth.uid());
create policy entitlements_own_read on entitlements for select using (creator_id = auth.uid());

-- attestations and integration_outbox: RLS on, no policy. Service role only.
