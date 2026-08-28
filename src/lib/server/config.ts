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
  accept_unstamped_bundles: false,
  block_cc_by_breach: false
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
