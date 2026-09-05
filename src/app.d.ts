import type { HubEnv } from '$lib/server/db';
import type { Viewer } from '$lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      viewer: Viewer | null;
    }
    interface Platform {
      env: HubEnv;
      context: { waitUntil(promise: Promise<unknown>): void };
      caches: CacheStorage;
      // Cloudflare's per-request properties. Absent on a request the Worker made to itself
      // (worker/index.mjs), which is how the housekeeping routes know a caller is the clock.
      cf?: unknown;
    }
    interface Error {
      code?: string;
    }
  }
}

export {};
