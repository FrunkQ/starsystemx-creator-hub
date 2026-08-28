-- Gate defaults, and the counters the review queue and the refcount depend on.

-- ---------------------------------------------------------------------------------------------
-- The gates (design 6.3). Every one is a row an admin edits, because "tunable and relaxable over
-- time" means a row edit and not a deploy - a limit that needs a deploy to relax is a limit
-- nobody relaxes.
-- ---------------------------------------------------------------------------------------------
insert into config (key, value, note) values
  ('uploads_per_user_per_day', '1',
   'The owner''s number. Counts NOVEL hashes only, so an update to your own map is close to free.'),
  ('zips_allowed', 'true',
   'THE KILL SWITCH. false rejects any upload whose bytes are a zip, collapsing the abuse surface to text. The engine guarantees a plain .json save still loads, so the hub keeps working.'),
  ('max_bundle_bytes', '52428800',
   '50 MB. Cost control. Also the ceiling on what one Worker request will read into memory.'),
  ('max_assets_per_bundle', '200',
   'One map should not carry a gallery.'),
  ('new_account_cooldown_hours', '0',
   'A brand-new account uploading instantly is the classic pattern. 0 = off until evidence asks.'),
  ('novel_hash_limit_per_upload', '40',
   'The abuse signal that matters most (design 6.6). Over this, the upload is FLAGGED to the front of the review queue - never blocked.'),
  ('min_bundle_format', '1',
   'Oldest bundleFormat the parser will accept.'),
  ('max_bundle_format', '1',
   'Newest bundleFormat this deploy understands. A bundle above this is refused POLITELY rather than parsed into a public database (design 4).'),
  ('block_cc_by_breach', 'false',
   'OPEN QUESTION FOR THE OWNER - see docs/decisions.md Q-02. The design gate is missing.length = 0. This adds "CC-BY with no credit" to it, which the engine calls the one combination that is actively wrong. Recommended true; false until asked.'),
  ('accept_unstamped_bundles', 'false',
   'OPEN QUESTION FOR THE OWNER - see docs/decisions.md Q-01. Bundles written before the bundleFormat stamp carry no version at all. false refuses every save made before the stamp lands.');

-- ---------------------------------------------------------------------------------------------
-- usage_count: how many maps are waiting on a review decision, and the refcount that stops
-- account deletion removing bytes another creator's map still references (design 7.2).
-- ---------------------------------------------------------------------------------------------
create or replace function bump_asset_usage() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update assets set usage_count = usage_count + 1 where sha256 = new.sha256;
  elsif tg_op = 'DELETE' then
    update assets set usage_count = greatest(0, usage_count - 1) where sha256 = old.sha256;
  end if;
  return null;
end $$;

create trigger system_assets_usage
  after insert or delete on system_assets
  for each row execute function bump_asset_usage();

-- Reports on one hash collapse into one queue entry with a count (design 6.5).
create or replace function bump_asset_reports() returns trigger language plpgsql as $$
begin
  if new.target = 'asset' then
    update assets set report_count = report_count + 1 where sha256 = new.sha256;
  end if;
  return null;
end $$;

create trigger reports_count_asset
  after insert on reports
  for each row execute function bump_asset_reports();

create or replace function touch_systems_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger systems_touch before update on systems
  for each row execute function touch_systems_updated_at();

-- ---------------------------------------------------------------------------------------------
-- The refcount, as a function rather than a stored column: it is read on deletion paths only and
-- a stored count that drifts is worse than a count that is computed.
-- ---------------------------------------------------------------------------------------------
create or replace function asset_refcount(p_sha256 char(64)) returns integer language sql stable as $$
  select count(*)::integer from system_assets where sha256 = p_sha256;
$$;
