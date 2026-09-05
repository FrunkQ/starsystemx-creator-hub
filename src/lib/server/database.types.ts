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
export type CreatorRole = 'user' | 'admin';
export type CreatorState = 'active' | 'suspended' | 'banned';
export type ReportTarget = 'system' | 'asset';
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
  // 0022: why, in plain words, when suspended or banned. Null when active.
  state_note: string | null;
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

export type ReportRow = {
  id: string;
  reporter_id: string;
  target: ReportTarget;
  system_id: string | null;
  sha256: string | null;
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

export type DebugInviteRow = {
  id: string;
  token_hash: string;
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
      bodies: Table<NodeRow>;
      constructs: Table<ConstructRow>;
      hearts: Table<HeartRow>;
      comments: Table<
        CommentRow,
        [Rel<'comments_system_id_fkey', 'system_id', 'systems', 'id'>]
      >;
      reports: Table<
        ReportRow,
        [Rel<'reports_system_id_fkey', 'system_id', 'systems', 'id'>]
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
