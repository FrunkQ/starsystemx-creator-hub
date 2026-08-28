import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // NO SERVICE WORKER ON THE HUB. Deliberate: see docs/decisions.md D-07. The engine's own sw.js
    // is the cautionary tale (creator-hub-design.md 5.2) and a page whose job is SSR plus one cover
    // image gains nothing from a precached shell while inheriting a cutover failure mode forever.
    serviceWorker: { register: false }
  }
};
