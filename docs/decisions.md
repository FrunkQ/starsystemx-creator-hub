# Decisions taken, and questions open

Decisions the hub made on its own are `D-nn`. Questions that change **what the product is** — and
are therefore the owner's, not the hub's — are `Q-nn`. The four scope decisions the owner already
took are in `creator-hub-design.md` §1 and are not re-opened here.

---

## Decisions

### D-01. Uploads are closed until a canonical fixture exists, and the refusal is the shipped behaviour

`KNOWN_BUNDLE_FORMATS` is empty, so `checkBundleFormat` refuses everything with `no-parser-yet`.

This is not a stub. It is the correct behaviour for a parser that has never been run against the
thing it claims to parse, and it is what the brief asked for: *refuse an unknown format politely
rather than parsing something you do not understand into a public database.*

**Opening it is a two-line change**: drop the fixture in `tests/fixtures/`, add its integer to
`KNOWN_BUNDLE_FORMATS`, run the suite. Everything downstream of the gate is already written and
type-checked; it is simply unreachable.

### D-02. No service worker on the hub. Ever.

`svelte.config.js` sets `serviceWorker.register: false`.

The engine's `sw.js` is the cautionary tale (`creator-hub-design.md` §5.2): a stale precache
constant survived ~750 versions and is the known failure mode of the Vercel→Cloudflare cutover. A
page whose entire job is SSR plus one cover image gains nothing from a precached shell, and would
inherit that failure mode permanently in exchange.

The hub is also a *new* deployment with no returning users and no cutover, so this costs nothing
now and saves a category of problem later.

### D-03. Bytes come through the Worker on upload, not direct to R2 on a presigned URL

The owner's plan describes presigned R2 URLs. The **security property** it names —
*"a banned hash is refused before a presigned URL is ever issued"* — is right, but a presigned URL
scoped to a key and a length does not enforce it: the client can upload different bytes under a key
named after an approved hash. That is C-03 again, one layer out.

So `ingest.ts` reads the zip in the Worker, hashes every member itself, and writes to R2. Correct by
construction.

**The honest cost:** the whole bundle is read into Worker memory, so `max_bundle_bytes` (default
50 MB) is a real memory ceiling and not just a cost control.

### D-04. The presigned path, when it is wanted, must pin the sha256 checksum — not just the length

Recorded now so it is not re-derived later. R2 is S3-compatible and supports
`x-amz-checksum-sha256`; a presigned PUT that pins the checksum makes **R2 itself** reject bytes
that do not match the key. That closes D-03's hole without routing bytes through the Worker, and it
is the right shape once bundles get big enough to want it. §7.3's *"single object, short expiry,
exact content-length"* should read *"...and exact sha256"*.

### D-05. Reject reasons, and refusing a banned asset by name

A bundle containing a previously-banned hash is refused **as a whole**, and the response names the
paths involved.

Naming them is mildly an oracle — it confirms which specific image was removed. That is an
acceptable trade: the uploader already possesses the file, and a refusal a creator cannot act on is
worse than one that tells them which picture to replace.

### D-06. ONE route serves unreviewed assets, with two branches

`/private/asset/[hash]` is the single exception to "an unreviewed asset is never served". Two people
legitimately need to see bytes before anybody else does:

- **an admin** — somebody has to look at the picture in order to review it;
- **the creator** — they must see the screenshot they just added to their own map. This leaks
  nothing: they uploaded those bytes and already have them.

It was briefly two routes (an admin one), and the creator's own pending screenshot was consequently
invisible to them. **One route with two branches, not two routes** — the moment it becomes two, the
rule in §6.2 stops being checkable by reading one file.

`no-store`, `noindex`, and every refusal is a 404 rather than a 403, so it does not confirm that a
hash exists to anyone not entitled to know.

### D-07. Row types are `type` aliases, never `interface`

`src/lib/server/database.types.ts`. supabase-js constrains schema rows to `Record<string, unknown>`;
a TypeScript interface has no implicit index signature and fails that constraint — and the failure
is **silent**, degrading every query to `never` while still compiling. Cost about twenty minutes to
find. The file says so at the top.

### D-08. The daily allowance counts novel hashes, and an update is close to free

§6.3 asks for this and it is implemented in `gates.ts`: an update to your own map does not consume
the non-update allowance, and only novel hashes count. A creator iterating on a map would otherwise
burn a day's quota by lunchtime.

### D-09. The attestation: ask plainly, record the answer, and store the text shown

The owner: *"They may attribute everything to themselves - not much we can do about that - we have to
assume they are honest - and when they upload we ask them to confirm this - they take
responsibility."*

So `attestations` is **append-only and versioned**, and stores the **exact text shown** alongside the
answer — not just a version number. A version number alone is a promise that the deploy history is
intact; the text is the evidence. If the wording changes, an old record still says what was actually
agreed to.

`src/lib/attestation.ts` is the single source for that text, shared by the form and the record. If
the page owned its own copy the two would drift on the first tweak and the stored record would
quietly stop being worth anything.

**What it is not:** a substitute for the provenance gate. An asset with nothing recorded still blocks
publishing. The attestation covers only the part a machine cannot check — whether what they filled in
is *true*.

### D-10. Badges are derived, never set

`deriveBadges` is a pure function of what the database already knows, so it can be re-run any time
and always agrees with itself. That is what makes the outbox dedupe key safe, and it means a badge is
**lost** when the thing that earned it goes away — a map unpublished, or removed by a moderator.
Leaving a community role attached to content that no longer exists is how a badge stops meaning
anything.

### D-13. Screenshots go through the ordinary ledger

A creator-uploaded screenshot is hashed, deduped and reviewed by exactly the same queue as a bundled
picture. **No second moderation path** — a second path is a second thing to get wrong, and it is the
one an attacker would look for. It also means a screenshot that happens to be bytes already approved
elsewhere goes live immediately, for free.

### ~~Q-01~~ → **D-11. Legacy saves are accepted and base-stamped** — ANSWERED 2026-08-28

The owner: *"we need to stamp from here on out... We can accept unstamped maps as legacy and base
stamp them ourselves."*

`accept_unstamped_bundles` is now `true`; an unstamped save is stamped as `legacy_bundle_format` (1)
and the row is flagged `legacy_stamped` so the assumption stays **visible in the database** rather
than becoming invisible the moment it is made. A save carrying its own stamp is never restamped.

**And the second half of that answer produced a distinction worth keeping:** *"We need to keep which
version it was created in — future versions will be able to load it but this is a capability
marker."* So the hub stores **two** versions and they do different jobs:

| | question | on an unknown value |
|---|---|---|
| `bundle_format` | *can this parser read this layout?* | **refuse** |
| `created_with` | *what could the app do when this was made?* | **never a gate** |

`created_with` is the engine's existing `appVersion` build stamp. Conflating the two would turn a
capability marker into a parse gate and start refusing perfectly readable maps.

### ~~Q-02~~ → **D-12. An incomplete attribution blocks publishing** — ANSWERED 2026-08-28

The owner: *"obviously faked up attributions should get an upload rejected until the user fills it
in."* A CC-BY licence with no author named is precisely an attribution that has not been filled in —
the creator has told us a name is required and then not supplied one. `block_cc_by_breach` is now
`true`.

The gate is also re-checked **server-side at the moment of publishing**, not only at upload: a
creator can edit claims between the two, so the upload-time check is a courtesy and the publish-time
one is the control.

### D-14. The GM/player question is READ from the file, not asked of the uploader

The owner, 2026-08-28: *"This choice is made on export of a file - so can be gleaned from it."*
Correct, and the radio buttons are gone.

**The inference is asymmetric, and that turned out to be the useful part.** Markers present
(`gmNotes`, `object_playerhidden`, secret tags, `overrides.anomalies`, a hidden description with its
text still attached, an `undoHistory`) mean **certainly** a GM tree — every one is removed by
`computePlayerSnapshot`. Markers absent means a player export *or* a GM export of a campaign with no
secrets, which are indistinguishable — **and it does not matter**, because a GM tree with nothing
hidden in it has nothing to leak.

So the hub stopped trying to recover the export *mode* and instead answers the question that
actually protects someone: **is there anything in here they would not want published?**

Three things fall out of that, and they are why this is better than the radio rather than merely
tidier:

1. **It cannot be answered wrongly.** The file is the truth. A creator mis-clicking a radio was the
   one path that published somebody's campaign secrets.
2. **The warning became rare, so it gets read.** Almost nobody sees it. Those who do see *"GM notes
   on 12 objects; 3 objects that are hidden from players"* — specific and actionable — rather than a
   choice they must make before they understand it.
3. **§3.1's "never silently publish a GM tree" became enforceable** rather than advisory, and
   `systems.published_gm_tree` now records a detected fact instead of a self-report.

The one thing lost is labelling precision — the hub can say "no GM-only content found" but not
"this is the player version". `docs/sse-requirements.md` R-10 asks the engine for an `exportMode`
stamp to close that, **for the label only**: a stamp arrives inside a stranger's file and is a
claim, so detection stays the control.

### D-17. Users are **Explorers**, and the publish badge is **Cartographer**

The owner, 2026-08-28: *"we can our users not Creators but Explorers - we are journeying together."*
It fits a tool called Star System Explorer, and it says *journeying* rather than *producing*.

**Changed:** user-facing copy, including the two mentions in the signed-off terms (a term of
address, not a substantive clause — but the owner should re-read, since he signed that text).

**Not changed:** every database identifier — `creators`, `creator_id`, `creator_badges`,
`creator_identities`. Renaming them is a migration touching every table, every query and every type,
for **zero** user-visible benefit. The words people read set the tone; the column names do not. The
repo, Worker and R2 bucket names stay too, for the same reason plus the disruption of moving them.

**The badge had to change name, and that is not cosmetic.** It was `creator`, awarded for
publishing. If *everyone* is an Explorer then a badge saying "Explorer" rewards nothing and means
nothing — so it is now **`cartographer`**: an explorer who charted something and gave the chart to
other people, which is exactly what the badge is for. Free to rename because no badge rows exist yet.

### D-18. Site name and URL are config rows — and the URL fixes a live bug

The owner: *"explorers.starsystemx.com will be its formal URL once we are all done"* and *"have it a
config item as we will likely go through a few as we transition URLs."*

`site_name` and `site_url` are config rows. **`site_url` empty falls back to the request's own
origin**, so the hub is correct on workers.dev, on a custom domain, and on localhost with no
configuration at all. Setting it pins previews to the canonical host during a transition.

**This was not cosmetic — it fixed a real bug.** `og:image` was a RELATIVE url. Open Graph requires
absolute ones, and Discord, Twitter and Facebook do not resolve relative: **every shared link would
have previewed with no picture.** For a hub whose entire product is link-sharing, and whose design
says the OG preview *"matters more than any in-page richness"*, that is the most expensive small bug
available — and it was live. Now absolute, with `og:url`, `og:site_name` and a canonical link.

### D-19. Copying is per-row and takes the subtree; the flat snippet list is gone

The owner, 2026-09-03: *"we could now converge hierarchy with selector ... At each level there
should be the copy icon ... That copy will copy that and all its children ready for pasting into
SSE."*

The tree had replaced a 161-row table, and the "Copy one piece" list beneath it still had 172 flat
blocks — the same wall, one section lower. It is deleted. Every tree row now carries its own copy
control, and a branch copies itself and everything under it as one **clip** (`bundle/clip.ts`): an
envelope with a format number, the source page, and the nodes parents-first with the root
unparented. A leaf opens to its own JSON, which is the drill-down to a single body; a branch has a
small code toggle for the same. Orbit order or A to Z, never flattened.

**The envelope, not bare JSON, is the decision worth recording.** A paste target has to recognise
what it is given, and raw node JSON is indistinguishable from any other JSON. `sseClip: 1` is the
marker, and the number lets the format change without breaking the old one.

**And a finding, not a decision: the engine has no paste target.** Measured on main and the hubside
branch — nothing in the app reads a node from the clipboard. The old "Copy JSON" never had a
consumer either. Written up as R-14 so the gap is owned rather than assumed closed.

### D-20. Usage is counted from the hub's own tables, and a visitor is a hash that forgets after a week

The owner, 2026-09-03: *"a bunch of data on usage — growth, etc. Not the host's analytics tools as
we have more context and data to use — but just tracking anonymous downloads, different users, most
popular maps/user, etc. … memory used — #failures/bad uploads."*

Built as `/admin/stats`, fed by one SQL function (`hub_stats`, migration 0014) so the counting
happens in Postgres and not in a Worker pulling rows over HTTP. Three things had to be added to
count at all, and one of them is a privacy decision:

- **Downloads as events.** `download_events` holds one row per download with a `visitor_hash` and
  nothing else. The hash is `sha256(iso-week + secret salt + ip + user-agent)`. **The week is in
  the hash on purpose:** within a week a visitor is exactly one visitor; across weeks the hashes do
  not join, so nobody can be followed for longer than that. The dashboard says "visitor-weeks" for
  any window longer than a week rather than pretending to a precision it does not have. **No
  address is ever stored**, and the salt (`VISITOR_SALT`) is what makes that true rather than
  approximately true.
- **Refusals as events.** `upload_events` was only ever written on success. Every refusal now writes
  a row with its code, so "bad uploads" is a table, not a guess.
- **Writes that tolerate the migration not having run yet** (`src/lib/server/tolerant.ts`). A push
  deploys in minutes; a migration runs when the owner pastes it. In between, a write naming a
  column the table lacks drops that column and lands anyway. This was a real choice: the
  alternative was every upload failing over a nicety until the SQL editor was opened.

**Not built, deliberately:** a nightly rollup. At this scale the function runs in milliseconds on
demand; a rollup is a second copy of the truth to keep in step, and it earns its place only when the
queries get slow.

### D-21. A map with no picture gets one the hub drew — and it skips the review queue

The owner, 2026-09-03: *"outstanding work to make this super smooth… e.g. autogen a basic cover
picture."* Most saves carry no picture at all (C-06: the Local Neighbourhood map has sixty node
images and not one is in the bundle), and a page with no picture is a Discord embed with no picture.

**Built as `src/lib/cover/`:** a software rasteriser, a 5×7 bitmap font and a forty-line PNG
encoder over `fflate`, because a Worker has no Canvas and refuses to compile WebAssembly at runtime,
and an Open Graph image must be a raster. The card is the primary star with its children on tilted
orbits, the title, the counts and the byline — drawn from the same rows the page shows, so it can
only say true things, and drawn deterministically so the same map yields the same bytes and a
re-upload reuses the asset.

**The exception worth recording:** the generated cover enters the ledger **already approved**.
"An unreviewed asset is never served" is the hub's founding rule, and this is a deliberate carve-out
from it: the picture is not user content — no stranger's bytes, nothing a reviewer could object to
— and withholding it would defeat its only purpose. It cannot launder anything, because a hash
already in the ledger keeps the verdict it has. It is used only when the creator chose nothing
(`coverAssetId`) and the guess found nothing; the moment a real picture exists it is never used.

**It is a card, not art.** Capitals in a pixel font, one colour per role. Good enough to recognise a
map in a feed, and honest about being generated rather than pretending to be a screenshot.

### D-22. A cover designer, a wider vocabulary, and "distance" that means what the level means

Owner, 2026-09-04, on seeing the generated card: *"I love this image as the default"*, then: put
the domain on it, a QR code as an option, let the creator choose the base and the overlays, give
starmaps a constellation look and systems the orbital look, *"could be a pro feature ... free for
now"*. And two more: cards must tell a starmap from a system at a glance, and the fortieth Solar
System needs tags to say how it differs.

**The designer.** `src/lib/cover/generate.ts` now draws two bases from the map's own rows: a
**constellation** for a starmap (every system's star at its real map position, the origin star
named and largest, faint lines to its neighbours) and **orbits** for a system (radii on a log scale
of the real semi-major axes, bodies sized from radius and coloured from mass and hydrosphere, ringed
planets wearing their ring). Overlays switch independently: title, byline, counts, the domain, a QR
code to the page. Three palettes. The manage page previews every change live through
`/api/cover/preview` and "Use this cover" stores the card through the same ledger path as the
default one. **The choices are kept (`cover_options`) and the card is redrawn to them on every
re-upload**; a chosen screenshot is likewise kept across re-uploads — a re-upload must never undo a
choice made on the hub. `cover_designer_tier` is a config row (`free` now) so this becomes Pro
without a deploy.

**Why the picture is still pure JavaScript:** Workers have no Canvas and refuse runtime WebAssembly
compilation, so a WASM rasteriser is not an option without bundler work. The QR code is
`qrcode-generator`, pure JS, no DOM.

**Distance.** "Orbit order" made no sense at the top of a starmap. One number per row (`distance`,
0015): the semi-major axis in AU inside a system; at the top of a starmap, the map distance from
the **origin star** — the system nearest the map's centre, which is the one the author built
outward from, or an explicit origin id if the engine ever writes one. The sort is called Distance.
Rows without a number (uploads before 0015) fall back to size, stars first. The tree also
remembers, per map and per browser, which branches were open and how it was sorted.

**Cards.** A starmap card carries a second offset edge and a kind badge; creator tags show before
the derived pills, because they are the ones that separate one Earth from the next.

**The vocabulary** grew from five groups to eight — when (far past to deep time), what-if
premises, physics (ftl, no-ftl, generation ships), universe (original, "functional universe" in
the owner's phrase, shared, homage) — and the browse page now filters on the creator's tags as well
as the derived ones, by kind, and offers a "narrow it down" strip of the tags that best split a
crowded result.

### D-23. Traffic is counted in the Worker and flushed in batches; the free tiers are red lines

Owner, 2026-09-04: *"track the data transfer and have the free level set as a RED line - to avoid!
... so we can determine roughly how close we are getting to the account limits and when it's going
to cost me."*

What actually costs: Workers requests per day, R2 storage and operations, Supabase database size
and egress. Bandwidth out of Cloudflare and R2 egress are free. So `traffic_daily` (0016) counts
requests and bytes by day and category, and `/admin/stats` draws each allowance as a meter with
the free level as a red line at 80% of the track, so headroom past it is visible.

**The counting must not cost more than it measures.** One database write per request would double
the Supabase traffic in order to count it. Counts accumulate in the Worker isolate and flush as one
RPC every twenty requests or forty-five seconds; an isolate evicted before its flush loses at most
that. It is a gauge, not a ledger, and the page says "roughly" for a reason.

**What it cannot see:** Supabase egress (Postgres to Worker), which is the one Supabase meter with
teeth. Stated on the page rather than guessed at.

---

## Still open — the owner's to answer

### Q-03. What designates the cover image, and what happens when there is none? (§7.4)

Nothing in the bundle marks a cover. The hub currently uses this chain
(`ingest.ts` `pickCover`), which is a **recommendation, not a decision**:

1. the map background, if the campaign sets one — a GM's sector map is the picture they already
   chose to represent the campaign
2. otherwise any player-view graphic
3. otherwise the first body picture
4. otherwise **no cover** — the page renders a generated card, no engine and no rendered preview

The cleaner long-term answer is a `coverAssetId` field in the bundle, which is engine-side work and
was not raised because phase 0 is already carrying two items.

### ~~Q-04~~ → **D-15. The terms are written and the pages are built** — ANSWERED 2026-08-28

Owner-signed-off text, delivered by the coordinator. **This was the launch blocker and it is
cleared.** `/terms` carries the full text; `/takedown` is a page of its own; `/acceptable-use` is a
**308 to the relevant section of the terms**, because there is deliberately no separate AUP document
(the owner's brief: *"No formal AUP... it's just protective"*). Two documents that could disagree
about what is allowed is worse than one that is blunt.

**Do not "improve" the voice.** The plain-English register was signed off in that form. It has no
governing-law clause, no arbitration clause and no GDPR recitals, and their absence is a decision
rather than an oversight — the privacy *practice* is stated in plain words instead.

**`LAST_UPDATED` in the page IS the version.** The terms say the current version is the one on the
page, dated, so that string is the mechanism. Change the text, change the date.

### D-16. The takedown address is assembled at runtime, never served as text

The owner's instruction was explicit: keep it off the page as scrapable text. It is stored as
character codes and assembled only when a visitor asks. **Verified against the built output: the
address does not appear in any served file**, in any form a pattern match would find.

**Stated honestly on the page and here:** this defeats crawlers that harvest addresses out of page
source, which is the actual volume threat. It does not defeat anyone who runs the JavaScript and
looks, and nothing rendered client-side ever could. It is a spam measure, not a secret.

**Why not a contact form:** it needs a mail-sending backend the hub does not have, and a form that
silently fails is worse than an address — a copyright claim that never arrives is the one message
here that must not go missing.

**The one open question this leaves:** confirmation that a rejected asset leaves its map
published-without-it rather than taking the map down. The terms now say so in the takedown page
("the asset is removed and the map stays up without it"), and the code assumes it — so this is
settled unless the owner says otherwise.

### Q-05. Does the hub host campaigns as well as single systems? (§9.3)

The schema and parser handle both (`kind` is `starmap | system`) so nothing is blocked, but a
campaign is the bigger payload and interacts with `max_bundle_bytes`. Currently both are accepted.

### Q-06. Anonymous upload, or account required? (§9.4)

Built as **account required** — reports and hearts need one anyway, the daily allowance is
per-account, and §6.6's best abuse signals are behavioural and need an identity to attach to. Easy
to relax; hard to add later. Flagging it because §9.4 lists it as open.
