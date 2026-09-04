// jpeg-js ships no types for the one call the cover designer makes.
declare module 'jpeg-js' {
  export interface JpegDecoded { width: number; height: number; data: Uint8Array }
  export function decode(
    bytes: Uint8Array,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number; maxResolutionInMP?: number }
  ): JpegDecoded;
}
