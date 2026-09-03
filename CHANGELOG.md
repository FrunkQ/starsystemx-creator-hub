# Changelog

## 0.7.2 — 2026-09-03

### The build says which version it is

Verifying a deploy meant guessing from behaviour, and the guess was wrong once today: the client
chunk names change on every build regardless of content, so they cannot tell 0.7.1 from 0.7.0. Now
the footer shows the version and every response carries an `x-hub-version` header, both read from
`package.json` at build time. "Is the fix live?" is one curl.

## 0.7.1 — 2026-09-03

### The generated cover showed once, then vanished

Found by looking at the live page twice. The backfill upserted the cover's `system_assets` row on a
conflict target of `(system_id, sha256)`; the table's primary key is `(system_id, bundle_path)`, so
PostgREST refused the row, supabase-js reported it in `error` rather than throwing, and the link
never landed. On the first view the cover was approved by construction; on every view after, the
page looked up approval through the link table, found nothing, and showed no picture - and no
Open Graph image, which is the one that matters. Fixed at both ends: the right conflict target, and
the page now asks the ledger about the cover hash directly. `tests/schema.test.ts` pins the upsert
key to the migration text so it cannot drift again.

## 0.7.0 — 2026-09-03

### A map with no picture gets one drawn from itself

Most saves carry no picture the hub can host, so their pages - and every Discord embed of them -
had no image. Now, when the creator chose no cover and the bundle carries nothing to guess from,
the hub draws a card: the primary star, its planets and belts on tilted orbits with their moons,
the title, the counts, and the byline. Drawn deterministically from the map's own rows, so the
same map yields the same bytes and a re-upload reuses the asset.

Built with no dependencies a Worker cannot satisfy: a small rasteriser, a 5x7 bitmap font and a
PNG encoder over `fflate` (`src/lib/cover/`). It enters the ledger already approved - a deliberate
exception, recorded as D-21, because it is not user content. Any real picture always wins.

## 0.6.0 — 2026-09-03

### The engine's stream F, mirrored - including the bug that blocked a creator's own screenshot

SSE v3.0.243-264 shipped everything `docs/sse-requirements.md` asked for except R-13 and R-14. The
hub had integrated the format stamp and the fixtures, and nothing else. Now:

- **`capturedInApp`** - a screenshot the app took of the map no longer counts as "missing
  provenance" (C-07). Without this the hub refused to publish a map whose cover was the creator's
  own beauty shot, after the app had told them it was fine.
- **`coverAssetId`** - the cover the creator chose in the app is used first; the guess is the fallback.
- **`revision`** - stored, and an update carrying a LOWER revision than the published copy is
  refused with `stale-revision` and both numbers, unless `confirmStale=on`. Single-system saves
  carry no counter and are never checked.
- **`exportMode`** - stored and shown as a label; never a gate.
- `/m/<slug>` redirects to `/s/<slug>`, because the engine's config still says `/m/`.
- The upload accepts the file under `file` as well as `bundle`, which is what the engine posts.

### A usage dashboard at /admin/stats

Growth per week, downloads and distinct visitors, most downloaded maps and cartographers, storage
against the R2 free allowance, refused uploads by reason, the review queue and open reports. One SQL
function, no chart library. Downloads are now EVENTS with a week-scoped visitor hash and no address
(D-20); refusals are events carrying their code.

### Migration 0014 - and the code runs ahead of it on purpose

A write that names a column the database does not have yet drops that column and lands anyway
(`src/lib/server/tolerant.ts`), so uploads keep working between the deploy and the owner running
the migration. The stats page says plainly when its function is missing.

## 0.5.0 — 2026-09-03

### One tree, with copying on every row

The map page's contents were a 161-row alphabetical table with a second 172-block list of JSON
snippets under it. Both are gone. What is in a map is now a tree - a star, its planets, their moons -
collapsed by default and summarised where it is collapsed ("12 planets, 30 moons"), with a flat icon
for what each thing is, orbit order or A to Z, and expand/collapse all.

Every row has a copy control. Copying a branch copies it and everything beneath it as a **clip**
(`src/lib/bundle/clip.ts`): a versioned envelope, the source page, the nodes parents-first with the
root unparented. A leaf opens to its own JSON. The old snippet list and `SnippetBlock` are deleted.

### The paste side does not exist

Copying has led nowhere since it shipped: nothing in Star System Explorer reads a node from the
clipboard, on main or the hub branch. Written up as R-14 in `docs/sse-requirements.md`, to be built
on the engine's G64 reparent work. Until it lands, a clip is text the app does not recognise.

### Since 0.4.0, unrecorded here until now

- Node tags were silently empty: the engine's tags are `{key, value}` objects and the reader kept
  only strings. Fixed; takes effect on re-upload.
- Device-code pairing (`/api/device/*`, `/link`), app tokens on `/account`, direct save/load for SSE.
- Admin one-shot debug upload links (`/admin/debug`).
- CORS on the public reads, applied at the hook by cloning the response.
- The bundle format gate opened on the real fixtures: `KNOWN_BUNDLE_FORMATS = [1]`.
- Site name and url as config rows; `og:image` made absolute.

## 0.4.0 — 2026-08-28

### A rule-driven facet system, so it can grow without a deploy

The owner: *"we want a flexible categorised tag (and a tag can carry a value) ... if players add
their own custom gases, engines, fuels then those are added to the starmap file - so we know things
like Custom Gases: 3, Custom Liquids: 4."*

That removes the need for a separate artefact library entirely. The hub does not need a "fuels"
section; it needs the map to carry its own custom fuels, and it counts them.

Facets are now DECLARED, not coded - `{id, label, category, countKeysAt|countItemsAt|tagPattern,
baseline, minCount, enabled}` - and the rule list is a config row. Custom calendars, tag categories
and POI packs already ride in a save and are counted today. Gases, liquids, fuels, engines and
reactions ship as DISABLED rules naming the keys the hub will look for, so enabling them is an edit
rather than a release. Value-carrying tags are surfaced properly: weather comes back as
"sulfuric-acid virga, constant lightning" rather than a bare count.

### The bug that proves why `baseline` exists

The calendar rule first listed only 'Earth Gregorian' as shipped - and every real starmap carries
four, so it reported "3 custom calendars" for maps that had none. Caught by running the rules
against real engine files, not by reading the code.

A facet that is universally true is worse than no facet: it teaches people the pills cannot be
trusted, which devalues every other pill beside it. The baseline is now read from the engine's own
`static/temporal/calendars.json`, and there is a regression test for the full shipped set.

Written up for the engine as R-11, including the cheaper fix: a `custom: true` flag per entry would
remove the baseline maintenance altogether.

### Checks

84 tests. svelte-check clean. Build clean.

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

### The integration spec

`docs/sse-integration-spec.md` - the SSE-to-hub system rather than a list of asks: what a saved file
should carry, the one-click link, uploads, updates, and downloads (which need NO credentials, ever -
one click is the whole point).

THE RULE IT IS BUILT AROUND: metadata makes a LABEL certain, it never becomes a GATE. Every field
arrives inside a file a stranger uploaded, so it is a claim - exactly like ATTRIBUTIONS.md and a
model's path hash. `exportMode: "player"` on a file full of GM notes loses to the detector. Invert
that and a one-line JSON edit walks past every gate the hub has.

The hub now reads an optional `meta` block (title, summary, description, tags) so a creator can
write their pitch in the app where they are already working, rather than only in a web form
afterwards. It PREFILLS; hub edits then win. Absent is the normal case for every save that exists
today and is not an error.

### Checks

45 tests. svelte-check clean. Build clean.

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
