import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// THE BUILD KNOWS ITS OWN VERSION. `kit.version.name` defaults to a timestamp, which makes every
// build look different and none identifiable. Reading package.json here puts the release number
// into `$app/environment`'s `version`, so the footer and the `x-hub-version` header can say which
// build is serving - and "is the fix live?" becomes one curl rather than a guess from behaviour.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    version: { name: pkg.version },
    // NO SERVICE WORKER ON THE HUB. Deliberate: see docs/decisions.md D-07. The engine's own sw.js
    // is the cautionary tale (creator-hub-design.md 5.2) and a page whose job is SSR plus one cover
    // image gains nothing from a precached shell while inheriting a cutover failure mode forever.
    serviceWorker: { register: false }
  }
};
