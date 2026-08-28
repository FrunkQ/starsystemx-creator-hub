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
 * EMPTY ON PURPOSE. The `bundleFormat` stamp and the canonical fixture are engine-side work and
 * have not landed. An empty set means every upload is refused politely at the gate, which is the
 * correct behaviour for a parser that has never seen the thing it claims to parse - and far better
 * than parsing something we do not understand into a public database.
 *
 * WHEN THE FIXTURE ARRIVES: drop it in `tests/fixtures/`, add its integer here, and run the suite.
 * That is the whole handover.
 */
export const KNOWN_BUNDLE_FORMATS: readonly number[] = [];
