import { sveltekit } from '@sveltejs/kit/vite';
// vitest/config rather than vite: the `test` block is not part of Vite's own schema.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  // WHEN THIS BUILD WAS MADE (D-87). A map last read before it was read by an older version of the
  // hub, which is the only honest meaning "behind" has for re-indexing: the reader changes when the
  // code does, not when the date does. Every deploy counts, even one that did not touch the reader -
  // re-reading a map that did not need it costs a moment; calling a stale map current cost a map its
  // bodies for an afternoon.
  define: { __HUB_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  test: { include: ['tests/**/*.test.ts'] }
});
