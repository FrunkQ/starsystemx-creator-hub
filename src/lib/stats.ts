// The shape `hub_stats()` returns (db/migrations/0014). Numbers arrive as JSON numbers, but a
// Postgres bigint can come back as a string through jsonb - hence the `number | string` on counts.
export type Count = number | string;

export interface HubStats {
  generated_at: string;
  days: number;
  totals: {
    creators: Count; maps_public: Count; maps_all: Count; downloads: Count; hearts: Count;
    downloads_period: Count; visitors_period: Count; uploads_period: Count; refusals_period: Count;
  };
  growth: Array<{
    week: string; creators: Count; maps: Count; uploads: Count; refusals: Count; downloads: Count; visitors: Count;
  }>;
  top_maps: Array<{
    slug: string; title: string; handle: string; download_count: Count; hearts_count: Count; downloads_period: Count;
  }>;
  top_creators: Array<{ handle: string; maps: Count; downloads: Count; hearts: Count; bundle_bytes: Count }>;
  storage: { asset_bytes: Count; asset_count: Count; bundle_bytes: Count; bundle_count: Count };
  failures: Array<{ reason: string; n: Count }>;
  queue: { pending: Count; oldest_pending: string | null; flagged: Count; open_reports: Count };
}

/** The R2 free allowance, which is the number the storage panel is measured against. */
export const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024;
