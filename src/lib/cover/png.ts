// A PNG encoder in forty lines, because the Worker has nothing else.
//
// WHY NOT A LIBRARY OR A CANVAS. Cloudflare Workers have no Canvas, and they refuse to compile
// WebAssembly at runtime (`WebAssembly.Module(bytes)` is "code generation disallowed"), which rules
// out every rasteriser that ships as a .wasm blob unless it is bundled as a module import - and
// SvelteKit's build does not do that for us. What a Worker DOES have is `fflate`, already a
// dependency for reading bundles, and a PNG is nothing more than zlib-compressed scanlines inside
// four chunks with a CRC each. So: eight-bit RGB, filter type 0 on every row, one IDAT.
//
// Open Graph previews need a RASTER - Discord ignores an SVG og:image - so this is not optional.
import { zlibSync } from 'fflate';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** `rgb` is width * height * 3 bytes, row-major, top row first. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error('encodePng: buffer is not width*height*3');

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  // compression, filter, interlace all 0

  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
