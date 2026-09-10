// WHAT A FILE ACTUALLY IS, from its first few bytes (D-76).
//
// ============================================================================================
// The owner, on the review queue, 2026-09-10: *"We need more file details - name, apparent type,
// size, guess from first few bytes, etc."*
//
// The last of those is the one that earns its place. A reviewer is shown a picture and asked to
// judge it; everything else on the card is somebody's CLAIM - the filename came from a zip a
// stranger built, and the content type came from the extension on that filename. Neither is
// evidence. The first bytes are.
//
// WHAT IT IS FOR, and it is not really about images. An upload whose bytes disagree with its name
// is the interesting case: a `.png` that is actually a zip, or an HTML file wearing a picture's
// extension. The hub already refuses anything outside its allowed extensions and never executes
// what it stores, so this is not a hole being plugged - it is a SIGNAL being shown to the person
// who has been asked to decide, next to the other signals.
//
// DELIBERATELY SMALL. Magic numbers for the formats the hub accepts, plus the few worth naming
// because seeing them here would be surprising. Not a MIME database: a long tail of exotic formats
// would add rows nobody can act on and give the false impression that an unlisted answer means
// something is wrong.
// ============================================================================================

export interface Sniffed {
  /** What the bytes say it is, in words a person can read. `null` when nothing matched. */
  format: string | null;
  /** The content type those bytes imply, for comparing against what was declared. */
  mime: string | null;
  /**
   * True when this is something the hub knowingly stores. An unrecognised file is not automatically
   * sinister - it is unrecognised, and the difference matters on a page where somebody is deciding.
   */
  expected: boolean;
}

interface Magic {
  format: string;
  mime: string | null;
  expected: boolean;
  /** Bytes that must match at `offset`. `null` in the pattern means "anything here". */
  at: number;
  bytes: ReadonlyArray<number | null>;
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * Ordered, because some patterns are prefixes of others in spirit: a RIFF container is only a WebP
 * when `WEBP` follows the size, so the specific test has to come before any general one.
 */
const MAGIC: readonly Magic[] = [
  // --- what the hub accepts ---------------------------------------------------------------
  { format: 'PNG image', mime: 'image/png', expected: true, at: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { format: 'JPEG image', mime: 'image/jpeg', expected: true, at: 0, bytes: [0xff, 0xd8, 0xff] },
  { format: 'GIF image', mime: 'image/gif', expected: true, at: 0, bytes: ascii('GIF8') },
  // RIFF....WEBP - four bytes of length sit between the two markers, so they are wildcards.
  { format: 'WebP image', mime: 'image/webp', expected: true, at: 0,
    bytes: [...ascii('RIFF'), null, null, null, null, ...ascii('WEBP')] },
  { format: 'glTF binary (glb)', mime: 'model/gltf-binary', expected: true, at: 0, bytes: ascii('glTF') },

  // --- worth naming because seeing one here would be a surprise ----------------------------
  // A zip is the one a reviewer most plausibly meets by accident: a save bundle renamed, or a
  // picture that is really an archive.
  { format: 'Zip archive', mime: 'application/zip', expected: false, at: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { format: 'Zip archive (empty)', mime: 'application/zip', expected: false, at: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { format: 'PDF document', mime: 'application/pdf', expected: false, at: 0, bytes: ascii('%PDF-') },
  { format: 'Windows executable', mime: null, expected: false, at: 0, bytes: ascii('MZ') },
  { format: 'Linux executable (ELF)', mime: null, expected: false, at: 0, bytes: [0x7f, ...ascii('ELF')] },
  { format: 'SVG image', mime: 'image/svg+xml', expected: false, at: 0, bytes: ascii('<svg') },
  { format: 'SVG or XML', mime: 'image/svg+xml', expected: false, at: 0, bytes: ascii('<?xml') },
  { format: 'HTML', mime: 'text/html', expected: false, at: 0, bytes: ascii('<!DOCTYPE') },
  { format: 'HTML', mime: 'text/html', expected: false, at: 0, bytes: ascii('<html') },
  { format: 'Gzip', mime: 'application/gzip', expected: false, at: 0, bytes: [0x1f, 0x8b] },
  { format: 'Bzip2', mime: 'application/x-bzip2', expected: false, at: 0, bytes: ascii('BZh') },
  { format: '7-Zip', mime: 'application/x-7z-compressed', expected: false, at: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf] },
  { format: 'RAR archive', mime: 'application/vnd.rar', expected: false, at: 0, bytes: ascii('Rar!') }
];

/** How many bytes are worth reading. The longest pattern is twelve; a little slack costs nothing. */
export const SNIFF_BYTES = 32;

/** What these bytes are. */
export function sniff(bytes: Uint8Array | null | undefined): Sniffed {
  if (!bytes || !bytes.length) return { format: null, mime: null, expected: false };

  for (const m of MAGIC) {
    if (bytes.length < m.at + m.bytes.length) continue;
    let hit = true;
    for (let i = 0; i < m.bytes.length; i++) {
      const want = m.bytes[i];
      if (want === null) continue;              // a wildcard, e.g. a length field
      if (bytes[m.at + i] !== want) { hit = false; break; }
    }
    if (hit) return { format: m.format, mime: m.mime, expected: m.expected };
  }
  return { format: null, mime: null, expected: false };
}

/**
 * Whether what the bytes say disagrees with what the upload CLAIMED, in a way worth flagging.
 *
 * NOT A TRIPWIRE, and the distinction is the whole reason this is a separate function. Unknown
 * bytes disagree with nothing - the hub's list is short on purpose, so "we do not recognise this"
 * must not read as "this is wrong". Only a positive identification that contradicts the declared
 * type is a mismatch, and only that is worth a reviewer's attention.
 */
export function mismatch(declared: string | null | undefined, found: Sniffed): boolean {
  // UNRECOGNISED IS SILENT. This is the whole guard, and it is on `format` alone.
  if (!found.format) return false;
  const said = (declared ?? '').trim().toLowerCase();
  if (!said) return false;

  // A FORMAT WITH NO MIME IS THE LOUDEST CASE, NOT THE QUIETEST. The first version of this also
  // returned false when `found.mime` was null - and the entries with no mime are the executables.
  // So an .exe declared as image/png was the ONE thing it silently let through. Caught by the test
  // that asserts a contradiction is flagged, which is the reason to write that test at all.
  if (!found.mime) return true;

  // `image/jpg` is written by hand often enough to be worth not flagging as a lie.
  const normal = said === 'image/jpg' ? 'image/jpeg' : said;
  return normal !== found.mime;
}

/** Bytes, for a person: "1.2 MB". Kept here so the review card and the sniffer agree. */
export function humanBytes(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 'unknown size';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
