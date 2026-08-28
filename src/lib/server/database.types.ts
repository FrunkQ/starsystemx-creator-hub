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
  visibility: Visibility;
  cover_sha256: string | null;
  hearts_count: number;
  download_count: number;
  source_bytes: number;
  // The CAPABILITY MARKER - which engine build wrote this. Never a parse gate.
  created_with: string | null;
  legacy_stamped: boolean;
  blurb: string | null;
  tags: string[];
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

export type ConfigRow = {
  key: string;
  value: unknown;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type UploadEventRow = {
  id: string;
  creator_id: string;
  system_id: string | null;
  novel_hashes: number;
  total_hashes: number;
  bytes: number;
  is_update: boolean;
  flagged: boolean;
  created_at: string;
}

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
      reports: Table<
        ReportRow,
        [Rel<'reports_system_id_fkey', 'system_id', 'systems', 'id'>]
      >;
      config: Table<ConfigRow>;
      upload_events: Table<UploadEventRow>;
      admin_actions: Table<AdminActionRow>;
      system_screenshots: Table<SystemScreenshotRow>;
      attestations: Table<AttestationRow>;
      creator_identities: Table<CreatorIdentityRow>;
      entitlements: Table<EntitlementRow>;
      creator_badges: Table<CreatorBadgeRow>;
      integration_outbox: Table<IntegrationOutboxRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      asset_refcount: { Args: { p_sha256: string }; Returns: number };
      increment_download: { Args: { p_system_id: string }; Returns: undefined };
      creator_tier: { Args: { p_creator_id: string }; Returns: AccountTier };
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
