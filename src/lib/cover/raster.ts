// A software canvas: the four shapes a star-system card needs, anti-aliased, on a byte buffer.
//
// Everything is distance-field coverage: for each pixel in a shape's bounding box, how far its
// centre is from the shape's edge decides how much of the colour it takes. One pixel of soft edge
// is enough to look drawn rather than computed, and it costs nothing worth measuring at 1200x630.
export type RGB = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Raster {
  readonly data: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 3);
  }

  /** A vertical gradient, top colour to bottom colour. */
  gradient(top: RGB, bottom: RGB): void {
    const { width, height, data } = this;
    for (let y = 0; y < height; y++) {
      const t = height > 1 ? y / (height - 1) : 0;
      const r = top[0] + (bottom[0] - top[0]) * t;
      const g = top[1] + (bottom[1] - top[1]) * t;
      const b = top[2] + (bottom[2] - top[2]) * t;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
  }

  blend(x: number, y: number, c: RGB, a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    const d = this.data;
    if (a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; return; }
    d[i] += (c[0] - d[i]) * a;
    d[i + 1] += (c[1] - d[i + 1]) * a;
    d[i + 2] += (c[2] - d[i + 2]) * a;
  }

  /** A filled disc; `ky` squashes it vertically into an ellipse (an orbit seen at a tilt). */
  circle(cx: number, cy: number, r: number, c: RGB, alpha = 1, ky = 1): void {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r * ky - 1), y1 = Math.ceil(cy + r * ky + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / ky;
        const d = Math.sqrt(dx * dx + dy * dy) - r;
        this.blend(x, y, c, clamp01(0.5 - d) * alpha);
      }
    }
  }

  /** A stroked circle of the given line thickness. */
  ring(cx: number, cy: number, r: number, thickness: number, c: RGB, alpha = 1, ky = 1): void {
    const reach = r + thickness;
    const x0 = Math.floor(cx - reach - 1), x1 = Math.ceil(cx + reach + 1);
    const y0 = Math.floor(cy - reach * ky - 1), y1 = Math.ceil(cy + reach * ky + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / ky;
        const dr = Math.abs(Math.sqrt(dx * dx + dy * dy) - r);
        this.blend(x, y, c, clamp01(thickness / 2 + 0.5 - dr) * alpha);
      }
    }
  }

  /** A soft radial glow, strongest at the centre, gone at `r`. */
  glow(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const t = 1 - Math.sqrt(dx * dx + dy * dy) / r;
        if (t > 0) this.blend(x, y, c, t * t * alpha);
      }
    }
  }

  /** A straight stroke between two points, anti-aliased like everything else. */
  line(x0: number, y0: number, x1: number, y1: number, thickness: number, c: RGB, alpha = 1): void {
    const reach = thickness / 2 + 1;
    const bx0 = Math.floor(Math.min(x0, x1) - reach), bx1 = Math.ceil(Math.max(x0, x1) + reach);
    const by0 = Math.floor(Math.min(y0, y1) - reach), by1 = Math.ceil(Math.max(y0, y1) + reach);
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const px = x + 0.5, py = y + 0.5;
        // Distance from the pixel centre to the nearest point on the segment.
        const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
        const ex = px - (x0 + t * dx), ey = py - (y0 + t * dy);
        const d = Math.sqrt(ex * ex + ey * ey);
        this.blend(x, y, c, clamp01(thickness / 2 + 0.5 - d) * alpha);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, alpha = 1): void {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, c, alpha);
  }
}
