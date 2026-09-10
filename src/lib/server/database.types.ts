// The schema, in TypeScript. Hand-written to match db/migrations/*.sql.
//
// WHY IT IS WORTH THE DUPLICATION: without it every `sb.from(...)` returns an untyped union and a
// column typo is a runtime 500 in production instead of a red build. With it, renaming a column in
// a migration and forgetting a query breaks `npm run check`.
//
// EVERY ROW SHAPE BELOW IS A `type`, NEVER AN `interface`, AND THAT IS LOAD-BEARING. supabase-js
// constrains a schema's rows to Record<string, unknown>. A TypeScript interface has no implicit
// index signature, so it fails that constraint - and the failure is SILENT: the client falls back
// to `never` and every single query stops type-checking while still compiling. A type alias does
// get the implicit index signature. Do not "tidy" these into interfaces.
//
// KEEP IT IN STEP WITH THE MIGRATIONS. If Supabase CLI is ever wired up, `supabase gen types
// typescript` replaces this file wholesale and that is a straight improvement - the shape is
// deliberately the same one the generator emits.

export type ReviewState = 'novel' | 'approved' | 'banned';
export type RejectReason = 'content' | 'copyright' | 'spam';
export type AssetKind = 'model' | 'image';
export type AssetRole = 'model' | 'node_image' | 'player_image' | 'cover';
export type SystemState = 'draft' | 'public' | 'hidden' | 'removed';
export type BundleKindDb = 'starmap' | 'system';
export type Visibility = 'public' | 'unlisted' | 'private';
export type CreatorRole = 'user' | 'moderator' | 'admin';
// 0035 adds `pending`: joined, email not confirmed yet (D-67). NOT a punishment and not the same
// thing as suspended - a suspended account did something, a pending one has done nothing yet.
export type CreatorState = 'pending' | 'active' | 'suspended' | 'banned';
export type ReportTarget = 'system' | 'asset' | 'comment';
export type ReportState = 'open' | 'actioned' | 'dismissed';
export type AccountTier = 'free' | 'pro';
export type IdentityProvider = 'discord' | 'patreon';
export type EntitlementSource = 'patreon' | 'manual' | 'grandfathered' | 'gift';
export type OutboxState = 'pending' | 'sent' | 'failed' | 'abandoned';

// Supabase's select() parser walks these shapes at the type level. `Relationships` must list any
// foreign key a select() string traverses - e.g. `systems(slug, title)` from `system_assets` - or
// that query resolves to `never` rather than to a row type.
interface Rel<Name extends string, Col extends string, RefTable extends string, RefCol extends string> {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: true;
  referencedRelation: RefTable;
  referencedColumns: [RefCol];
}

interface Table<Row, Relationships extends readonly unknown[] = []> {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
}

export type CreatorRow = {
  id: string;
  handle: string;
  display_name: string | null;
  role: CreatorRole;
  state: CreatorState;
  // 0039: their uploads are approved on arrival AND still appear in the queue, marked (D-78). Not a
  // role - it confers no ability to see or judge anybody else's content.
  trusted?: boolean;
  // 0022: why, in plain words, when suspended or banned. Null when active.
  state_note: string | null;
  // 0024: when they last looked at the comments on their maps. Null = never; everything is new.
  comments_seen_at: string | null;
  /** 0032: when a comment DIGEST was last sent, which is not the same as when they last looked. */
  comments_mailed_at?: string | null;
  account_tier: AccountTier;
  created_at: string;
}

export type AssetRowDb = {
  sha256: string;
  kind: AssetKind;
  byte_size: number;
  mime: string;
  review_state: ReviewState;
  reject_reason: RejectReason | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  first_seen_at: string;
  usage_count: number;
  report_count: number;
  flagged: boolean;
  // 0039: approved on arrival because the uploader is trusted, not because anybody looked (D-78).
  // Keeps it in the review queue MARKED, which is what makes pre-approval acceptable.
  approved_on_trust?: boolean;
}

export type SystemRow = {
  id: string;
  slug: string;
  creator_id: string;
  title: string;
  summary: string | null;
  description: string | null;
  kind: BundleKindDb;
  bundle_format: number;
  published_gm_tree: boolean;
  state: SystemState;
  // 0022: why, in plain words, when taken down by the hub. Null otherwise.
  state_note: string | null;
  visibility: Visibility;
  cover_sha256: string | null;
  hearts_count: number;
  // 0021: live comments under the map, maintained by trigger like hearts_count.
  comments_count: number;
  download_count: number;
  source_bytes: number;
  // The CAPABILITY MARKER - which engine build wrote this. Never a parse gate.
  created_with: string | null;
  legacy_stamped: boolean;
  // What the engine stamps on a save (0014): the campaign's own save counter, and the export-mode
  // LABEL. Both null for older files; `revision` is also null for every single-system save.
  revision: number | null;
  export_mode: string | null;
  // 0015: the creator's cover-designer choices (src/lib/cover/generate.ts CoverOptions), when the
  // cover is one the hub drew. Null means the cover is a real picture, or the plain default card.
  cover_options: unknown;
  // 0018: other cartographers' work this map includes, read from the save (R-16). Null when none.
  content_credits: unknown;
  // 0019: the hub maps those credits point at, by slug, for "used in" on the original's page.
  content_credit_slugs: string[];
  // 0020: when the derived rows were last rebuilt. Null = predates the current reader; re-index once.
  reindexed_at: string | null;
  // 0034: the existing universe this map is unofficial fan work OF, as the creator typed it (D-61).
  // Null means they did not name one - the blanket notice applies to every map either way.
  fan_setting: string | null;
  // 0037: `starmap.rulePackOverrides` from the save - the GM's custom liquids, gases, atmosphere
  // mixes, pigments, biosphere forms, fuels, engines and sensors (D-71). Whole and unmodified, so a
  // clip can carry them to a paste and the browse page can list them. Null for most maps.
  rule_overrides: unknown;
  // 0039: a map with a suspected fault (D-79). Still downloadable - a file nobody can fetch is a
  // file nobody can diagnose - with the note shown to whoever is about to take it. Null = not held.
  hold_note?: string | null;
  held_at?: string | null;
  held_by?: string | null;
  // 0023: how much of the map is written about (bundle/density.ts): the raw 0..1 score, and the
  // detail behind it {total, described, avgLength}. Null until measured.
  info_density: number | null;
  info_detail: unknown;
  blurb: string | null;
  tags: string[];
  // Derived facets (db/migrations/0007). Facts the hub computed, kept separate from `tags` so a
  // filter on `player-safe` returns maps that were CHECKED, not maps that claimed it.
  auto_tags: string[];
  system_count: number;
  body_count: number;
  construct_count: number;
  carried_images: number;
  carried_models: number;
  role_counts: Record<string, number>;
  tag_namespaces: Record<string, number>;
  facet_results: unknown;
  created_at: string;
  updated_at: string;
}

export type SystemScreenshotRow = {
  system_id: string;
  sha256: string;
  ordinal: number;
  caption: string | null;
  created_at: string;
};

export type AttestationRow = {
  id: string;
  system_id: string;
  creator_id: string | null;
  text_version: number;
  text_shown: string;
  attested_at: string;
};

export type CreatorIdentityRow = {
  creator_id: string;
  provider: IdentityProvider;
  provider_user_id: string;
  handle: string | null;
  avatar_url: string | null;
  refresh_token: string | null;
  scopes: string[];
  linked_at: string;
  last_synced_at: string | null;
};

export type EntitlementRow = {
  id: string;
  creator_id: string;
  source: EntitlementSource;
  tier: AccountTier;
  external_ref: string | null;
  note: string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type CreatorBadgeRow = {
  creator_id: string;
  badge: string;
  earned_at: string;
};

export type IntegrationOutboxRow = {
  id: string;
  kind: string;
  creator_id: string | null;
  payload: unknown;
  state: OutboxState;
  attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
  created_at: string;
  sent_at: string | null;
};

export type SystemAssetRow = {
  system_id: string;
  sha256: string;
  role: AssetRole;
  bundle_path: string;
  node_ref: string | null;
}

// 0036. A takedown claim from outside the hub (D-69). KEPT FOREVER - resolving one moves it out of
// the open queue and never deletes it. `system_id` is set null when a map goes, because taking the
// map down is usually the OUTCOME and the record of why must outlive it; `url` and `system_title`
// are copied in as text so the row still reads once the map is gone.
export type TakedownState = 'open' | 'actioned' | 'rejected' | 'withdrawn';

export type TakedownRow = {
  id: string;
  created_at: string;
  claimant_name: string | null;
  claimant_email: string;
  url: string | null;
  system_id: string | null;
  system_title: string | null;
  detail: string;
  state: TakedownState;
  resolved_at: string | null;
  resolved_by: string | null;
  outcome: string | null;
  mailed: boolean;
}

export type AssetClaimRow = {
  system_id: string;
  sha256: string;
  title: string | null;
  credit: string | null;
  license: string | null;
  source_url: string | null;
  no_provenance: boolean;
  cc_by_breach: boolean;
}

export type NodeRow = {
  id: string;
  system_id: string;
  node_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  role_hint: string | null;
  snippet: unknown;
  tags: string[];
  image_sha256: string | null;
  // 0015: "how far out" (AU in orbit; map distance from the origin star for a starmap root) and a
  // starmap root's position relative to the origin. Null when the file said nothing.
  distance: number | null;
  map_x: number | null;
  map_y: number | null;
}

export type ConstructRow = NodeRow & { model_sha256: string | null };

export type HeartRow = {
  creator_id: string;
  system_id: string;
  created_at: string;
}

// 0029 (D-40). A tag a creator asked for. The row is the whole history: pending while it waits,
// then accepted (it joins the vocabulary), merged (a reviewer pointed at the tag that already
// meant this) or rejected. `uses` is how many people have asked for the same word, which is the
// number a reviewer should see first.
export type TagProposalRow = {
  tag: string;
  group_label: string;
  state: 'pending' | 'accepted' | 'merged' | 'rejected';
  merged_into: string | null;
  proposed_by: string | null;
  system_id: string | null;
  uses: number;
  note: string | null;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export type ReportRow = {
  id: string;
  reporter_id: string;
  target: ReportTarget;
  system_id: string | null;
  sha256: string | null;
  // 0024: a report about one comment (target 'comment'); the map it sits under is in system_id.
  comment_id: string | null;
  reason: string;
  detail: string | null;
  state: ReportState;
  created_at: string;
}

// 0021. A comment under a map. Removed, never deleted, by the site: `removed_at` set, by whom and
// under which claim (author | cartographer | admin). Only a cascade deletes the row.
export type CommentRow = {
  id: string;
  system_id: string;
  // Null once its author deleted their account and chose to leave their comments (0022).
  creator_id: string | null;
  body: string;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removed_reason: string | null;
}

export type ConfigRow = {
  key: string;
  value: unknown;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type UploadEventRow = {
  id: string;
  // Null for a refusal before sign-in (0014).
  creator_id: string | null;
  system_id: string | null;
  novel_hashes: number;
  total_hashes: number;
  bytes: number;
  is_update: boolean;
  flagged: boolean;
  // 'ok' or 'refused'; `reason` is the refusal code (0014). Before 0014 only successes were kept.
  outcome: string;
  reason: string | null;
  created_at: string;
}

// Requests and bytes per day and category (0016), for the usage page's limits panel.
export type TrafficDailyRow = {
  day: string;
  category: string;
  requests: number;
  bytes: number;
  // 0017: what arrived (uploads).
  bytes_in: number;
}

// One row per download: a week-scoped visitor hash and nothing else (src/lib/server/visitor.ts).
export type DownloadEventRow = {
  id: string;
  system_id: string;
  visitor_hash: string;
  created_at: string;
}

export type DeviceCodeRow = {
  device_code_hash: string;
  user_code: string;
  client: string;
  client_version: string | null;
  creator_id: string | null;
  approved_at: string | null;
  consumed_at: string | null;
  last_polled_at: string | null;
  poll_count: number;
  created_at: string;
  expires_at: string;
};

// (see CreatorRow / SystemRow above for 0039's additions)
export type DebugInviteRow = {
  id: string;
  token_hash: string;
  // 0038: the token in plaintext, so an admin can copy the link again while it is still live
  // (D-74). CLEARED when the link is spent. Validation still goes through `token_hash`.
  token: string | null;
  created_by: string | null;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export type DebugUploadRow = {
  id: string;
  invite_id: string | null;
  filename: string;
  byte_size: number;
  user_note: string | null;
  storage_key: string;
  uploaded_at: string;
};

export type AppTokenRow = {
  id: string;
  token_hash: string;
  creator_id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type AdminActionRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target: string;
  reason: string | null;
  detail: unknown;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      creators: Table<CreatorRow>;
      assets: Table<AssetRowDb>;
      systems: Table<SystemRow>;
      system_assets: Table<
        SystemAssetRow,
        [Rel<'system_assets_system_id_fkey', 'system_id', 'systems', 'id'>]
      >;
      asset_claims: Table<AssetClaimRow>;
      takedowns: Table<TakedownRow>;
      bodies: Table<NodeRow>;
      constructs: Table<ConstructRow>;
      hearts: Table<HeartRow>;
      comments: Table<
        CommentRow,
        [Rel<'comments_system_id_fkey', 'system_id', 'systems', 'id'>]
      >;
      reports: Table<
        ReportRow,
        [
          Rel<'reports_system_id_fkey', 'system_id', 'systems', 'id'>,
          Rel<'reports_comment_id_fkey', 'comment_id', 'comments', 'id'>
        ]
      >;
      config: Table<ConfigRow>;
      upload_events: Table<UploadEventRow>;
      download_events: Table<DownloadEventRow>;
      traffic_daily: Table<TrafficDailyRow>;
      admin_actions: Table<AdminActionRow>;
      system_screenshots: Table<SystemScreenshotRow>;
      attestations: Table<AttestationRow>;
      creator_identities: Table<CreatorIdentityRow>;
      entitlements: Table<EntitlementRow>;
      creator_badges: Table<CreatorBadgeRow>;
      integration_outbox: Table<IntegrationOutboxRow>;
      device_codes: Table<DeviceCodeRow>;
      app_tokens: Table<AppTokenRow>;
      debug_invites: Table<DebugInviteRow>;
      debug_uploads: Table<DebugUploadRow>;
      tag_proposals: Table<TagProposalRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      asset_refcount: { Args: { p_sha256: string }; Returns: number };
      increment_download: { Args: { p_system_id: string }; Returns: undefined };
      creator_tier: { Args: { p_creator_id: string }; Returns: AccountTier };
      // The usage dashboard, one JSON document (0014). Shape: src/lib/stats.ts.
      hub_stats: { Args: { p_days: number }; Returns: unknown };
      // A batch of traffic buckets from one Worker isolate, added to their day and category (0016).
      bump_traffic: { Args: { p_rows: unknown }; Returns: undefined };
      // The traffic panel: 31 days by category with bytes in and out, and this month's totals (0017).
      hub_traffic: { Args: Record<string, never>; Returns: unknown };
    };
    Enums: {
      review_state: ReviewState;
      asset_kind: AssetKind;
      asset_role: AssetRole;
      system_state: SystemState;
      visibility: Visibility;
      creator_role: CreatorRole;
      creator_state: CreatorState;
      report_target: ReportTarget;
      report_state: ReportState;
      account_tier: AccountTier;
      identity_provider: IdentityProvider;
      entitlement_source: EntitlementSource;
      outbox_state: OutboxState;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/** The typed client every server module takes. */
export type Db = import('@supabase/supabase-js').SupabaseClient<Database>;
