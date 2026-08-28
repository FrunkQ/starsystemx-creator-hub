// Zip reading for HOSTILE input.
//
// MIRRORED from the engine's `src/lib/import/shared/zip.ts` (design 4: "small enough to mirror
// rather than invent"), which walks the central directory itself and resolves ZIP64 sizes from the
// extra field - rather than fflate's `unzipSync`, whose browser build reads the ZIP64 size sentinel
// (0xFFFFFFFF) as a literal 4 GB and throws.
//
// WHAT IS ADDED HERE AND IS NOT IN THE ENGINE, because the engine reads a file the user already
// trusts on their own machine and the hub reads whatever a stranger posted:
//   - path traversal and absolute paths are refused outright
//   - member count and TOTAL UNCOMPRESSED size are capped, so a zip bomb fails a check instead of
//     an allocation (a 50 MB upload can declare terabytes uncompressed)
//   - compression ratio per member is capped for the same reason
import { inflateSync } from 'fflate';

export interface ZipLimits {
  maxMembers: number;
  maxTotalUncompressedBytes: number;
  maxRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxMembers: 1000,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxRatio: 200
};

export class BundleReadError extends Error {}

const decoder = new TextDecoder('utf-8');
const SIG_EOCD = 0x06054b50, SIG_ZIP64_LOC = 0x07064b50, SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50, ZIP64_EXTRA_ID = 0x0001;

/** A member name we will not touch: escapes the archive, or is absolute, or is a directory entry. */
function unsafeName(name: string): boolean {
  if (!name || name.endsWith('/')) return true;
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;               // a drive-letter path
  if (name.includes('\\')) return true;                   // backslash separators: not our layout
  return name.split('/').some((seg) => seg === '..' || seg === '.');
}

export function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Record<string, Uint8Array> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 2 ** 32;

  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) { if (u32(i) === SIG_EOCD) { eocd = i; break; } }
  if (eocd < 0) throw new BundleReadError('That file is not a zip archive.');

  let cdCount = u16(eocd + 10);
  let cdOffset = u32(eocd + 16);
  if (cdOffset === 0xffffffff || cdCount === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(loc) === SIG_ZIP64_LOC) {
      const z64 = u64(loc + 8);
      if (z64 >= 0 && z64 + 56 <= n && u32(z64) === SIG_ZIP64_EOCD) { cdCount = u64(z64 + 32); cdOffset = u64(z64 + 48); }
    }
  }
  if (cdCount > limits.maxMembers) {
    throw new BundleReadError(`That archive holds ${cdCount} files, which is more than the hub accepts.`);
  }

  const members: Record<string, Uint8Array> = {};
  let total = 0;
  let p = cdOffset;
  for (let e = 0; e < cdCount && p + 46 <= n; e++) {
    if (u32(p) !== SIG_CENTRAL) break;
    const method = u16(p + 10);
    let compSize = u32(p + 20);
    let uncompSize = u32(p + 24);
    const fnLen = u16(p + 28), exLen = u16(p + 30), cmLen = u16(p + 32);
    let localOff = u32(p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + fnLen));

    let ex = p + 46 + fnLen; const exEnd = ex + exLen;
    while (ex + 4 <= exEnd) {
      const id = u16(ex), dsz = u16(ex + 2); let q = ex + 4;
      if (id === ZIP64_EXTRA_ID) {
        if (uncompSize === 0xffffffff) { uncompSize = u64(q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(q); q += 8; }
        if (localOff === 0xffffffff) { localOff = u64(q); q += 8; }
      }
      ex += 4 + dsz;
    }
    p += 46 + fnLen + exLen + cmLen;

    if (unsafeName(name)) continue;

    // Zip-bomb defence, checked against the DECLARED size before anything is allocated.
    total += uncompSize;
    if (total > limits.maxTotalUncompressedBytes) {
      throw new BundleReadError('That archive expands to more data than the hub accepts.');
    }
    if (compSize > 0 && uncompSize / compSize > limits.maxRatio) {
      throw new BundleReadError('That archive contains a file compressed far beyond what a save needs.');
    }

    if (u32(localOff) !== SIG_LOCAL) continue;
    const dataStart = localOff + 30 + u16(localOff + 26) + u16(localOff + 28);
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    members[name] = method === 0 ? comp : inflateSync(comp);
  }

  if (!Object.keys(members).length) throw new BundleReadError('That archive is empty.');
  return members;
}
