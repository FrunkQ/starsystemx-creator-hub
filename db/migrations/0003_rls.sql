-- Row level security: deny by default.
--
-- The hub's Worker talks to Postgres with the SERVICE ROLE and bypasses all of this, so RLS is
-- defence in depth rather than the primary control. It exists because a Supabase project also
-- carries an ANON key that reaches the same database, and an anon key that can read `reports`,
-- `admin_actions` or an unreviewed asset row is a leak with no code change required to cause it.
--
-- THE ONE RULE WORTH READING: there is no anon policy that exposes an asset's bytes or an
-- unreviewed asset row. Serving is the Worker's job and it consults the ledger every time (6.2).

alter table creators      enable row level security;
alter table assets        enable row level security;
alter table systems       enable row level security;
alter table system_assets enable row level security;
alter table asset_claims  enable row level security;
alter table bodies        enable row level security;
alter table constructs    enable row level security;
alter table hearts        enable row level security;
alter table reports       enable row level security;
alter table config        enable row level security;
alter table upload_events enable row level security;
alter table admin_actions enable row level security;

-- Public, published maps and their normalised content are readable by anyone. Download needs no
-- account (design 2), so this is genuinely anonymous read.
create policy systems_public_read on systems for select
  using (state = 'public' and visibility = 'public');

create policy bodies_public_read on bodies for select
  using (exists (select 1 from systems s
                 where s.id = bodies.system_id and s.state = 'public' and s.visibility = 'public'));

create policy constructs_public_read on constructs for select
  using (exists (select 1 from systems s
                 where s.id = constructs.system_id and s.state = 'public' and s.visibility = 'public'));

-- A creator reads their own work in any state.
create policy systems_own_read on systems for select using (creator_id = auth.uid());

-- Hearts: readable in aggregate via systems.hearts_count; a row is yours alone.
create policy hearts_own on hearts for all using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Reports are write-only from the reporter's side. Deliberately NO select policy: a reporter
-- cannot enumerate what anyone else reported, and nobody but the service role reads the queue.
create policy reports_insert_own on reports for insert with check (reporter_id = auth.uid());

-- Everything else - assets, system_assets, asset_claims, config, upload_events, admin_actions -
-- has RLS on and NO policy, which in Postgres means: nothing gets through except the service role.
