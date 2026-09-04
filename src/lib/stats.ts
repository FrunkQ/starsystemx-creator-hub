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
  storage: { asset_bytes: Count; asset_count: Count; bundle_bytes: Count; bundle_count: Count; db_bytes?: Count };
  failures: Array<{ reason: string; n: Count }>;
  queue: { pending: Count; oldest_pending: string | null; flagged: Count; open_reports: Count };
  // 0016. Superseded by HubTraffic (0017); kept because the function still returns them.
  traffic?: Array<{ day: string; category: string; requests: Count; bytes: Count }>;
  month?: { requests: Count; bytes: Count; reads: Count; writes: Count; days_elapsed: Count; days_in_month: Count };
}

/** `hub_traffic()` (0017): what left and what arrived, per day and kind. */
export interface HubTraffic {
  days: Array<{ day: string; category: string; requests: Count; bytes: Count; bytes_in: Count }>;
  month: { requests: Count; bytes: Count; bytes_in: Count; reads: Count; writes: Count; days_elapsed: Count; days_in_month: Count };
}

/** The categories a request is counted under, in the order the chart stacks them. */
export const TRAFFIC_CATEGORIES = ['page', 'api', 'asset', 'download', 'upload'] as const;

/** The R2 free allowance, which is the number the storage panel is measured against. */
export const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * WHERE IT STARTS TO COST. The free allowances the hub runs inside, as of 2026-09. Bandwidth out
 * of Cloudflare and R2 egress are free and have no line here. Supabase egress (5 GB a month, the
 * traffic between Postgres and the Worker) is real but cannot be measured from the hub.
 */
export const LIMITS = {
  /** Workers Free: requests per day, reset at midnight UTC. */
  workersRequestsPerDay: 100_000,
  /** R2 Free: stored bytes. */
  r2Bytes: R2_FREE_BYTES,
  /** R2 Free: class B (read) operations a month - here, asset and download requests. */
  r2ReadsPerMonth: 10_000_000,
  /** R2 Free: class A (write) operations a month - here, novel assets and bundles stored. */
  r2WritesPerMonth: 1_000_000,
  /** Supabase Free: database size. */
  supabaseDbBytes: 500 * 1024 * 1024
};
