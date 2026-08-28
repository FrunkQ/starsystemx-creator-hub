# Deploying the hub

A checklist for standing this up on a fresh Cloudflare account. **This is the hub only — it is a new
project with no cutover and no returning users, and it is NOT the Vercel→Cloudflare migration of
starsystemx.com**, which is a different job with a known failure mode and belongs to the owner and
coordinator.

---

## 1. Cloudflare

**Pages project.** Connect the repo, or deploy from the CLI. Build command `npm run build`, output
directory `.svelte-kit/cloudflare` (already set in `wrangler.toml`).

**Two R2 buckets.** Both **private**. Do not enable a public r2.dev domain on either — every object
is served through a Worker that checks the ledger, and a public bucket URL silently bypasses the one
control the whole moderation design rests on.

```bash
npx wrangler r2 bucket create sshub-assets
```

```bash
npx wrangler r2 bucket create sshub-bundles
```

> **The binding is `HUB_ASSETS`, not `ASSETS`.** `ASSETS` is **reserved** in Pages projects — it is
> the static-asset fetcher — and wrangler refuses the config outright. This cost a debugging round
> the first time; the names in `wrangler.toml` are already correct.

**A Cron Trigger** for the integration outbox, once Discord is switched on. Every 5 minutes is
plenty; it POSTs `/api/admin/outbox` with the `x-cron-key` header set to `CRON_SECRET`.

---

## 2. Supabase

Create the project, then apply the migrations **in order**:

```bash
for f in db/migrations/*.sql; do echo "-- $f"; cat "$f"; done > /tmp/all.sql
```

Paste into the SQL editor, or use the Supabase CLI. They are ordinary SQL and are meant to be read.

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
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
```

| secret | needed for | when |
|---|---|---|
| `SUPABASE_URL` | everything | now |
| `SUPABASE_SERVICE_ROLE_KEY` | everything | now |
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

## 5. Domain

`share.starsystemx.com` or `community.starsystemx.com` — either works; the hub does not care and
nothing is hard-coded to a host.

**Do not put the hub on the apex `starsystemx.com`.** The engine registers a service worker at that
origin, and a service worker is scoped by origin. Sharing one would let the app's precache interfere
with the hub's pages — which is a smaller version of exactly the failure the app migration has to
avoid. A subdomain has no such interaction. (The hub itself registers no service worker at all —
`decisions.md` D-02.)
