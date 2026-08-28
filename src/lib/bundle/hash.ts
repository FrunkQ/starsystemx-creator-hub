// sha256, computed from BYTES. Never read off a path.
//
// THE RULE THIS FILE EXISTS FOR (docs/contract-with-sse.md C-03). A bundle path may CLAIM a hash -
// `assets/models/<sha256>.glb` is content-addressed by the engine - and that claim arrives inside
// a zip somebody else wrote. A malicious bundle naming a file after an already-APPROVED hash while
// carrying entirely different bytes would inherit that approval and be served without review.
//
// So: the hub hashes. A path's claimed hash is verified against the computed one and discarded on
// mismatch. It is never a key.

/** WebCrypto is available on Workers and in the browser. No dependency, no polyfill. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const view = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** The hash a model path claims, or null when the path does not carry a well-formed one. */
export function claimedHashFromModelPath(path: string, modelsDir: string): string | null {
  const i = path.indexOf(modelsDir);
  if (i < 0 || !path.toLowerCase().endsWith('.glb')) return null;
  const claim = path.slice(i + modelsDir.length, -4).toLowerCase();
  return HEX64.test(claim) ? claim : null;
}
