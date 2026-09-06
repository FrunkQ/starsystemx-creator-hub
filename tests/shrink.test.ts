// WHAT `shrinkTo` PROMISES, pinned (D-60). The browser decides here whether a creator's picture is
// re-encoded at all, and a wrong answer either throws away quality for nothing or keeps megabytes
// nobody will look at.
import { describe, it, expect } from 'vitest';
import { shrinkTo } from '../src/lib/cover/image';

describe('shrinkTo', () => {
  it('leaves a picture that already fits completely alone', () => {
    expect(shrinkTo(1200, 630, 2048)).toBeNull();
    expect(shrinkTo(2048, 2048, 2048)).toBeNull();
  });

  it("shrinks the owner's 2048 x 2100 to the limit on its LONG edge", () => {
    // The tall edge is the one over the line, so that is the one that lands on it.
    const to = shrinkTo(2048, 2100, 2048);
    expect(to).toEqual({ width: 1997, height: 2048 });
  });

  it('keeps the aspect ratio, which is what stops a cover crop being a lie', () => {
    const to = shrinkTo(4000, 1000, 2000)!;
    expect(to.width / to.height).toBeCloseTo(4, 2);
  });

  it('never rounds a short edge away to nothing', () => {
    const to = shrinkTo(10000, 3, 1000)!;
    expect(to.height).toBeGreaterThanOrEqual(1);
  });

  it('treats a limit of zero as "no limit", not as "shrink to nothing"', () => {
    // A missing config row reads as 0, and 0 must never mean a one-pixel picture.
    expect(shrinkTo(3000, 3000, 0)).toBeNull();
  });
});
