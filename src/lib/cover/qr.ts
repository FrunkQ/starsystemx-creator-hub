// A QR code as a grid of booleans, drawn by the rasteriser like any other shape.
//
// `qrcode-generator` is pure JavaScript with no DOM and no dependencies, which is what a Worker
// can run. Error-correction level M: a cover is shared as an image that gets rescaled and
// recompressed by every platform it passes through, and M survives that where L does not.
import qrcode from 'qrcode-generator';

/** Row-major; `true` is a dark module. Type number 0 lets the library pick the smallest fit. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}
