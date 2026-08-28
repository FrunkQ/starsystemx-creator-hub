# Changelog

## 0.3.0 — 2026-08-28

### The GM/player choice is now read from the file, not asked

The owner pointed out the choice is already made in the app at export time, so asking the uploader
to restate it was asking them to get it wrong - and the wrong answer publishes somebody's campaign
secrets. The radio buttons are gone.

Detection is ASYMMETRIC and that is the design. GM notes, player-hidden objects, secret tags,
anomaly overrides, a hidden description with its text still attached, or an undo history all mean
CERTAINLY a GM tree, because computePlayerSnapshot removes every one of them. None of them means a
player export OR a GM export of a campaign with no secrets - indistinguishable, and harmless,
because a GM tree with nothing hidden in it has nothing to leak.

So the hub stopped asking which mode a file was exported in and started asking whether there is
anything in it the creator would not want published. The warning is consequently rare, specific
("GM notes on 12 objects; 3 objects hidden from players") and worth reading, instead of a choice
everyone had to make before they understood it. `published_gm_tree` now records a detected fact.

Requested from the engine as R-10: an `exportMode` stamp, for the LABEL only - a stamp rides inside
a stranger's file and is a claim, so detection stays the control.

### Checks

42 tests. svelte-check clean. Build clean.

## 0.2.0 — 2026-08-28

The owner answered the two open gate questions and added three requirements: creator write-ups with
screenshots, an honesty attestation, and hooks for Patreon and Discord.

### Answers, now built

- **Legacy saves are accepted and base-stamped.** Unstamped bundles no longer refused; they are
  stamped as format 1 and the row is flagged, so the assumption stays visible in the database.
- **Two versions, two jobs.** `bundle_format` is the contract number and an unknown value is a
  refusal; `created_with` is the engine's `appVersion` build stamp, a CAPABILITY MARKER that is
  never a parse gate. Conflating them would start refusing perfectly readable maps.
- **An incomplete attribution blocks publishing.** CC-BY with no credit now blocks alongside
  provenance that is missing entirely, and the gate is re-checked server-side at the moment of
  publishing rather than only at upload.

### Creators can sell their own maps

- Write-up page: title, one-liner, description, tags, publish and unpublish.
- Screenshots, uploaded by the creator, **through the ordinary hash ledger** - same dedup, same
  review queue, no second moderation path. Any screenshot can be made the cover.
- The publish blocker names the assets still needing a credit, rather than just saying no.

### The attestation

Asked plainly at upload and recorded append-only WITH THE EXACT TEXT SHOWN, not just a version
number - so an old record still says what was actually agreed to after the wording changes. One
source for that text, shared by the form and the record, or the two drift on the first tweak.

### Patreon and Discord hooks - built, switched off

- Entitlements are a grant LEDGER, not a tier column: it can answer why someone has Pro, when it
  lapses, and what happens when a cancellation meets a gift. Patreon grants carry the paid-through
  date as an expiry, so a missed webhook lapses instead of becoming free Pro forever.
- Linked identities, unique per provider, so one pledge cannot buy Pro for a dozen accounts.
- Badges are DERIVED from what the hub knows - published a map, earned hearts - which is the one leg
  neither Patreon nor Discord can do. Lost when the thing that earned them goes away.
- An idempotent outbox for outbound Discord calls, because a fire-and-forget role assignment fails
  silently and nobody notices for a month.
- Webhook signature verified against the RAW body, constant-time, failing closed.
- What Pro is worth is config rows, not a branch in code.

### Fixed

- **The creator could not see their own pending screenshot.** The privileged image route was
  admin-only. Now ONE route with two branches - admin, or the creator who owns a map using those
  bytes - rather than a second route, which would have made the "unreviewed is never served" rule
  uncheckable by reading one file.

### Docs

`docs/sse-requirements.md` (hand to an SSE agent), `docs/integrations.md`, `docs/deployment.md`.

### Analytics

Cloudflare Web Analytics, off unless `PUBLIC_CF_BEACON_TOKEN` is set - no token means no third-party
script tag at all. The hub only runs on one host so there is no provider switching here; the engine
has that problem for real during the migration window and it is written up as R-09.

### Checks

35 tests. svelte-check clean. Build clean.

## 0.1.0 — 2026-08-28

First build. Phase 2 of `creator-hub-design.md` — the funnel — with the moderation gates from day
one rather than after, because a public upload path without them is a liability from its first hour
and the hash ledger has to exist from the first asset or the queue starts life with a backlog.

### The funnel

- Front page and system pages, server-rendered. Download is the primary action: one click, above the
  fold, above the description, no account.
- Cover image is the only picture. No 3D, no rendered preview, no engine on the hub.
- Copy-paste JSON snippets per body and construct, collapsed so they never compete with the
  download.
- OG tags for link previews, which is the whole reason the cover image matters.
- **No service worker.** Deliberate — see `docs/decisions.md` D-02.

### Reading a bundle

- Constants mirrored from the engine rather than imported, so the two repos stay on their own
  release cadences.
- **Uploads are closed until the engine ships a `bundleFormat` stamp and a canonical fixture.** The
  format gate refuses everything politely and says why. This is the shipped behaviour, not a stub.
- Zip reader mirrored from the engine's central-directory walker, then hardened for hostile input:
  path traversal, member count, declared-size and compression-ratio caps, no `.svg`.
- Provenance recomputed from the document. `ATTRIBUTIONS.md` is treated as the creator's *claim* and
  never as the gate — it is a file inside a stranger's zip.

### Moderation

- Hash ledger: a verdict is per-sha256, not per-upload. Approved hashes never re-enter the queue;
  banned hashes are refused before anything reaches R2. Exact-byte, not perceptual — said plainly
  in the UI and the docs.
- **The hub computes every hash from the bytes.** A path-supplied hash is a claim and is verified;
  trusting one would let a crafted bundle inherit another asset's approval.
- An upload is never blocked; an unreviewed asset is never served — **including from the download**,
  which is reassembled from approved assets only.
- Private R2 bucket, every object served through a ledger check. No quarantine bucket, no copy on
  approval; revoking something already public is a row update.
- Keyboard-driven review tool with undo, showing each image beside the licence its uploader claimed.
- Reports and hearts. Gates as config rows, editable without a deploy, including the JSON-only kill
  switch.
- Every admin action recorded — who, what, when, why.

### Schema

- 12 tables with the design's invariants encoded: verdicts outlive the accounts that uploaded them,
  shared hashes are refcounted, one heart per person per map, one report per person per target.
- RLS on every table, deny by default, as defence in depth behind the anon key.

### Checks

30 tests. `svelte-check` clean. Build clean.

### Known gaps

- Phase 3 (hearts UI, search, discovery) not built; API and schema are ready.
- Account deletion not built; the refcount it needs exists.
- `/terms`, `/acceptable-use` and `/takedown` are linked but do not exist — **they must be real
  before uploads open.** See `docs/decisions.md` Q-04.
