// A creator's own picture as the base of a designed cover: decoded, then fitted to the card.
//
// PNG and JPEG only, decoded in pure JavaScript (png-decode.ts, jpeg-js), because those are what
// the app's screenshots are and what a Worker can read without an image library. A WebP or GIF
// screenshot can still be the cover as itself; it just cannot have the words drawn over it here.
import { decode as decodeJpeg } from 'jpeg-js';
import { decodePng, isPng, type DecodedImage } from './png-decode';

export type { DecodedImage };

const JPEG = [0xff, 0xd8, 0xff];

export function decodeImage(bytes: Uint8Array): DecodedImage | null {
  try {
    if (isPng(bytes)) return decodePng(bytes);
    if (bytes.length > 3 && JPEG.every((b, i) => bytes[i] === b)) {
      const j = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256, maxResolutionInMP: 40 });
      return { width: j.width, height: j.height, rgb: j.data };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Scale to COVER the card and crop the middle - the way a browser's `object-fit: cover` does -
 * averaging the source pixels under each destination pixel so a 4K screenshot lands smooth rather
 * than sparkly. The cheap box filter is enough: the picture goes under text at a third of a
 * screen's width.
 */
export function coverFit(img: DecodedImage, W: number, H: number): DecodedImage {
  const scale = Math.max(W / img.width, H / img.height);
  const srcW = W / scale, srcH = H / scale;
  const ox = (img.width - srcW) / 2, oy = (img.height - srcH) / 2;
  const out = new Uint8Array(W * H * 3);
  const sw = img.width;

  for (let y = 0; y < H; y++) {
    const sy0 = Math.max(0, Math.floor(oy + (y / H) * srcH));
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.ceil(oy + ((y + 1) / H) * srcH)));
    for (let x = 0; x < W; x++) {
      const sx0 = Math.max(0, Math.floor(ox + (x / W) * srcW));
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.ceil(ox + ((x + 1) / W) * srcW)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let i = (sy * sw + sx0) * 3;
        for (let sx = sx0; sx < sx1; sx++, i += 3) { r += img.rgb[i]; g += img.rgb[i + 1]; b += img.rgb[i + 2]; n++; }
      }
      const o = (y * W + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { width: W, height: H, rgb: out };
}
