// R2, keyed by content hash. THE BUCKET IS PRIVATE and nothing reads it except this Worker.
//
// Design 6.2: no quarantine bucket, no copy on approval, one source of truth. Approve or ban is a
// row update in the ledger and takes effect on the next request - including revoking something
// already public, which a copy-on-approve design makes slow and error-prone.
//
// Design 3.4: because the key IS the content hash, three things are free -
//   1. cross-user dedup: two creators sharing a hull store one object
//   2. a HEAD-and-skip: `has()` before `put()` means a popular asset transfers nothing at all
//   3. immutability: a content hash never needs invalidation, so far-future caching is safe
import type { HubEnv } from './db';
import type { Db } from './database.types';

/** Objects are keyed by hash alone. No user prefix - that would defeat cross-user dedup. */
export const assetKey = (sha256: string) => `sha256/${sha256}`;
export const bundleKey = (systemId: string) => `bundles/${systemId}.sse.zip`;

/** The HEAD-and-skip. Cheap, and it is most uploads once the library has any size. */
export async function has(env: HubEnv, sha256: string): Promise<boolean> {
  return (await env.HUB_ASSETS.head(assetKey(sha256))) !== null;
}

export async function putAsset(
  env: HubEnv, sha256: string, bytes: Uint8Array, mime: string
): Promise<void> {
  await env.HUB_ASSETS.put(assetKey(sha256), bytes as unknown as ArrayBuffer, {
    httpMetadata: {
      contentType: mime,
      // Safe ONLY because the key is the content hash: these bytes can never change.
      cacheControl: 'public, max-age=31536000, immutable'
    },
    // R2 verifies this itself. Belt and braces on top of hashing the bytes ourselves.
    sha256
  });
}

export async function getAsset(env: HubEnv, sha256: string): Promise<R2ObjectBody | null> {
  return env.HUB_ASSETS.get(assetKey(sha256));
}

export async function putBundle(env: HubEnv, systemId: string, bytes: Uint8Array): Promise<void> {
  await env.HUB_BUNDLES.put(bundleKey(systemId), bytes as unknown as ArrayBuffer, {
    httpMetadata: { contentType: 'application/zip' }
  });
}

export async function getBundle(env: HubEnv, systemId: string): Promise<R2ObjectBody | null> {
  return env.HUB_BUNDLES.get(bundleKey(systemId));
}

/**
 * Delete an asset's bytes ONLY when nothing references them.
 *
 * THE REFCOUNT (design 7.2). Content-addressed objects must not be deleted on account deletion
 * when another creator's map references the same hash. And note the second half of that rule,
 * which this function deliberately does NOT do: the ledger ROW stays even when the bytes go, so a
 * banned hash's verdict outlives the account that uploaded it. Delete bytes; never delete verdicts.
 */
export async function deleteIfUnreferenced(env: HubEnv, sb: Db, sha256: string): Promise<boolean> {
  const { data, error } = await sb.rpc('asset_refcount', { p_sha256: sha256 });
  if (error) throw new Error(`refcount failed: ${error.message}`);
  if ((data ?? 0) > 0) return false;
  await env.HUB_ASSETS.delete(assetKey(sha256));
  return true;
}
