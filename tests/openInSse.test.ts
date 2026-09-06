// The one-click open (src/lib/openInSse.ts): nothing until the engine prefix exists, and nothing
// for a map the engine will refuse.
import { describe, it, expect } from 'vitest';
import { openLink } from '../src/lib/openInSse';

const PREFIX = 'https://beta.starsystemx.com/?open=';

describe('open in Star System Explorer', () => {
  it('is nothing until the engine can receive a URL', () => {
    expect(openLink('', 'https://x.test', 'sol', 'starmap')).toBeNull();
    expect(openLink(null, 'https://x.test', 'sol', 'starmap')).toBeNull();
  });

  it('is the prefix with the download URL appended, encoded', () => {
    expect(openLink(PREFIX, 'https://x.test', 'local-neighbourhood', 'starmap'))
      .toBe(PREFIX + 'https%3A%2F%2Fx.test%2Fapi%2Fdownload%2Flocal-neighbourhood');
  });

  // The engine's `?open=` path classifies the file and refuses anything that is not a campaign:
  // "That link points at a single system rather than a campaign." A button that cannot keep its
  // promise is not shown - R-18 asks for the door, and this test comes out when it opens.
  it('is nothing for a single system, which the engine refuses', () => {
    expect(openLink(PREFIX, 'https://x.test', 'sol', 'system')).toBeNull();
  });

  it('is nothing when the kind is not known - fail closed, never a dead end', () => {
    expect(openLink(PREFIX, 'https://x.test', 'sol', null)).toBeNull();
    expect(openLink(PREFIX, 'https://x.test', 'sol', undefined)).toBeNull();
  });
});
