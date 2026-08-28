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
    }
    interface Error {
      code?: string;
    }
  }
}

export {};
