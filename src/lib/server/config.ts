// The gates (design 6.3). Rows, not code.
//
// Cached per request only. A gate an admin relaxes must take effect NOW - the whole point of
// putting them in a table was that relaxing one should not need a deploy, and a long-lived cache
// quietly reintroduces the wait it was meant to remove.
import type { Db } from './database.types';

export interface Gates {
  uploads_per_user_per_day: number;
  zips_allowed: boolean;
  max_bundle_bytes: number;
  max_assets_per_bundle: number;
  new_account_cooldown_hours: number;
  novel_hash_limit_per_upload: number;
  min_bundle_format: number;
  max_bundle_format: number;
  accept_unstamped_bundles: boolean;
  block_cc_by_breach: boolean;
  recommend_resave_below_version: string;
  device_pairing_enabled: boolean;
  device_code_ttl_seconds: number;
  device_poll_interval_seconds: number;
  debug_uploads_enabled: boolean;
  debug_invite_ttl_hours: number;
  debug_max_bytes: number;
  debug_retention_days: number;
  legacy_bundle_format: number;
  attestation_text_version: number;
  max_screenshots_per_system: number;

  // Tier benefits. A tier is a set of config rows, not a branch in code - same reasoning as the
  // gates themselves: what Pro is worth will be tuned, and tuning it should not need a deploy.
  pro_uploads_per_user_per_day: number;
  pro_max_bundle_bytes: number;
  pro_max_assets_per_bundle: number;

  // The cover designer (D-22). 'free' for everyone at launch - the owner's call - and a row so it
  // can become a Pro feature without a deploy. `cover_label` is the domain printed on the card.
  cover_designer_tier: 'free' | 'pro';
  cover_label: string;

  // Integrations. All inert until enabled and the secrets are set.
  discord_enabled: boolean;
  discord_guild_id: string;
  discord_role_creator: string;
  discord_role_pro: string;
  /** Incoming-webhook URL of the sharing channel (D-32). Empty = no cross-posting. */
  discord_share_webhook: string;
  patreon_enabled: boolean;
  patreon_campaign_id: string;
  patreon_tier_map: Record<string, string>;
}

// Used only when a key is absent from the table - a missing row must never mean "no limit".
export const GATE_FALLBACKS: Gates = {
  uploads_per_user_per_day: 1,
  zips_allowed: true,
  max_bundle_bytes: 50 * 1024 * 1024,
  max_assets_per_bundle: 200,
  new_account_cooldown_hours: 0,
  novel_hash_limit_per_upload: 40,
  min_bundle_format: 1,
  max_bundle_format: 1,
  // Both ANSWERED by the owner 2026-08-28 - see db/migrations/0006 and docs/decisions.md.
  accept_unstamped_bundles: true,
  block_cc_by_breach: true,
  recommend_resave_below_version: '',
  device_pairing_enabled: true,
  device_code_ttl_seconds: 600,
  device_poll_interval_seconds: 5,
  debug_uploads_enabled: true,
  debug_invite_ttl_hours: 24,
  debug_max_bytes: 100 * 1024 * 1024,
  debug_retention_days: 30,
  legacy_bundle_format: 1,
  attestation_text_version: 1,
  max_screenshots_per_system: 8,

  pro_uploads_per_user_per_day: 10,
  pro_max_bundle_bytes: 200 * 1024 * 1024,
  pro_max_assets_per_bundle: 600,

  cover_designer_tier: 'free',
  cover_label: 'explorers.starsystemx.com',

  discord_enabled: false,
  discord_guild_id: '',
  discord_role_creator: '',
  discord_role_pro: '',
  discord_share_webhook: '',
  patreon_enabled: false,
  patreon_campaign_id: '',
  patreon_tier_map: {}
};

export async function loadGates(sb: Db): Promise<Gates> {
  const { data, error } = await sb.from('config').select('key, value');
  if (error) throw new Error(`config unreadable: ${error.message}`);
  const out = { ...GATE_FALLBACKS } as Record<string, unknown>;
  for (const row of data ?? []) {
    if (row.key in out) out[row.key] = row.value;
  }
  return out as unknown as Gates;
}

export async function setGate(
  sb: Db, key: keyof Gates, value: unknown, adminId: string
): Promise<void> {
  const { error } = await sb.from('config')
    .update({ value, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw new Error(`could not set ${key}: ${error.message}`);
}
