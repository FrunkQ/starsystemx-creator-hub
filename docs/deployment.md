# Deploying the hub

A checklist for standing this up on a fresh Cloudflare account. **This is the hub only — it is a new
project with no cutover and no returning users, and it is NOT the Vercel→Cloudflare migration of
starsystemx.com**, which is a different job with a known failure mode and belongs to the owner and
coordinator.

---

## 1. Cloudflare

**A WORKER, not a Pages project.** The two are different deploy targets with different config keys,
and a Pages key in a Worker project is **silently ignored** rather than flagged — so the failure
surfaces later as something unhelpful. `wrangler.toml` is set up for Workers:

```
main      = ".svelte-kit/cloudflare/_worker.js"
[assets]  directory = ".svelte-kit/cloudflare", binding = "ASSETS"
```

Build command is `npm run build`. Verify the whole config without deploying anything:

```bash
npx wrangler deploy --dry-run
```

That prints the bindings it resolved — expect `HUB_ASSETS`, `HUB_BUNDLES` and `ASSETS`.

**Two R2 buckets.** Both **private**. Do not enable a public r2.dev domain on either — every object
is served through a Worker that checks the ledger, and a public bucket URL silently bypasses the one
control the whole moderation design rests on.

```bash
npx wrangler r2 bucket create sshub-assets
```

```bash
npx wrangler r2 bucket create sshub-bundles
```

> **`ASSETS` is a trap in BOTH directions, and it reverses between the two targets.** In a **Pages**
> project it is a *reserved* name and wrangler refuses the config outright. In a **Workers** project
> it is *required* — the worker the adapter generates calls `env.ASSETS.fetch` by name. So the R2
> buckets are `HUB_ASSETS` / `HUB_BUNDLES`, which was necessary under Pages and is still necessary
> under Workers, now because `ASSETS` is taken by the static-asset fetcher.

> **Wrangler auto-config, and a trap worth knowing about.** When wrangler deploys a project with
> **no** `wrangler.toml`, it runs an auto-configuration pass that guesses at settings and can
> **inject `wrangler types --check` into your build command** — which then fails with
> *"Types file not found at worker-configuration.d.ts"* even though your build script contains no
> such thing. This is what broke the first Cloudflare deploy of the SSE engine
> (`docs/sse-requirements.md` R-08). **The hub ships a `wrangler.toml`, so auto-config has something
> real to read and should not guess.** If that error ever appears here anyway, the fix is to run
> `npx wrangler types` once and commit `worker-configuration.d.ts` — not to edit the build script.

**A Cron Trigger** for the integration outbox, once Discord is switched on. Every 5 minutes is
plenty; it POSTs `/api/admin/outbox` with the `x-cron-key` header set to `CRON_SECRET`.

**Git builds.** Workers Builds is configured under the Worker's **Settings → Build**: connect the
repo and set the production branch to `main`. It is not automatic the way Vercel is — connecting the
repository is a separate step from creating the Worker, and a Worker created from the dashboard
starts life with a placeholder deployment and no Git connection at all.

---

## 2. Supabase

Create the project, then apply the migrations **in order**:

```bash
for f in db/migrations/*.sql; do echo "-- $f"; cat "$f"; done > /tmp/all.sql
```

Paste into the SQL editor, or use the Supabase CLI. They are ordinary SQL and are meant to be read.
Every migration from 0014 on is safe to run twice, and the code deployed ahead of it tolerates the
missing columns (`src/lib/server/tolerant.ts`) - so run them when convenient, not in a panic.

Then make yourself an admin — there is no bootstrap route on purpose, because a route that can mint
an admin is a route that can be abused:

```sql
insert into creators (id, handle, display_name, role)
values ('<your-auth-user-uuid>', 'frunk', 'FrunkQ', 'admin');
```

---

## 3. Secrets

None of these belong in the repo. `.env.example` lists the shape.

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

| secret | needed for | when |
|---|---|---|
| `SUPABASE_URL` | everything | now |
| `SUPABASE_SERVICE_ROLE_KEY` | everything | now |
| `VISITOR_SALT` | the anonymous visitor hash on downloads (D-20) | before the usage numbers are relied on; any long random string |
| `CRON_SECRET` | the outbox drain | when Discord goes on |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | linking accounts | when Discord goes on |
| `DISCORD_BOT_TOKEN` | assigning roles | when Discord goes on |
| `PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET` | linking accounts | when Patreon exists |
| `PATREON_WEBHOOK_SECRET` | pledge events | when Patreon exists |

**The service-role key bypasses row-level security.** It belongs in Workers secrets and nowhere else
— never in a client bundle, never in a `PUBLIC_` variable.

---

## 4. Before uploads are opened

In order, and the first two are hard blocks:

1. **The engine ships `bundleFormat` + a fixture** (`docs/sse-requirements.md` R-01, R-02). Until
   then every upload is refused by design.
2. **`/terms`, `/acceptable-use` and `/takedown` exist.** They are linked in the footer and those
   routes are **not built**. A public upload path without them is the launch blocker named in
   `decisions.md` Q-04.
3. Set `uploads_per_user_per_day` and the other gates at `/admin/config` — they take effect on the
   next request, no deploy.
4. Walk one real bundle through: upload → review queue → approve → the picture appears → download
   and check the zip contains it.
5. **Then test the withholding**, which is the thing most worth proving by hand: upload a map with a
   novel image, download it **before** approving, and confirm the image is **absent from the zip**
   and named in `README.txt`. That is the rule in design 6.2, and a bug there is invisible until it
   is embarrassing.

---

## 5. Analytics

Either is fine and neither is required:

- **Dashboard toggle** — the Worker > Web Analytics. Cloudflare injects the beacon; no code.
- **`PUBLIC_CF_BEACON_TOKEN`** — set it and `src/routes/+layout.server.ts` renders a deferred beacon
  script instead. Unset means **no script tag at all**, which is the default and is correct for a
  page whose whole job is to load fast.

The hub only ever runs on Cloudflare, so there is no provider-switching logic here. The engine has
that problem for real, because during the migration window it runs on two hosts at once — see
`docs/sse-requirements.md` R-09.

---

## 6. Domain — DEFERRED to the migration, deliberately

**The hub lives on `starsystemx-creator-hub.orange-tree-847c.workers.dev` and that is the decision
for now** (owner, 2026-08-28). A custom domain waits for the full Vercel→Cloudflare migration.

### Why it cannot be done sooner, which is not obvious

`starsystemx.com` is served by **Vercel's nameservers** — `ns1.vercel-dns.com` / `ns2.vercel-dns.com`,
with the apex on Vercel's IPs. And **a Cloudflare Workers custom domain requires the zone to be
active in your Cloudflare account.** It is about who answers DNS, not about where anything is
deployed, so no record added on the Vercel side can attach a subdomain to the Worker.

**The two workarounds are both worse than waiting:**

- **A redirect** from a Vercel-hosted subdomain makes `workers.dev` the canonical URL — every shared
  link, and every OG preview, resolves there. For a hub whose product *is* link-sharing, that is
  actively harmful.
- **A Vercel rewrite/proxy** keeps the pretty URL but routes every bundle download through Vercel,
  paying Vercel egress for exactly the traffic R2 was chosen to make free.

### What the move will involve, when it happens

Change the nameservers at the registrar to Cloudflare's. **This does not move the site** — SSE keeps
running on Vercel, and Cloudflare simply answers DNS with the same apex A records.

**Checked 2026-08-28: there are no MX and no TXT records on the domain**, which removes the classic
way a nameserver move goes wrong (mail silently stopping). Re-check before switching; that fact has
a shelf life.

Doing the zone move *early and on its own* would de-risk the later cutover — it turns "cut DNS" from
a nameserver change into a record change. But it is live-product DNS and belongs to the owner and
coordinator, not to an agent.

### When a domain does arrive

`share.starsystemx.com` or `community.starsystemx.com`; the hub does not care and nothing is
hard-coded to a host. Pick **one** canonical and 301 the other — two hostnames serving identical
pages split OG previews and search ranking across two names.

**Not the apex `starsystemx.com`.** The engine registers a service worker at that origin, and a
service worker is scoped by origin. Sharing one would let the app's precache interfere with the
hub's pages — a smaller version of exactly the failure the migration has to avoid. (The hub itself
registers no service worker at all — `decisions.md` D-02.)
