import { sveltekit } from '@sveltejs/kit/vite';
// vitest/config rather than vite: the `test` block is not part of Vite's own schema.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: { include: ['tests/**/*.test.ts'] }
});
