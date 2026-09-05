// The one-click open (src/lib/openInSse.ts): nothing until the engine prefix exists.
import { describe, it, expect } from 'vitest';
import { openLink } from '../src/lib/openInSse';

describe('open in Star System Explorer', () => {
  it('is nothing until the engine can receive a URL', () => {
    expect(openLink('', 'https://x.test', 'sol')).toBeNull();
    expect(openLink(null, 'https://x.test', 'sol')).toBeNull();
  });

  it('is the prefix with the download URL appended, encoded', () => {
    expect(openLink('https://starsystemx.com/?open=', 'https://x.test', 'local-neighbourhood'))
      .toBe('https://starsystemx.com/?open=https%3A%2F%2Fx.test%2Fapi%2Fdownload%2Flocal-neighbourhood');
  });
});
