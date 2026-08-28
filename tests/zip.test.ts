// The zip reader reads HOSTILE input. These test the hardening that is not in the engine's own
// reader, because the engine reads a file the user already trusts on their own machine.
//
// The archives here are built with fflate in the test itself - they are not SSE fixtures and do
// not pretend to be.
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readZip, BundleReadError, DEFAULT_ZIP_LIMITS } from '../src/lib/bundle/read';
import { isZip, extOf } from '../src/lib/bundle/contract';
import { sha256Hex, claimedHashFromModelPath } from '../src/lib/bundle/hash';
import { MODELS_DIR } from '../src/lib/bundle/contract';

describe('sniffing', () => {
  it('decides by magic number, never by extension', () => {
    expect(isZip(zipSync({ 'a.txt': strToU8('hi') }))).toBe(true);
    expect(isZip(strToU8('{"not":"a zip"}'))).toBe(false);
    expect(isZip(new Uint8Array([]))).toBe(false);
  });

  it('reads an extension without tripping on a dotless name', () => {
    expect(extOf('assets/images/n1.JPG')).toBe('jpg');
    expect(extOf('README')).toBe('readme'); // no dot: the whole name comes back, lower-cased
  });
});

describe('the reader', () => {
  it('reads members back', () => {
    const zip = zipSync({ 'starmap.json': strToU8('{"a":1}'), 'assets/images/n1.jpg': strToU8('bytes') });
    const members = readZip(zip);
    expect(Object.keys(members).sort()).toEqual(['assets/images/n1.jpg', 'starmap.json']);
  });

  it('refuses a path that escapes the archive', () => {
    const zip = zipSync({ '../../etc/passwd': strToU8('x'), 'starmap.json': strToU8('{}') });
    const members = readZip(zip);
    expect(Object.keys(members)).toEqual(['starmap.json']);
  });

  it('refuses an absolute path', () => {
    const zip = zipSync({ '/etc/passwd': strToU8('x'), 'starmap.json': strToU8('{}') });
    expect(Object.keys(readZip(zip))).toEqual(['starmap.json']);
  });

  it('refuses an archive with too many members', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 20; i++) files['f' + i + '.json'] = strToU8('{}');
    expect(() => readZip(zipSync(files), { ...DEFAULT_ZIP_LIMITS, maxMembers: 5 }))
      .toThrow(BundleReadError);
  });

  it('refuses a zip bomb on its DECLARED size, before allocating anything', () => {
    // A megabyte of zeroes compresses to almost nothing; the ratio check catches it.
    const zip = zipSync({ 'starmap.json': new Uint8Array(1024 * 1024) });
    expect(() => readZip(zip, { ...DEFAULT_ZIP_LIMITS, maxRatio: 10 })).toThrow(BundleReadError);
  });

  it('refuses an archive that expands beyond the total cap', () => {
    const zip = zipSync({ 'a.json': new Uint8Array(100_000) });
    expect(() => readZip(zip, { ...DEFAULT_ZIP_LIMITS, maxTotalUncompressedBytes: 1000 }))
      .toThrow(BundleReadError);
  });

  it('throws a readable error on something that is not a zip', () => {
    expect(() => readZip(strToU8('hello'))).toThrow(BundleReadError);
  });
});

describe('hashing - the bytes decide, never the path', () => {
  it('produces a stable lower-case hex digest', async () => {
    const h = await sha256Hex(strToU8('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('reads a well-formed hash claim off a model path', () => {
    const hash = 'a'.repeat(64);
    expect(claimedHashFromModelPath(MODELS_DIR + hash + '.glb', MODELS_DIR)).toBe(hash);
  });

  it('returns null for a path whose claim is not a hash - so it can never become a key', () => {
    expect(claimedHashFromModelPath(MODELS_DIR + 'not-a-hash.glb', MODELS_DIR)).toBeNull();
    expect(claimedHashFromModelPath('assets/images/n1.jpg', MODELS_DIR)).toBeNull();
  });

  it('a forged path and the real bytes disagree, which is the whole point', async () => {
    // A bundle naming a file after an APPROVED hash while carrying different bytes must not
    // inherit that approval. The ingest pipeline compares these two and refuses on mismatch.
    const forged = 'b'.repeat(64);
    const actual = await sha256Hex(strToU8('completely different bytes'));
    expect(claimedHashFromModelPath(MODELS_DIR + forged + '.glb', MODELS_DIR)).toBe(forged);
    expect(actual).not.toBe(forged);
  });
});
