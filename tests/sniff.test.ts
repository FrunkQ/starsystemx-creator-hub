// WHAT THE FIRST FEW BYTES SAY (D-76).
//
// The point of this on a review card is that everything else is a CLAIM: the filename came out of a
// stranger's zip and the content type came off that filename. So the two things worth testing hard
// are that a real format is named correctly, and that "we do not recognise this" never reads as
// "this is wrong" - a reviewer who learns to ignore a warning has lost the warning.
import { describe, it, expect } from 'vitest';
import { sniff, mismatch, humanBytes, SNIFF_BYTES } from '../src/lib/bundle/sniff';
import { readFileSync } from 'node:fs';

const head = (...bytes: number[]) => new Uint8Array(bytes);
const ofText = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe('sniff', () => {
  it('names the formats the hub actually stores', () => {
    expect(sniff(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).format).toBe('PNG image');
    expect(sniff(head(0xff, 0xd8, 0xff, 0xe0)).format).toBe('JPEG image');
    expect(sniff(ofText('GIF89a')).format).toBe('GIF image');
    expect(sniff(ofText('glTF')).format).toBe('glTF binary (glb)');
  });

  it('reads a WebP through the length field in the middle of its magic', () => {
    // RIFF <4 bytes of size> WEBP. The size is whatever this file happens to be, so those four
    // bytes are wildcards - a pattern that expected zeroes there would match almost nothing.
    const webp = new Uint8Array([...ofText('RIFF'), 0x2a, 0x13, 0x00, 0x00, ...ofText('WEBP')]);
    expect(sniff(webp)).toMatchObject({ format: 'WebP image', mime: 'image/webp', expected: true });
    // And a RIFF that is NOT a WebP (a wav, say) must not be called one.
    const wav = new Uint8Array([...ofText('RIFF'), 0, 0, 0, 0, ...ofText('WAVE')]);
    expect(sniff(wav).format).toBeNull();
  });

  it('names the things that would be a surprise here', () => {
    // A zip is the one a reviewer plausibly meets by accident - a save bundle renamed, or a
    // picture that is really an archive.
    expect(sniff(head(0x50, 0x4b, 0x03, 0x04))).toMatchObject({ format: 'Zip archive', expected: false });
    expect(sniff(ofText('%PDF-1.7')).format).toBe('PDF document');
    expect(sniff(ofText('MZ')).format).toBe('Windows executable');
    expect(sniff(head(0x7f, 0x45, 0x4c, 0x46)).format).toBe('Linux executable (ELF)');
    expect(sniff(ofText('<!DOCTYPE html>')).format).toBe('HTML');
  });

  it('says nothing at all rather than guessing', () => {
    // A short list is the design. An unlisted answer must mean "unrecognised", never "suspicious".
    for (const b of [null, undefined, new Uint8Array(), head(1, 2, 3, 4), ofText('hello there')]) {
      expect(sniff(b).format, String(b)).toBeNull();
      expect(sniff(b).expected).toBe(false);
    }
  });

  it('does not read past what it was given', () => {
    // The route reads a RANGE, so a truncated head is the normal case, not an edge one.
    expect(sniff(head(0x89, 0x50)).format).toBeNull();
    expect(sniff(new Uint8Array([...ofText('RIFF'), 0, 0])).format).toBeNull();
  });

  it('reads a real file from the repo, not only bytes I typed', () => {
    // The repo favicon opens with <svg and no XML declaration - which is how MOST svg files in
    // the wild look, and the first version of the pattern list only matched <?xml. Pointing a test
    // at a real file rather than at bytes I typed is what found that.
    const favicon = readFileSync('static/favicon.svg');
    expect(sniff(favicon.subarray(0, SNIFF_BYTES))).toMatchObject({ format: 'SVG image', expected: false });
  });
});

describe('mismatch', () => {
  it('flags bytes that contradict what was declared', () => {
    expect(mismatch('image/png', sniff(head(0x50, 0x4b, 0x03, 0x04)))).toBe(true);
    // AN EXECUTABLE HAS NO MIME OF ITS OWN, and the first version of mismatch() treated
    // "no mime" as "nothing to compare" - silently letting through the single most alarming case.
    expect(mismatch('image/png', sniff(ofText('MZ')))).toBe(true);
    expect(mismatch('image/png', sniff(head(0x7f, 0x45, 0x4c, 0x46)))).toBe(true);
  });

  it('is quiet when they agree', () => {
    expect(mismatch('image/png', sniff(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)))).toBe(false);
    expect(mismatch('image/gif', sniff(ofText('GIF89a')))).toBe(false);
  });

  it('forgives image/jpg, which people write by hand constantly', () => {
    expect(mismatch('image/jpg', sniff(head(0xff, 0xd8, 0xff)))).toBe(false);
    expect(mismatch('IMAGE/JPEG', sniff(head(0xff, 0xd8, 0xff)))).toBe(false);
  });

  it('NEVER flags something it simply did not recognise', () => {
    // THE ONE THAT MATTERS. The list is short on purpose; if unknown bytes raised a warning, every
    // unusual-but-fine file would cry wolf and the warning would stop being read.
    expect(mismatch('image/png', sniff(head(1, 2, 3, 4)))).toBe(false);
    expect(mismatch('image/png', sniff(null))).toBe(false);
  });

  it('says nothing when nothing was declared', () => {
    expect(mismatch(null, sniff(head(0x50, 0x4b, 0x03, 0x04)))).toBe(false);
    expect(mismatch('', sniff(head(0x50, 0x4b, 0x03, 0x04)))).toBe(false);
  });
});

describe('humanBytes', () => {
  it('reads as a size a person would say', () => {
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(2048)).toBe('2 KB');
    expect(humanBytes(1_300_000)).toBe('1.2 MB');
  });

  it('says it does not know rather than printing NaN', () => {
    for (const n of [null, undefined, -1, Number.NaN]) {
      expect(humanBytes(n as never), String(n)).toBe('unknown size');
    }
  });
});
