// A creator's own picture as the base of a designed cover: decoded, then fitted to the card.
//
// PNG and JPEG only, decoded in pure JavaScript (png-decode.ts, jpeg-js), because those are what
// the app's screenshots are and what a Worker can read without an image library. A WebP or GIF
// screenshot can still be the cover as itself; it just cannot have the words drawn over it here.
import { decode as decodeJpeg } from 'jpeg-js';
import { decodePng, isPng, type DecodedImage } from './png-decode';

export type { DecodedImage };

const JPEG = [0xff, 0xd8, 0xff];

/**
 * WHAT A WORKER CAN AFFORD TO DECODE (D-53).
 *
 * MEASURED, because the guesses were an order of magnitude out: a 4.9 megapixel PNG takes 168ms to
 * decode and 25ms to fit; 2.0 megapixels takes 74ms. The Workers free plan allows 10ms of CPU per
 * request, and going over does not fail politely - Cloudflare kills the request with a 1102, which
 * is what the owner saw when he picked a screenshot as a cover background.
 *
 * So there is a ceiling, and it is deliberately generous rather than safe: with the fitted pixels
 * cached (`server/cover.ts`), the decode happens ONCE per picture, and a paid plan swallows it
 * easily. What the ceiling actually buys is that a 40-megapixel file cannot take the Worker down
 * while trying.
 *
 * The dimensions are read from the HEADER, before anything is decoded - the whole point is to
 * refuse without doing the expensive thing first.
 */
export const MAX_DECODE_PIXELS = 12_000_000;
export const MAX_DECODE_BYTES = 12 * 1024 * 1024;

/** Width and height from the header alone: PNG's IHDR, or a JPEG's first SOF marker. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    if (isPng(bytes) && bytes.length > 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length > 3 && JPEG.every((b, i) => bytes[i] === b)) {
      // Walk the markers to the first start-of-frame, which carries the size.
      let at = 2;
      while (at + 9 < bytes.length) {
        if (bytes[at] !== 0xff) { at++; continue; }
        const marker = bytes[at + 1];
        const length = (bytes[at + 2] << 8) | bytes[at + 3];
        // SOF0..SOF15, skipping the four that are not frame headers.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
        }
        if (length <= 0) return null;
        at += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Is this small enough to decode without risking the request? Unknown sizes are refused. */
export function withinDecodeBudget(bytes: Uint8Array): boolean {
  if (bytes.length > MAX_DECODE_BYTES) return false;
  const size = imageSize(bytes);
  if (!size || !size.width || !size.height) return false;
  return size.width * size.height <= MAX_DECODE_PIXELS;
}

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
 * WHICH PART OF THE SOURCE ENDS UP ON THE CARD - `object-fit: cover`, as numbers.
 *
 * Pure, and exported, because TWO things do this fit now and they must agree exactly: the Worker
 * (`coverFit` below, when a paid plan allows it) and THE BROWSER, which is where the work actually
 * happens (D-54). A creator's canvas and the hub's rasteriser cropping differently would be a
 * picture that jumps when it is re-prepared.
 */
export function coverCrop(
  srcW: number, srcH: number, W: number, H: number,
  focusX = 0.5, focusY = 0.5
) {
  const scale = Math.max(W / srcW, H / srcH);
  const sw = W / scale, sh = H / scale;
  // WHERE THE CROP SITS is the creator's to choose (owner, 2026-09-06: "let the user decide where
  // the crop happens - they can slide it"). 0 is the top or left edge, 1 the bottom or right, 0.5
  // the middle, which is what it always did. Clamped, so a focus of 2 is the far edge and not a
  // crop that runs off the picture.
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  return {
    sx: (srcW - sw) * clamp(focusX),
    sy: (srcH - sh) * clamp(focusY),
    sw,
    sh
  };
}

/**
 * Scale to COVER the card and crop the middle - the way a browser's `object-fit: cover` does -
 * averaging the source pixels under each destination pixel so a 4K screenshot lands smooth rather
 * than sparkly. The cheap box filter is enough: the picture goes under text at a third of a
 * screen's width.
 */
export function coverFit(img: DecodedImage, W: number, H: number, focusX = 0.5, focusY = 0.5): DecodedImage {
  const { sx: ox, sy: oy, sw: srcW, sh: srcH } = coverCrop(img.width, img.height, W, H, focusX, focusY);
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
