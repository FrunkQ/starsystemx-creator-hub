// A PNG decoder for the one job the cover designer has: a creator's own screenshot as the base.
//
// Pure JavaScript over `fflate`'s inflate, for the same reason the encoder is (png.ts): a Worker
// has no image library. Deliberately narrow - eight-bit, non-interlaced, the five colour types -
// because that is what a screenshot is, and anything else refuses loudly rather than guessing.
// Alpha is composited onto black: the card's background is dark and the picture is going under
// text anyway.
import { unzlibSync } from 'fflate';

export interface DecodedImage {
  width: number;
  height: number;
  /** width * height * 3, row-major. */
  rgb: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

export function decodePng(bytes: Uint8Array): DecodedImage {
  if (!isPng(bytes)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + len;
  }

  if (!width || !height) throw new Error('PNG has no size');
  if (depth !== 8) throw new Error('only 8-bit PNGs are read (this one is ' + depth + '-bit)');
  if (interlace !== 0) throw new Error('interlaced PNGs are not read');
  if (width * height > 40_000_000) throw new Error('PNG is too large');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error('unknown PNG colour type ' + colour);
  if (colour === 3 && !palette) throw new Error('palette PNG without a palette');

  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) { all.set(d, o); o += d.length; }
  const raw = unzlibSync(all);

  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is short');

  // Unfilter in place, row by row: None, Sub, Up, Average, Paeth.
  const rows = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = src[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error('bad PNG filter ' + filter);
      }
      cur[x] = v & 255;
    }
    prev = cur;
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i++, p += 3) {
    const s = i * channels;
    switch (colour) {
      case 0: rgb[p] = rgb[p + 1] = rgb[p + 2] = rows[s]; break;
      case 2: rgb[p] = rows[s]; rgb[p + 1] = rows[s + 1]; rgb[p + 2] = rows[s + 2]; break;
      case 3: { const k = rows[s] * 3; rgb[p] = palette![k]; rgb[p + 1] = palette![k + 1]; rgb[p + 2] = palette![k + 2]; break; }
      case 4: { const a = rows[s + 1] / 255; rgb[p] = rgb[p + 1] = rgb[p + 2] = rows[s] * a; break; }
      case 6: { const a = rows[s + 3] / 255; rgb[p] = rows[s] * a; rgb[p + 1] = rows[s + 1] * a; rgb[p + 2] = rows[s + 2] * a; break; }
    }
  }
  return { width, height, rgb };
}
