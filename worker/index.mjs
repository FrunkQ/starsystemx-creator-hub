// The Worker entry: SvelteKit's generated worker, plus the one thing it cannot make - a clock.
//
// ============================================================================================
// WHY THIS FILE EXISTS. adapter-cloudflare emits `.svelte-kit/cloudflare/_worker.js` with a
// `fetch` handler and nothing else, so a Cloudflare Cron Trigger on this Worker had nothing to
// call. Wrangler bundles THIS file instead (wrangler.toml `main`); it hands every request to the
// generated worker untouched and adds `scheduled`, which runs the two housekeeping routes the
// hub already has - the outbox drain and the backup - by calling them in-process.
//
// NO SECRET NEEDED. A request made here never crossed Cloudflare's edge, so it carries neither
// `cf-connecting-ip` nor `request.cf`; the routes treat that pair's absence as "the Worker
// itself" (D-33). An external scheduler can still call the same routes with `x-cron-key`.
//
// The schedule is in wrangler.toml: the outbox every fifteen minutes, a backup weekly.
// ============================================================================================
import kit from '../.svelte-kit/cloudflare/_worker.js';

const INTERNAL = 'https://hub.internal';

async function call(path, env, ctx) {
  const res = await kit.fetch(new Request(INTERNAL + path, { method: 'POST' }), env, ctx);
  const text = await res.text().catch(() => '');
  console.log('scheduled ' + path + ' -> ' + res.status + ' ' + text.slice(0, 300));
  return res.ok;
}

export default {
  fetch: (request, env, ctx) => kit.fetch(request, env, ctx),

  async scheduled(event, env, ctx) {
    // Every firing drains the outbox; the weekly firing also takes the backup.
    await call('/api/admin/outbox', env, ctx);
    if (event.cron.startsWith('0 3')) await call('/api/admin/backup', env, ctx);
  }
};
