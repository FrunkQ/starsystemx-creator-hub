# StarSystemX Creator Hub

Share star systems and campaign starmaps for
[Star System Explorer](https://starsystemx.com). Someone posts a link, somebody else clicks it,
downloads the bundle in one click and opens it in SSE.

**This is a separate application in its own repository. It does not touch the SSE engine repo.**

---

## The one thing to understand before changing anything

**The hub is a funnel, not a destination.** Its purpose is to get a bundle into somebody's Star
System Explorer — not to browse, not to preview, not to be a nice place to spend time.

That single framing settles most page design:

- **download is the primary action, one click, above the fold, above the description**, and needs no
  account
- **no 3D preview and no rendered preview.** There is no engine on the hub at all. The cover image
  is the only picture
- copy-paste JSON snippets stay, but are **secondary** — the cheap way to lift one body without
  taking the whole map
- **every page says what SSE is and links to it.** A visitor from a Discord link may never have
  heard of it
- the hub does not need to be fast at *rendering*. It needs to be fast at **loading**

---

## Status

**Phase 2 of `creator-hub-design.md`, with the gates from day one.** Upload, parse, normalise,
store, one-click download, OG previews — plus the gate config table, the hash ledger, the admin
review tool and reports, which ship *with* this phase and not after it.

**Uploads are deliberately closed.** The engine has not yet stamped a `bundleFormat` integer into
the bundle or shipped a canonical fixture (phase 0, engine-side). Until it does,
`KNOWN_BUNDLE_FORMATS` is empty and every upload is refused politely, by design — the hub will not
read a format it has never been tested against into a public database. Opening it is a two-line
change: see `docs/decisions.md` D-01.

**Creators write up their own maps** and add screenshots (which go through the same review queue as
anything else), then publish. **Patreon and Discord hooks are built and switched off** — the schema
is the expensive part to change later, so it exists now; see `docs/integrations.md`.

Not built yet: hearts and discovery UI (phase 3 — the API and schema exist), account deletion, the
Patreon OAuth callback (the webhook and entitlement logic are done), in-app sign-in for SSE
(`docs/sse-requirements.md` R-06), and `/terms`, `/acceptable-use`, `/takedown`.

---

## Read these before working on it

| file | why |
|---|---|
| `docs/contract-with-sse.md` | the seam with the engine, **and the five non-obvious things about it** |
| `docs/decisions.md` | what was decided and why; **what is still the owner's to answer** |
| `docs/moderation.md` | how the ledger works operationally |
| `docs/integrations.md` | Patreon, Discord and the hub — the three legs and which way each points |
| `docs/sse-requirements.md` | **hand this to an agent working in the SSE repo** |
| `docs/deployment.md` | standing it up on Cloudflare, and what must be true before uploads open |
| `creator-hub-design.md` (engine repo, `docs/dev/`) | the design this is built to |

The three things most likely to be got wrong are C-01, C-02 and C-03 in `contract-with-sse.md`. They
are there because each one was a live mistake waiting to happen.

---

## Stack

SvelteKit 2 · Svelte 5 · TypeScript · Cloudflare Workers (static assets) · Supabase (Postgres) · R2 · `fflate`

`fflate`, **not JSZip** — the engine already writes this format with it, and adding a second zip
library to read what the first one writes is the duplication fault worth avoiding.

## Layout

```
src/lib/bundle/     the seam: mirrored constants, format gate, capability marker, hashing,
                    hardened zip reader, provenance, normalisation
src/lib/server/     ledger, gates, config, R2, ingest, download packing, entitlements, audit, auth
src/lib/server/integrations/   Discord, Patreon, badges, the outbox
src/routes/         the funnel (/, /s/[slug], /upload), the creator's pages (/manage, /account)
                    and the admin tool (/admin/*)
db/migrations/      the schema, with the design's invariants encoded in it
tests/              35 tests; everything testable without the engine fixture
```

## Running it

```bash
npm install
```

```bash
npm run dev
```

Checks — all three must be green before a push:

```bash
npm run check && npm test && npm run build
```

### Configuration

Copy `.env.example`. R2 buckets and Supabase secrets are bound in `wrangler.toml`; the service-role
key is a secret, never a committed value.

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Apply `db/migrations/*.sql` in order.

---

## Conventions

- **A green build before every push.** `npm run build`, not just `svelte-check`.
- **Explicit staging.** Never `git add -A`.
- **UK English** in prose and UI.
- **Record what you had to work out**, so the next session does not re-derive it. That is what
  `docs/contract-with-sse.md` is for.
- Anything that changes what the product **is**: recommend, then ask.
