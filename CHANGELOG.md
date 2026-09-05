# Changelog

## 0.17.1 — 2026-09-05

The in-map tag chips show every tag, grouped by namespace, so a biosignature on one world is as
findable as a lock on sixty. Row pills are off by default: a row shows its tags when the filter
matched it, or for every row with "Show tags" on. The page uses the screen, and on a wide one the
description sits beside the cover.

## 0.17.0 — 2026-09-05

### The map page, tidied: filter the map, find more maps below

The map's own pills move below the data, prefaced "Find more maps with:", without the counted
roles. Above the tree, a filter over what is in the map: a word, a role with its count, the map's
own tags most common first, and whether an object is described, pictured or modelled. Matches are
shown with the path down to them; everything else is hidden. Megastructures are a counted role
(a browse filter), not a creator tag. Browse sorts by "most written up" (D-31).

### Discord sharing

A published map is posted to the Discord sharing channel through an incoming webhook, via the
outbox, within seconds; a re-publish is "Updated"; a publish-unpublish-publish dance is one post.
Set `discord_share_webhook` at `/admin/config` (D-32).

### Reports close the loop, and the rest

Report a single comment; the reports page takes a map down, removes a comment or dismisses. New
comments on your maps since you last looked, on the account page. A sitemap, an Atom feed and
robots.txt. Backups of every table to R2, on a button or a schedule, at `/admin/backup`. Migration
0024 (D-33).

## 0.16.0 — 2026-09-05

### Information density

How much of a map is written about, 0 to 5, with 5 the best on the hub: a weighted mean of how
many objects have a description and how long it is (moons half, belts half, rings a quarter,
small objects and barycentres not at all). Shown as an "i" with a ring of five on every card, in
the map page's facts, and on the manage page as a nudge saying what would lift it. Measured on
upload and re-index; existing maps are measured once on their next view. Migration 0023 (D-30).

Two more badges: Chronicler, for writing up most of a map; Keeper, for running the place.

## 0.15.2 — 2026-09-05

The card's kind label is a little smaller than the cover's own title, so it reads as a tag.

## 0.15.1 — 2026-09-05

The card's kind label moves to the top-right of the picture: a generated cover letters its title
top-left in the same pixels, and the two read as one line.

## 0.15.0 — 2026-09-05

### People can be moderated, and can leave

An admin page per explorer: suspend, ban or reinstate with a reason the person reads on their
account page; remove every comment they have written at once; take a map down (a 404 to everyone,
the reason on its manage page, no republish) or restore it; delete the account with the handle
typed back. Everything audited. Anyone can delete their own account from the account page, and
choose whether their comments go too or stay as "a former explorer's". Migration 0022 (D-28).

### Badges, in pixels

Thirteen earned badges with twelve-by-twelve pixel art: cartographer, constellation, prolific,
featured, popular, legend, wellspring, crew, artist, modeller, worldbuilder, voice, pioneer. The
account page shows the whole set with how to earn each; a cartographer's badges follow the byline
on their map pages. The wordmark and the card labels are set in the cover cards' bitmap font, and
the error page has learned to say "not on any chart" (D-29).

## 0.14.0 — 2026-09-05

### Comments

Registered explorers can comment on a map. Comments are counted and accumulated like stars:
beside the star button, on cards, on the account page (per map and in total) and on the usage
page (total, weekly, per map, per cartographer). A comment can be removed by its author, by the
map's cartographer, or by an admin; it is kept and marked, never deleted, and an admin can restore
it. `/admin/comments` lists the latest comments across the hub with one-click Remove. Migration
0021 (D-27).

Reads that name a column the database does not have yet now drop that column and read again, the
way writes already did, so the card lists survive a deploy that runs ahead of a migration.

## 0.13.0 — 2026-09-05

### Re-index from the stored file, and the tree finally sorts by distance

The tree's Distance order and the constellation cover both read null for every map uploaded
before the position columns existed, so the sort fell back to size and TRAPPIST-1 sat next to Sol.
Rather than ask for a re-upload, the hub now rebuilds every derived row - tree, distances,
positions, small objects, counts, pills, credits, a generated cover - from the bundle it already
holds: once, in the background, on the first view of such a map; on demand from a "Re-index"
button on the manage page. Migration 0020 records when.

### Stars, not hearts

A map of stars is starred. The map page has a star button with the count; cards, the account page
and the usage page say stars.

### The cover designer grows up

One of your own screenshots can be the base (approved PNG or JPEG, decoded and fitted on the
Worker, the words drawn over it with a halo); four faces for the lettering (pixel, bold, outlined,
wide); a green-screen palette. A renamed map gets its card redrawn, a changed display name redraws
every card that carries it, and you can set that display name on the account page.

## 0.12.1 — 2026-09-04

### Upload a new version from the website

Until now a map could only be updated from inside Star System Explorer. The manage page has
"Upload a new version": the same upload page, told which map it is replacing, so the address stays
the same, a chosen cover or designed card is kept, and an older file than the published copy is
stopped with both revision numbers and a deliberate "replace anyway".

## 0.12.0 — 2026-09-04

### Credit points at the object, follows a copy of a copy, and runs both ways

A clip's source link now names the object itself - `/s/<slug>#node=<id>` - and the map page opens
that branch, scrolls to it and lights it. Every tree row has a "copy link" control. When the
copied object had itself been pasted in from somewhere, the clip carries the chain back to the
original, deepest first, so a copy of a copy still names the true source; the page shows "from
Alpha by alice (via Beta by bob)" and lists every cartographer whose hands the content passed
through. And the original map's page lists "Used in", because the hub can see which public maps
credit it. Migration 0019.

## 0.11.0 — 2026-09-04

### Small objects

A planet or moon under 1e20 kg (or under 250 km when the mass is missing) now counts as a small
object - an asteroid modelled on its own, a moonlet, a sub-moon - so a belt built in detail reads
as "412 small objects" rather than "412 planets". Vesta and Ceres stay what they were. One rule
drives the stored role, the counts, the pills, the tree and the cover. Takes effect on re-upload.

### Credit follows content

A clip now carries the cartographer's name beside the map's title and link, and the hub reads
`contentCredits` back out of a save and shows "Includes work from X by Y" with a link. The
engine's half - recording the credit on paste and printing it in the attributions file - is R-16.
Migration 0018.

## 0.10.1 — 2026-09-04

### Map pages locked up

Since 0.8.0 the tree restored its remembered state inside a Svelte effect that did `epoch++`.
Reading `epoch` made the effect depend on the value it then wrote, so it re-ran on its own write
until Svelte stopped it at the update-depth limit - a quarter of a million console errors and a
frozen page, on every map. The restore now runs once on mount and tracks nothing.

## 0.10.0 — 2026-09-04

### Pages are data transfer, and bytes in are counted too

With clips, most of what leaves the hub may leave through a page rather than the download button.
Server-rendered pages are now buffered in the hook to be measured, counted under their own kind
and shown in the same total; uploads count as bytes in. The usage page gains a chart of bytes out
stacked by kind with bytes in below the axis, and the day table shows both. Migration 0017.

### A copied object keeps what still works elsewhere

The clip used to strip every picture and model. Now it strips only what the bundle carried - those
would be broken links on arrival - and keeps app-shipped references and remote urls, so a station
built on the ISS starter model is still on the ISS when pasted into another campaign. Takes effect
on re-upload.

## 0.9.0 — 2026-09-04

### Where it starts to cost

The usage page now counts requests and bytes served, by day and by kind, and draws each free
allowance as a red line: Workers requests per day, R2 storage, R2 reads and writes projected to
month end, and the database's size. Bandwidth is free on Cloudflare and has no line; the
Supabase-to-Worker traffic cannot be measured from the hub and says so. Counting is batched inside
the Worker so it costs a fraction of what it measures. Migration 0016.

## 0.8.0 — 2026-09-04

### Design your cover

The card the hub drew for maps with no picture is now something a creator can design: a
constellation for a starmap (every system at its real map position, the origin star named) or an
orbital diagram for a system (real orbit spacing, bodies sized and coloured from their real mass,
radius and oceans), with the title, byline, counts, the site's domain and a QR code to the page
each switchable, in three palettes. Live preview on the manage page; "Use this cover" stores it.
Choices are kept and the card is redrawn on re-upload; a chosen screenshot survives re-upload too.
Free for everyone now; a config row makes it Pro later.

### Distance, not "orbit order"

At the top of a starmap the tree now orders systems by distance from the origin star; inside a
system, by orbit. One sort, called Distance. Row summaries list planets, moons, rings, belts, then
the built things, each with its symbol. The tree remembers what you opened, per map.

### Finding one Earth among forty

Starmap cards carry a second edge and a kind badge. The creator's own tags show on cards first and
filter the browse page, which also filters by kind and offers a "narrow it down" strip of the tags
that best split a crowded result. The vocabulary grew to eight groups: when, what-if, physics,
universe and more.

Migration 0015 adds the distance columns and the cover choices. Everything tolerates it not having
been run yet.

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
