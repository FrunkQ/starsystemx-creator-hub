// THE CONTRACT WITH SSE. Every constant here is MIRRORED from the engine repo, not imported.
//
// WHY MIRRORED (creator-hub-design.md 4). Two repositories on different release cadences, coupled
// by a build-time dependency, costs more than mirroring a hundred lines. The hub never USES a
// campaign - no physics, no classification, no rendering. It opens a zip, reads one JSON, cuts it
// into rows, lists asset paths and reads the provenance flags. That is the whole surface.
//
// SOURCE OF TRUTH, and the files to re-read when this drifts:
//   src/lib/io/bundle.ts          the layout, the doc names, the magic-number sniff
//   src/lib/io/attributions.ts    the provenance fields and the two flags
//   src/lib/import/shared/zip.ts  the reader (fflate, central-directory walk, ZIP64)
//
// WHAT KEEPS IT HONEST: a `bundleFormat` integer in the doc plus a canonical fixture SSE checks
// in. Neither exists yet - both are engine-side work (design phase 0). Until the fixture lands
// this module is a specification, and `KNOWN_BUNDLE_FORMATS` below is deliberately empty.

/** The bundle extension. The extension is never evidence of anything; `isZip` is. */
export const BUNDLE_EXT = '.sse.zip';

export const MODELS_DIR = 'assets/models/';
export const IMAGES_DIR = 'assets/images/';
// NOTE the trap the engine's own comment names: this path STARTS WITH `IMAGES_DIR`, so anything
// matching on the image directory must exclude player images explicitly rather than by luck.
export const PLAYER_IMAGES_DIR = 'assets/images/player/';

export const DOC_NAME = { starmap: 'starmap.json', system: 'system.json' } as const;
export type BundleKind = keyof typeof DOC_NAME;

export const ATTRIBUTIONS_NAME = 'ATTRIBUTIONS.md';
export const README_NAME = 'README.txt';

/** True when these bytes are a zip (PK\x03\x04). Mirrors `sniffBundle`. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  glb: 'model/gltf-binary'
};

/** What the hub will accept as an image. An svg is script-bearing and is NOT in this list. */
export const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

export function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

// ------------------------------------------------------------------------------------------------
// Format versioning
// ------------------------------------------------------------------------------------------------
/**
 * The bundle formats this deploy has been TESTED against a real fixture.
 *
 * OPENED 2026-09-01, on evidence rather than on hope. The engine shipped `bundleFormat: 1` stamped
 * on every save in every container (v3.0.244), plus two canonical fixtures which are REAL saves -
 * a campaign and a single system - now checked in under `tests/fixtures/` and exercised by
 * `tests/fixture.test.ts` against the actual parser.
 *
 * Between them those fixtures cover a real glTF under a real sha256 path, one hull flown by two
 * ships, a body image with full provenance and one with none, a remote URL that must survive
 * untouched, and an app-shipped graphic that must NOT be extracted.
 *
 * ADDING A FORMAT HERE IS A CLAIM THAT THE PARSER HAS BEEN RUN AGAINST ONE. Do not add an integer
 * because a release note mentions it.
 */
export const KNOWN_BUNDLE_FORMATS: readonly number[] = [1];
