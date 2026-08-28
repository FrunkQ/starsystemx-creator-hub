-- The owner's answers to Q-01 and Q-02, plus configuration for the Patreon/Discord hooks.

-- ---------------------------------------------------------------------------------------------
-- Q-01, answered 2026-08-28: "we can accept unstamped maps as legacy and base stamp them ourselves"
-- ---------------------------------------------------------------------------------------------
update config set value = 'true', note =
  'ANSWERED by the owner 2026-08-28. Saves made before the engine stamped a bundleFormat are accepted as LEGACY and base-stamped by the hub as legacy_bundle_format. Refusing them would have closed the hub to every save anyone currently has.'
  where key = 'accept_unstamped_bundles';

-- ---------------------------------------------------------------------------------------------
-- Q-02, answered 2026-08-28: "faked up attributions should get an upload rejected until the user
-- fills it in"
-- ---------------------------------------------------------------------------------------------
-- A CC-BY licence with no author named is an attribution that has not been filled in - it is the
-- one case where the creator has told us a name is REQUIRED and then not supplied it. So it blocks,
-- alongside provenance that is missing altogether.
update config set value = 'true', note =
  'ANSWERED by the owner 2026-08-28. A CC-BY licence with no credit is an incomplete attribution, and the rule is that an incomplete attribution blocks publishing until the creator fills it in.'
  where key = 'block_cc_by_breach';

insert into config (key, value, note) values
  ('legacy_bundle_format', '1',
   'What an unstamped legacy save is base-stamped as. Bundles carrying their own bundleFormat are never restamped.'),

  ('attestation_text_version', '1',
   'Which wording of the provenance attestation is currently shown at upload. Bump when the text changes; old attestations keep the text they were actually given.'),

  ('max_screenshots_per_system', '8',
   'Creator-uploaded screenshots per map. They go through the same hash ledger and review queue as any other image.'),

  -- --- tier benefits, so a tier is a set of rows and not a branch in code -----------------------
  ('pro_uploads_per_user_per_day', '10',
   'The uploads_per_user_per_day gate for accounts on the pro tier.'),
  ('pro_max_bundle_bytes', '209715200',
   '200 MB for pro. NOTE: this is also a Worker memory ceiling (docs/decisions.md D-03), so raising it far above this needs the streaming upload path first.'),
  ('pro_max_assets_per_bundle', '600',
   'The max_assets_per_bundle gate for accounts on the pro tier.'),

  -- --- Discord ----------------------------------------------------------------------------------
  ('discord_enabled', 'false',
   'Master switch for all Discord integration. Everything is built and inert until this is true and the secrets are set.'),
  ('discord_guild_id', '""',
   'The community server. Role assignment only happens in this guild.'),
  ('discord_role_creator', '""',
   'Role id granted when someone publishes their first map. The hub-earned badge - the one thing Patreon cannot know.'),
  ('discord_role_pro', '""',
   'Role id mirroring the pro tier. LIKELY UNNECESSARY: Patreon has its own native Discord integration that assigns supporter roles directly. Leave blank unless you deliberately want the hub to own this.'),

  -- --- Patreon ----------------------------------------------------------------------------------
  ('patreon_enabled', 'false',
   'Master switch for Patreon entitlements. Inert until true and the secrets are set.'),
  ('patreon_campaign_id', '""',
   'Only members of this campaign grant a tier.'),
  ('patreon_tier_map', '{}',
   'JSON object mapping a Patreon tier id to a hub tier, e.g. {"12345":"pro"}. A row edit, not a deploy - Patreon tier ids change when you restructure your tiers.')
;
