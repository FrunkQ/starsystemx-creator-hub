// The gates (design 6.3). Rows, not code.
//
// Cached per request only. A gate an admin relaxes must take effect NOW - the whole point of
// putting them in a table was that relaxing one should not need a deploy, and a long-lived cache
// quietly reintroduces the wait it was meant to remove.
import type { Db } from './database.types';
import { DEFAULT_OPEN_IN_SSE_URL, DEFAULT_ADD_SYSTEM_IN_SSE_URL, DEFAULT_SSE_MANIFEST_URL, DEFAULT_MAIL_FROM } from '$lib/addresses';

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
  max_screenshot_bytes: number;
  max_screenshot_edge: number;
  signups_open: boolean;

  // Tier benefits. A tier is a set of config rows, not a branch in code - same reasoning as the
  // gates themselves: what Pro is worth will be tuned, and tuning it should not need a deploy.
  pro_uploads_per_user_per_day: number;
  trusted_uploads_per_user_per_day: number;
  pro_max_bundle_bytes: number;
  pro_max_assets_per_bundle: number;

  // The cover designer (D-22). 'free' for everyone at launch - the owner's call - and a row so it
  // can become a Pro feature without a deploy. `cover_label` is the domain printed on the card.
  cover_designer_tier: 'free' | 'pro';
  cover_label: string;
  /**
   * MAY THE WORKER DECODE A PICTURE ITSELF? Off, and it should stay off on a free plan (D-53, D-54).
   * Decoding a screenshot in pure JavaScript was measured at 168ms against a 10ms budget, and going
   * over is a 1102 rather than an error page. The creator's browser prepares the pixels instead.
   * Turn this on only somewhere with CPU to spend - it is a fallback, not a feature.
   */
  cover_server_decode: boolean;

  // Integrations. All inert until enabled and the secrets are set.
  discord_enabled: boolean;
  discord_guild_id: string;
  discord_role_creator: string;
  discord_role_pro: string;
  /** Incoming-webhook URL of the sharing channel (D-32). Empty = no cross-posting. */
  discord_share_webhook: string;
  /**
   * The switch (D-51, migration 0031). False stops the posting WITHOUT clearing the webhook - the
   * webhook is a secret, and a switch you have to find a secret to reverse is one nobody uses.
   * Nothing is queued while it is off, so turning it back on does not release a backlog.
   */
  discord_share_enabled: boolean;
  /** Hub badge id -> Discord role id (D-34). Given and taken with the badge, through the bot. */
  discord_badge_roles: Record<string, string>;
  /**
   * "Open in Star System Explorer" (D-35, engine R-17): the engine URL the encoded download URL
   * is appended to, e.g. `https://starsystemx.com/?open=`. Empty until the engine can receive it.
   */
  open_in_sse_url: string;
  /**
   * "Add System to SSE" (D-92, engine R-18): the prefix for a SINGLE SYSTEM, kept apart from
   * `open_in_sse_url` because the engine build that takes one (beta) is not the one campaigns open in
   * (production). Moves to production when the owner releases R-18.
   */
  add_system_in_sse_url: string;
  /**
   * Where the engine serves its shipped-content manifest (R-13, D-36). The hub fetches this instead
   * of keeping hand-copied lists of what SSE ships. MOVES WITH `open_in_sse_url`: both name the
   * engine host, and they should name the same one.
   */
  sse_manifest_url: string;
  /**
   * THE HUB'S OWN MAIL (D-49, migration 0030). `mail_from` is the address it sends as - it must be
   * on the verified Resend domain - and `mail_admin` is where a takedown notice or a review-queue
   * nudge lands. The API key is a Worker secret (`RESEND_API_KEY`), never a row: a row is readable
   * by anything that can read the config table, and a sending key is a sending key.
   *
   * Either one empty means the hub sends nothing, and says so where it would have offered to.
   */
  mail_from: string;
  /**
   * Where the hub writes TO. **Empty means the admins' own sign-in addresses** (D-50) - the hub
   * already knows them, and asking the owner to type in an address it could look up was a row for
   * the sake of a row. Set it to send somewhere else instead: a shared inbox, an alias.
   */
  mail_admin: string;
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
  // WHAT A SCREENSHOT IS ALLOWED TO BE (D-60). Both were hard-coded, and the byte one had been
  // 8 MB since the first week without anybody choosing it. A screenshot is shown at about 1200px
  // and cropped to a 1200x630 cover, so 2048 on the long edge is already generous - and the
  // browser shrinks anything larger BEFORE it is sent, so this is a bandwidth saving as much as a
  // storage one. Raise either from the Config page; neither needs a deploy.
  max_screenshot_bytes: 8 * 1024 * 1024,
  max_screenshot_edge: 2048,
  // THE FRONT DOOR (D-66). A row rather than a deploy, because "close the door for a bit" is a
  // thing an owner needs at two in the morning when something is going wrong, not a thing that
  // should wait for a build. Open by default: a hub nobody can join is the state this replaced.
  signups_open: true,

  pro_uploads_per_user_per_day: 10,
  // A TRUSTED CREATOR'S DAILY ALLOWANCE (D-78). The owner asked for it configurable and named ten.
  // The ordinary limit is ONE, which is a deliberate brake on a stranger; it is the wrong brake on
  // somebody whose uploads are already going out without waiting.
  trusted_uploads_per_user_per_day: 10,
  pro_max_bundle_bytes: 200 * 1024 * 1024,
  pro_max_assets_per_bundle: 600,

  cover_designer_tier: 'free',
  cover_label: 'explorers.starsystemx.com',
  cover_server_decode: false,

  discord_enabled: false,
  discord_guild_id: '',
  discord_role_creator: '',
  discord_role_pro: '',
  discord_share_webhook: '',
  discord_share_enabled: true,
  discord_badge_roles: {},
  // BOTH DEFAULT TO BETA, from `$lib/addresses` - the one file that holds an address. Beta because
  // that is the only build carrying R-13 and R-17: production 404s `/shipped-content.json` and has
  // no `?open=` until the owner makes the read-tree release (measured 2026-09-06).
  open_in_sse_url: DEFAULT_OPEN_IN_SSE_URL,
  // BETA, whatever the campaign prefix says (D-92): production refuses a single system until R-18 is released.
  add_system_in_sse_url: DEFAULT_ADD_SYSTEM_IN_SSE_URL,
  sse_manifest_url: DEFAULT_SSE_MANIFEST_URL,
  mail_from: DEFAULT_MAIL_FROM,
  mail_admin: '',
  patreon_enabled: false,
  patreon_campaign_id: '',
  patreon_tier_map: {}
};

/**
 * Gates that hold an ADDRESS, where an empty row means "nobody has said otherwise" and the code's
 * default stands.
 *
 * Every other gate reads its row literally, and a `0` or a `false` has to mean what it says. An
 * address is different: these rows were created empty by their migrations, before the engine could
 * receive anything, and an empty string there is the absence of an answer rather than an answer.
 * Reading it literally would mean the hub could only ever be pointed at the engine by hand, on
 * every database, which is precisely the fiddling the owner asked to be rid of.
 *
 * THE OFF SWITCH IS STILL REAL: set the row to anything that is not an http(s) URL - `"off"` says
 * it best - and the feature that needs an address is off, because nothing here will build a link
 * out of it (`isHttpUrl`, and `openLink` refuses a prefix that is not one).
 */
const ADDRESS_GATES = ['open_in_sse_url', 'add_system_in_sse_url', 'sse_manifest_url', 'mail_from'] as const;

export async function loadGates(sb: Db): Promise<Gates> {
  const { data, error } = await sb.from('config').select('key, value');
  if (error) throw new Error(`config unreadable: ${error.message}`);
  const out = { ...GATE_FALLBACKS } as Record<string, unknown>;
  for (const row of data ?? []) {
    if (row.key in out) out[row.key] = row.value;
  }
  for (const key of ADDRESS_GATES) {
    if (typeof out[key] !== 'string' || !String(out[key]).trim()) out[key] = GATE_FALLBACKS[key];
  }
  return out as unknown as Gates;
}

/**
 * WRITE ONE CONFIG ROW. Returns null when it worked, or the sentence to show the admin.
 *
 * THE ONE THING THIS EXISTS TO PREVENT: an UPDATE that matches no rows is not an error in
 * Postgres. Written the obvious way, setting a key that has no row returned success, told the
 * admin it had worked, and wrote a `config.set` audit entry saying so - while nothing was written
 * anywhere. A page that lies about having saved is worse than one that refuses, because the admin
 * goes away believing the thing is set and only finds out when the feature does not behave.
 *
 * So the update SELECTS what it changed and an empty result is an error. Rows are created by
 * migrations, deliberately: this is not an upsert, because inventing a row here would also invent
 * an empty `note`, and the note is the only explanation the admin ever reads (see 0035).
 */
export async function setConfigRow(
  sb: Db, key: string, value: unknown, adminId: string
): Promise<string | null> {
  const { data, error } = await sb.from('config')
    .update({ value, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('key');
  if (error) return error.message;
  if (!data || data.length === 0) {
    return `There is no config row called "${key}", so nothing was saved. Rows are created by a migration - check db/migrations for one that adds it, and run it.`;
  }
  return null;
}
