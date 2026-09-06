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

### D-24. Small objects are a hub-side role, and credit follows a clip as an attribution

Owner, 2026-09-04: *"we will need an extra category for 'small objects' - i.e. sub-moons - people
are starting to model the asteroid belt in detail ... below a certain mass - should be in a new
category."* And: *"on cut and paste are we pushing through attributions with it?"*

**Small objects.** The engine calls every orbiting rock a planet or a moon, which is right for the
physics and wrong for a person reading "412 planets". Below **1e20 kg** - Vesta and Pallas stay,
Hygiea and smaller go; Ceres is untouched - or under 250 km when the mass is missing, a planet or
moon is shown as a **small object**. It is the hub's display axis, defined once in
`bundle/roles.ts` and used by the stored role, the counts, the pills, the tree and the cover; the
engine's `roleHint` is untouched in the save and in every clip. If the engine ever grows a role of
its own for these, the hub reads that instead of inferring.

**Credit.** `origin/hub` on a pasted root is a breadcrumb, not a credit. The clip's `source` now
carries the cartographer's name, and R-16 asks the engine to record a `contentCredits` entry on the
campaign and print it in the attributions file. The hub reads that list back on upload
(`content_credits`, 0018) and says "includes work from X by Y" with the link - so a creator can see
from their own page where their work went, and the person who used it never has to remember to
say so.

### D-25. A credit links to the object, carries its chain, and is visible from both ends

Owner, 2026-09-04: *"Could it link to the right point on the explorer hub - so if a user uses it or
REUSES it you could link right back to the true source (also if it has been appended and updated
ownership is kind of shared)."*

**The unique address of any object on the hub is `/s/<slug>#node=<id>`.** Slugs never change
(containment design, section 6) and node ids are the engine's own stable ids, so the pair is a
permanent identifier for any point in any hierarchy, readable by a person and resolvable by the
page: open the branch, scroll, light the row. No opaque id was minted; one that survives nothing
the deep link does not survive would be a second name for the same thing.

**The chain.** A pasted root carries `origin/hub=<url>` (R-14 rule 5), and the map's own credits
say who that url belonged to and where it was before. So a clip copied out of a copy carries
`source.chain`, deepest first, and R-16's addendum asks the engine to record and print it. The
page renders the lineage and lists every cartographer in it — the owner's "shared ownership", as a
fact on the page rather than a sentiment.

**Both ways.** Credits are also stored as the slugs they point at (`content_credit_slugs`, 0019),
so the ORIGINAL map's page can list "Used in" with one indexed query. A cartographer sees where
their work went without anyone having to tell them.

### D-26. Derived rows are rebuilt from the stored bundle, never by asking for a re-upload

Owner, 2026-09-04, on the tree: *"Distance does not work ... the closest star to SOL is NOT
TRAPPIST-1"*, and on the designer: *"constellation is not showing"*. Both had one cause: the map's
rows were written before the columns those features read, so every distance and position was
null and both fell back honestly to something worse. The hub had been telling the owner to
re-upload. That was the wrong ask: the hub kept the bytes precisely so it could read them again.

`server/reindex.ts` rebuilds everything the hub derives - tree rows, distances and positions,
roles, counts, pills, credits, a generated cover - from the stored bundle, through the same
`openBundle` and `writeNodeRows` the upload uses (one reader, one row mapping). It never touches
what the creator wrote (title, blurb, description, tags), the publish state, the ledger, or a
chosen screenshot. It runs once in the background on the first view of a map whose rows predate
the current reader (`reindexed_at` null and no distances), and on demand from the manage page.

**The rule this sets:** when the reader improves, the next release re-indexes; creators are never
asked to redo what the hub can redo itself.

Also in this release, all owner asks: stars rather than hearts (with the symbol); a creator's own
approved PNG or JPEG screenshot as a designed card's base, decoded in pure JavaScript and shaded so
the words read; four faces from the one glyph set; a green-screen palette; a display name set on
the account page, drawn onto every card and redrawn when it changes, as is a renamed title.

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

### D-27. Comments: registered explorers, removed not deleted, counted like stars

The owner's ask (2026-09-05): *"registered users should be able to comment on maps - and comments
counted and accumulated like stars"*, then *"admins need to be able to delete comments easily"*.

**Built as:** one `comments` table (migration 0021). Signed-in, active accounts only - the same
rule as stars and reports, because an anonymous comment box is a griefing tool. Plain form posts
with a redirect back to the map, so it works without a script and the page after a post is served
`no-store` so the new comment is never hidden behind a cached copy.

**Removed, never deleted, by the site.** `removed_at` is set, with who and under which claim
(`author`, `cartographer`, `admin`), so the count stays honest and a removal can be answered or
undone. Only a cascade - the creator or the map deleted - takes the row away. The count is
denormalised onto `systems.comments_count` by a trigger that RECOUNTS rather than nudges, because
a removal is an update and a nudged count would drift.

**Who may remove:** the author; the cartographer whose map it sits under (their page, their call -
a judgement the owner was not asked and can reverse); an admin, whose removal is audited.
`/admin/comments` lists every live comment newest first with one-click Remove, and the removed
ones with Restore, so an admin never hunts map by map.

**Counted like stars:** beside the star button on the map page; on cards (only when there are
any - a zero on every card at launch says nothing); on the account page per map and in total; on
the usage page in the tiles, the weekly growth, the top maps and the cartographers.

**Limits:** twenty comments an hour per account, and the same words twice under one map collapse
to one. If spam arrives, an account-age gate is the next lever.

**Not built, deliberately:** threads, replies, editing, reactions, notifications, reporting one
comment (report the map with "Something else" for now). Each is a product decision.

**Also in 0.14.0:** reads that name a column the database does not have yet drop that column and
read again (`tolerantSelect`), the way writes already did, so the card lists survive a deploy that
runs ahead of a migration. The card column list lives in one place (`server/cards.ts`).

### D-28. People can be suspended, banned and deleted; things can be taken down; a comment can outlive its author

The owner's ask (2026-09-05): admin tools to remove all of one person's posts, and account removal
with the person choosing what happens to their comments - "I like the former explorer option."

**What the terms promise is now what the code does.** "Content can be removed and accounts
suspended or banned at our discretion... we will usually say why, because that is decent." Every
operation in `src/lib/server/accounts.ts` takes a note, stores it where the person will read it
(`creators.state_note`, `systems.state_note`, migration 0022), and is audited.

**The admin's explorer page** (`/admin/explorers`, then one per handle) is the one place a person
is acted on: suspend, ban or reinstate with a note; remove every live comment at once (soft, like
a single removal, restorable from the comments page); take a map down (a 404 to everyone, the
reason on its manage page, no republish - state `removed`) or restore it (to public: that is what a
takedown was about); delete the account with the handle typed back. Not on yourself.

**A ban is about the person, a takedown about the thing.** A suspended or banned account can still
sign in and read; it cannot upload, star, comment or report (`mayContribute`, unchanged). Its maps
stay up unless taken down separately.

**Deletion** removes the row and everything that cascades from it, then the sign-in, then the
bytes nobody references any more (`deleteIfUnreferenced`: a picture another map uses stays; a
banned verdict outlives the account, as before). Rows first: if the sign-in cannot be removed, the
report says so and nothing is half-done. The person's own delete is on the account page with the
same confirmation, and lands on the front page with one kind sentence.

**Comments are the person's choice; the schema had to allow it.** Until 0022, deleting a creator
cascaded their comments away regardless. Now the comment's creator link is nullable and set null
on delete: a kept comment shows as "a former explorer", and nobody can claim it as its author. An
admin deleting a spammer ticks "delete their comments too".

### D-29. Badges are earned, drawn in pixels, and the site is allowed some character

The owner (2026-09-05): "we need more badges. And a graphic to go along with them. something
appropriately retro - i kinda like the 8-bit feel. maybe have a touch of that around. not
embracing it... but something to give it character - it is a little corporate and bland - we need
to reflect our own terms of service", then "its a web site - we can have a 'bit of fun'".

**Thirteen badges, all derived** (`src/lib/badges.ts`): cartographer, constellation, prolific,
featured, popular, legend, wellspring, crew, artist, modeller, worldbuilder, voice, pioneer. Each is
a pure function of what the hub already knows - public maps and their counts, credit in both
directions, live comments, sign-up order - so the set can be recomputed any time and a badge is
lost when what earned it goes away. The server gathers the facts (`integrations/badges.ts`) on
publish, unpublish, takedown, comment, and whenever the person opens their account page, which
covers what no hot path calls (downloads, being credited). Thresholds are named constants and
pinned by tests.

**The art is twelve-by-twelve pixel sprites**, drawn as SVG rectangles (`Badge.svelte`), because
the cover cards already letter their titles in a 5x7 bitmap font and the badges belong to the same
family. The account page shows the whole set - earned in colour, the rest dim, each with how to
get it in one plain sentence - and a cartographer's badges sit after the byline on their map pages.

**The touch, not the theme:** the wordmark and the card kind-labels are now set in that same
bitmap font (`PixelText.svelte`, `src/lib/pixel.ts`, no font file - the page rule stands), and the
error page gets the status in big pixels and a sentence. Body text stays a system font. The "how"
lines, the notices and the empty states are written in the terms' register: plain, short, a
little dry ("Ten comments. Decent ones, we assume.").

### D-30. Information density: a 0 to 5 for how much of a map is written about, 5 being the best here

The owner (2026-09-05): "if people have taken the time and effort to write descriptions for all
their objects then lets have a dynamically scaled 'i' icon with a value 0-5. 0 being no notes in
their file and 5 being the best we have. It will be a factor of %age of objects and lengths of
descriptions (ignoring small bodies, with moons being less important) but the rest carrying honest
weight in a 'information density' measure. To encourage people to 'make the effort'."

**The measure** (`src/lib/bundle/density.ts`, pure, tested): every object that counts carries a
weight - moons a half, belts a half, rings a quarter, small objects and barycentres nothing,
everything else one - and its description a quality from 0 to 1, linear to a solid paragraph
(280 characters) and no more for a novel; under 12 characters is a placeholder, not a description.
The raw score is the weighted mean, so coverage and length are one number. The public `description`
only: GM notes are withheld from players and stripped on a player export, so they are not
information the map gives anyone. Measured on upload and on re-index and stored (`info_density`,
`info_detail`, migration 0023); a map that predates the measure is re-indexed once on first view.

**The level is relative.** 0 when nothing is described; otherwise 1 to 5 against the best raw
score among public maps, so the best map on the hub is a 5 and one at a fifth of it is a 1. The
scale moves as the library improves, which is the point: "5 being the best we have". The
Chronicler badge, by contrast, is ABSOLUTE (raw 0.6), because a badge should not be lost because
somebody else wrote more.

**Where it shows:** the "i" with a ring of five segments (`InfoDensity.svelte`) on every card, in
the facts row of the map page with the words behind it as the tooltip, and on the manage page as
the nudge - what counts, how many objects are still undescribed, and that a paragraph each is
what a five takes. The public API carries it as `information` (the level on the list, the level
plus the detail on one map).

### D-31. The map page: filter the map above the data, find more maps below it

The owner (2026-09-05), with a screenshot of the tree: "it is a bit busy - the tags at the top
should be put lower down and be prefaced 'find more maps with:' (useful info but not a useful UI
element just now). But above that have the tag list from the actual map available as a filter to
the bodies below - letting users find planets by in-map tags - in this list also filter on
megastructures and other map related filters." And: "In tags - why have megastructures - as they
are functional fields that are counted."

**Two different things were in one place.** The pills at the top of a map page described the MAP
(campaign, life, has-artwork, stations) and linked to browse; the pills on the rows described the
OBJECTS (ocean=water, tidally-locked). The first is "find more maps with", the second is "find
things in this map". They now sit where they belong: the map's pills below the data, prefaced
and with the counted roles left out (the role summary already says "9 stations"); the objects'
tags above the tree as a FILTER.

**The filter** (`src/lib/treeFilter.ts`, pure and tested; drawn by `NodeTree.svelte`): a word, a
role with its count, the map's own tags most common first, and whether an object is described,
pictured or modelled. Chips narrow; a row's own pills toggle the same tags. A match is shown with
the path down to it and every surviving branch open; the rest is not drawn. Not remembered between
visits: a filter that survives a reload reads as a broken map.

**Second pass, same day.** The owner, with a screenshot of the filtered tree: biospheres and
megastructures should be in the tag list, "and others"; and it still looked busy - only the rows
the filter matched should show their pills. So: the chips show EVERY tag, grouped by the engine's
namespace (science, biodiversity, resource, orbit...) - a biosignature on one world is exactly what
somebody filters for, so nothing hides behind a "more"; and row pills are off by default, shown on
a row the filter matched (so you see why) or for every row when "Show tags" is switched on, which
is remembered. A role chip appears only for roles the map has - a map with no megastructures has
no megastructures chip, and that is the truth rather than a gap. The page also uses the screen:
the container is near the full width of a 1920 display (prose pages cap themselves), and on a
wide screen the description sits beside the cover, stacking again on a narrow one.

**Third pass (0.19.1).** The tag groups are a closed concertina by default - "a default closed
concertina to avoid overload" - opened by hand, or when a tag is picked from a row so what is
filtering stays visible. And a starmap opens with its stars minimised: sixty stars, each with its
summary, is the list; a single system still opens to planet level. The owner's words: "stars
should be minimised - or to planet level in a star map".

**Megastructures are a count, not a claim.** Removed from the creator vocabulary (with
`dyson-structures`); added to the counted roles that earn a browse pill (`facets.ts`
`ROLE_PILLS`), because "maps with megastructures" is a real question for browse and a real filter
inside a map. Browse also sorts by "most written up" (D-30).

### D-32. Maps are cross-posted to the Discord sharing channel, through the outbox

The owner (2026-09-05): a Discord server has run for ages (guild 1443167899933212744); newly
published and updated maps should be posted to a channel dedicated to sharing.

**An incoming webhook, not the bot.** The channel's own webhook URL goes in `discord_share_webhook`
(migration 0024 creates the row; the guild id is filled in only if blank). No bot invite, no
permissions, nothing to reason about; revoking the webhook is the off switch. The role integration
stays as it was, still gated by `discord_enabled`.

**Through the outbox** (`integrations/share.ts`, `deliver.ts`): a publish writes an intent and
returns, then drains in `waitUntil` so the post lands within seconds; the drain route retries what
failed. The dedupe key is the map, the event and the hour, so a publish-unpublish-publish dance is
one announcement. "New" is a map's first publish (no earlier `system.publish` in the audit log);
anything after is "Updated". An upload of a new version lands as a draft and is announced when
the creator publishes it again. The embed carries the title as a link, the byline, the counts and
the cover, when the cover is servable.

### D-33. Reports close the loop; the notification there is; sitemap, feed, backups

Built together on the owner's "I like all your updates - do them too" (2026-09-05).

**Report one comment** (migration 0024: `report_target` gains `comment`, `reports.comment_id`, one
report per person per comment). A Report link on every comment the viewer cannot remove.

**The reports page acts.** A map report: take the map down, with a note, or dismiss. A comment
report: remove the comment or dismiss. A picture report still settles in the review queue. Every
action closes the report, so the queue empties, which is the only way a queue keeps being read.

**New comments on your maps** (`creators.comments_seen_at`): the account page lists what was said
under your maps since you last looked, then moves the clock. The honest notification while there
is no mail; when SMTP exists, mail can follow the same query.

**Sitemap, feed, robots.** `/sitemap.xml` lists every public map page; `/feed.xml` is an Atom feed
of the thirty newest, linked from every page's head; `/robots.txt` keeps crawlers out of the admin,
the manage pages, the account and the downloads.

**Backups** (`server/backup.ts`, `/admin/backup`): every table, minus the two secret columns, as one
gzipped JSON document in the bundles bucket, the last eight kept, on a button or from any external
scheduler with the cron key. The pictures and bundles are already the only copy of themselves in
R2; the backup names which ones matter.

**The clock, after all (0.19.2).** "A Worker has no clock" was true of the file the adapter emits,
which has a `fetch` handler and nothing else. The owner did not know how to set up a scheduler, so
the hub grew one: `worker/index.mjs` wraps that file - the same `fetch`, plus a `scheduled` handler
- and `wrangler.toml` carries the Cron Triggers: the outbox every fifteen minutes, a backup every
Monday at 03:00 UTC. The handler calls the two housekeeping routes in-process; such a request
never crossed Cloudflare's edge, so it carries neither `cf-connecting-ip` nor `request.cf`, a pair
no outside caller can leave off, and the routes take their absence as "the Worker itself". No
secret to set, nothing to point anywhere. `CRON_SECRET` remains for an outside scheduler, optional.

### D-34. Hub badges can be Discord roles; the config page tries things

The owner (2026-09-05): "what about status between discord and the site - custom badges - or is
that a nitro thing?"

**Profile badges are Discord's own.** No server, and no Nitro, adds a custom one. The server-side
equivalent is a ROLE: a colour on the name, and from Boost Level 2 an icon beside it. The hub
already gave Cartographer as a role through the bot and the outbox; now any badge maps to a role
via `discord_badge_roles` (migration 0025: `{"chronicler": "<role id>"}`), given when the badge is
earned and taken when it is lost. Needs the bot in the server with Manage Roles, the bot token
secret, and `discord_enabled` true. The sharing webhook needs none of that.

**The config page refuses what is not a webhook.** The owner pasted a channel link first, which is
the natural mistake; the page now says what a webhook URL looks like and where it comes from. Two
buttons do the real thing once: a test post to the sharing channel, and a test email to the
admin's own address through whatever SMTP Supabase has - a password-reset mail, because that is
the one email Supabase sends on demand. A secret pasted into a migration would be committed;
values like the webhook go in through the page or a one-line update, never the repo.

### D-35. A debug upload can be inspected without being trusted; a map can open in the app

**Inspection** (owner, 2026-09-05: "see if it can do a basic parse - pull out version numbers and
complete objects - detect any json errors or truncated file, resources and other files it says it
requires"). `src/lib/bundle/inspect.ts` reads a debug upload as EVIDENCE: is it a zip or JSON; does
the zip carry its own index (a missing end-of-central-directory record is a transfer cut short);
what is inside; does the document parse, and if not, what was said, at which character, with the
text around it, and whether the brackets are still open at the end (cut short) or simply wrong;
the versions (`bundleFormat`, `appVersion`, `revision`, `exportMode`); how many objects, how many
complete (id, kind and name), the incomplete ones, the orphans, the duplicate ids; the GM
material; every `assets/` path the document names and whether the zip has it. Bounded, guarded,
never throws: a file that crashed the engine's parser must not crash this one. Read on demand at
`/admin/debug/<id>/inspect`, admin only; the bytes stay where they are and nothing about the
reading is stored. Storage is still the unparsed path it always was.

**Open in the app** (owner: "how feasible is just an 'open in SSE' button next to download... or
will that hit CORS issues?"). Feasible, and no CORS problem: the download route has answered
cross-origin since `cors.ts`. The engine needs to accept a URL, fetch it and hand the bytes to its
file-import path - R-17 in `docs/sse-requirements.md`, a prompt in
`docs/prompt-for-sse-2026-09-05.md`. The hub's side is built and gated: `open_in_sse_url`
(migration 0026) holds the engine's prefix and the button appears only once it is set, so nothing
ships dead.

**Also:** the Gates page was reachable only by URL; it is in the admin nav now.

**The dream (0.19.1).** "When you see an image/banner you can just open it in a new tab on SSE."
So the map page's cover is that link, and every card carries an "Open in SSE" control on its
picture - both from the same `openLink` (`src/lib/openInSse.ts`), both invisible until the engine
prefix is set. A card used to be one anchor around everything, which cannot hold a second link;
it is now a stretched title link (the title's `::after` covers the card) with the open control
above it, so the whole card still clicks through and the picture can also open the app.

### D-36. What the engine ships is FETCHED, not copied; and a button is not offered where it fails

The owner, 2026-09-06: *"i retired the hub - its in good shape - just need to close out the
integrations properly."* The engine's stream M had shipped both of the things the hub was waiting
on, on beta: R-17 (`?open=`, v3.0.314) and R-13 (`shipped-content.json`, v3.0.315). This is what
closing them out came to.

**The baselines are deleted and fetched instead.** The hub has to tell app content from a creator's
own — a calendar is only interesting if SSE did not ship it — and it did that from lists copied out
of the engine's repo by hand. **Those lists had gone stale twice.** The first time was caught within
an hour (one calendar where four were needed, and the facet fired on every real starmap). The second
was found by this work: the tag-category baseline said nine, the engine ships thirteen, so a map
carrying `frontier`, `anomaly`, `science` or `intrigue` was credited with up to four custom
categories it did not have. A hardcoded copy is a standing promise to notice a change in another
repository, and the promise is always eventually broken. `bundle/shipped.ts` reads the manifest;
`server/shippedContent.ts` fetches and caches it; the rules name a list instead of carrying one.

**Measured before claiming it, and the honest version is narrower:** run over the four real saves
to hand, the manifest changes NOTHING - they carry `status`, `class` and `disposition`, all of
which the stale nine already had, and since B112 a save omits the shipped registries anyway
(`temporal_registry` came back empty on every one). So the second drift was LATENT: a live wrong
answer waiting for the first map to use a category the engine added. That is still the whole
argument. A baseline that is right today and wrong at some unknown later date, silently, is exactly
the failure mode a fetch removes - and the first time the hub notices is otherwise a creator asking
why their map claims four custom categories.

**The rule that makes a fetch safe to depend on: unknown is not empty.** A baseline that fails to
arrive would report every shipped calendar as custom — the exact failure the baselines exist to
prevent, and worse than showing nothing, because a browser who learns the pills lie stops reading
all of them. So a rule whose baseline is unknown is SKIPPED. The facet says nothing rather than
something false, and a re-index puts it right once the manifest is reachable.

**The cache is in R2, and it is also the fallback.** Not a config row: a machine-written row among
the gates is noise the owner must learn to ignore. The last good manifest stands however old it
gets — a manifest goes stale a calendar at a time — and a FAILED check is remembered too, for
fifteen minutes, so an engine that is down costs one slow upload rather than every upload. Six
hours between checks, four seconds of patience, and nothing in this path can fail an upload.

**A "Try things" button on the Gates page asks the engine now** and reports the version and the
counts, beside a panel saying what the hub currently believes and how old that belief is. Same
idiom as the webhook and mail tests: the real thing, once, before anybody else sees it not work.

**And the button that could not keep its promise.** Reading the shipped R-17 code turned up a
branch: `?open=` classifies the file and refuses anything that is not a starmap — *"That link points
at a single system rather than a campaign."* The hub hosts both kinds and **the single system is the
more common upload**, so most of the library would have carried a button that opens the app and then
explains that it will not open the map. The words are good; the moment is wrong. `openLink` now
takes the map's kind and returns nothing for a system — and `kind` is a required argument, unknown
included, so a future call site cannot reintroduce the dead end by forgetting. R-18 asks the engine
for the single-system door; the day it ships, one line and one test come out.

**Two documents were reconciled with the behaviour rather than left to be believed:** R-17 said the
download is a `.sse.zip`, where it is the bundle reassembled from approved assets — a zip when the
map carried assets, the plain `.json` when it did not. And R-17's worked example uses
`explorers.starsystemx.com`, which **does not reach the hub**: measured 2026-09-06 it answers 404
from Vercel (`DEPLOYMENT_NOT_FOUND`) while the workers.dev origin answers 200. `site_url` stays
unset for that reason — `loadSite()` then builds download URLs from the origin that actually
answers — and both the requirement and this file now say so, because the next person to read them
will believe them.

### D-37. The seam has a protocol: two halves, no paraphrase, and one address file

From the SSE coordinator through the owner, 2026-09-06. The protocol is written in the engine repo
(`docs/dev/session-briefs-2026-08-28.md`, "SEAM PROTOCOL"); this records what the hub adopts, and
what the hub changed to obey it.

**Why it exists, in the coordinator's own words:** *"the contract between them drifted three times
in one week: the hub's file still said 'paste UI pending' a day after the engine shipped it; the
engine's copy of the requirements lacked R-17 until a brief told a stream to add it; and the rule
that the 'Open in Star System Explorer' prefix goes to BETA first lived in nobody's file. None of
that was a misunderstanding of terms. It was two copies of one contract, and checks that no
single-repo agent can run."* That matches what this session found from the other end: R-13 and R-17
had both shipped and the hub's file still called them open, and R-17's own worked example named a
host that answers 404.

**Rule 1, two halves.** `docs/sse-requirements.md` is the hub's half and now carries a **HUB-SIDE
STATUS** under each shipped R-number: what the hub has SET, CONSUMED and VERIFIED - and, as
important, what it has NOT verified and whose that is. The engine's half is its
`docs/dev/hub-requirements-for-sse.md`. Each side writes only its own and quotes the other. **A
status that has been retold is not a status.**

**Rule 2, the SEAM REPORT block.** A shipped R-number arrives as one fixed block and is pasted
whole. R-13's and R-17's are in place. R-18 is the first block going the other way, side `hub`.
Pasting rather than summarising is the whole mechanism: a version, a commit and a URL that have
been through somebody's paraphrase are the drift this is here to stop.

**Stream N is fired by the OWNER, never by the hub.** The hub says `ready for: STREAM N N-x` when
its half of a check is in place, and stops there.

**What the hub changed to obey it.** The prod rule - production is a read-tree release on the
owner's word - was already followed and was written in nobody's file, so it is now stated at the
top of the hub's half and in `src/lib/addresses.ts`.

**SUPERSEDED IN PART, the same evening (see D-41):** the DNS moved and
`explorers.starsystemx.com` now serves the hub, so the trap below - that it answered 404 from
Vercel - is history. It is left standing because the reasoning it taught is not: an address the hub
EMBEDS outlives the request that made it, so it is measured before it is believed.

**And that file is the other half of this decision, from the owner (2026-09-06):** *"URL is actually
https://starsystemx-creator-hub.orange-tree-847c.workers.dev/ at the moment - have it a base config
item - so its easy to change later - work off a variable just now so we can test."* `src/lib/addresses.ts`
is now the only file in the hub that contains an address: where the hub answers, the name it will
answer to one day, the engine's two origins, and the two defaults built from them. The engine keeps
the same rule on its side (`src/lib/hub/hubConfig.ts`), which is what made its DNS cutover a
one-line change rather than a hunt.

**Two consequences worth stating, because both change behaviour:**

1. **`site_url` unset now means `HUB_ORIGIN`, not the request's origin.** The origin fallback made
   the hub correct on any host with no configuration, which is the right property for a page and the
   wrong one for a URL the hub EMBEDS in a link somebody else fetches - a download URL inside an
   "Open in SSE" link, an Open Graph tag, a cover's QR code. Those outlive the request, and the
   engine only fetches hosts on its allow-list. A named default can be checked; an origin is
   whatever the visitor typed.
2. **An empty ADDRESS row means "nobody has said otherwise", so the code default stands.** Every
   other gate reads its row literally - a `0` has to mean zero - but `open_in_sse_url` and
   `sse_manifest_url` were created empty by their migrations, before the engine could receive
   anything, and empty there is the absence of an answer. Reading it literally would mean the hub
   could only ever be pointed at the engine by hand, on every database, which is the fiddling the
   owner asked to be rid of. **The off switch stays real:** a row reading `"off"` - anything that is
   not an http(s) URL - and nothing builds a link from it.

### D-38. The banner is a banner; the staff areas are grouped by capability and coloured by tier

The owner, 2026-09-06, twice in one message: *"get rid of the 'Open Star System Explorer' in the
top banner - we have it at the bottom and on every map"*, and *"have the report/messages, etc have
remainder of outstanding work on them (number circles usual) - also structure better on admin.
perhaps use colour to differentiate between 'normal user' 'admin user' and 'moderators' - who will
have access to a lot less. group by area/capability."*

**The general link had become the weakest link on the page.** Every map page and every card now
carries "Open in Star System Explorer" for THAT map, which is the funnel working; a banner link to
the app in general competes with it and wins nothing. Gone from the top, kept in the footer, where
it answers the question the footer asks ("What is Star System Explorer?").

**Eight admin links in the banner made a public map page's chrome half staff plumbing.** The banner
now carries one "Admin" entry with the work waiting on it, and the areas themselves are a strip
that appears on the admin pages, grouped:

- **Moderation** - review, reports, comments, explorers. Watching what people post.
- **Running the place** - usage, backups, gates, debug. Owning the server.

**The colour is the TIER, and the grouping and the colour say the same thing twice on purpose.**
Blue is what somebody who moderates could reach; amber is the owner's. A key at the end of the
strip says so, because a colour nobody can read is decoration.

**There is no moderator role yet, and inventing one was not this task.** `creator_role` is
`('user', 'admin')` (migration 0001). `src/lib/adminNav.ts` declares each area's tier anyway, so
the shape of the role is drawn before it exists and the decision can be made by looking at it
rather than by imagining it. Creating it is one migration, one guard, and a decision about who
moderates - the owner's. **The one judgement already made and worth arguing with:** `explorers` is
ADMIN, not moderation. Removing a picture or a comment is undoable; suspending, banning or deleting
a person ends their account and their maps. A moderator watches the content; the account is the
owner's to end. `tests/adminNav.test.ts` pins that.

**The counts.** Three head counts in the root layout, for admins only: pictures waiting
(`assets.review_state = 'novel'`, exactly the review queue's own predicate, so the badge and the
page can never disagree), reports still open, and debug uploads stored. **Null is not zero:** a
count that could not be taken shows no badge, because a nav that says "0 reports" when it does not
know is the same shape as the truth and wrong. **And the debug count stays out of the banner
number** - those are kept files, not a queue, so it would never reach zero, and a badge that never
clears teaches people to stop reading the two that mean something.

### D-39. The moderator role exists, and the line is "can it be undone"

The owner, 2026-09-06: *"I do have someone to give that role to... so useful if built - they would
need: Tag Review, Review, Comments, Explorers, Reports. Running the place = just admin. Like the
new bar."* Migration 0028 adds `moderator` to `creator_role`; `server/auth.ts` grew `isStaff` and
`isAdmin`, which are type predicates rather than booleans because they replaced
`viewer?.role !== 'admin'` at every guard and that comparison was doing the null check too.

**The line, in one sentence: a moderator judges CONTENT, and everything they can do can be undone.**
Suspend, ban, reinstate, remove comments, take a map down, put it back, keep or merge a tag, approve
or ban a picture. The owner's alone: the config, the usage, the backups, the debug uploads - **and
two things inside a page a moderator can otherwise reach in full: DELETING an account, and handing
out the role itself.** Neither has a way back, and the second decides who the staff are. Said here
because it is the one place this session went further than the instruction, and it is one line in
`routes/admin/explorers/[handle]/+page.server.ts` (`staff` against `ownerOnly`) if the owner would
rather it moved.

**Nobody is granted the role by a migration.** It is a control on the explorer's own page, admin
only, never on yourself - an admin who could demote themselves can lock the place, and one who
could promote themselves makes the role meaningless.

**Also in the bar, from the same message:** "Gates" became **Config** (*"Gates - is not a great
title - its 'config' surely?"* - the route was `/admin/config` all along), and **Debug is its own
group between Moderation and Running the place, in its own red**. That is right, and the reason is
worth writing: a debug upload is neither the library's content nor the server's housekeeping. It is
raw, unreviewed bytes from somebody whose app fell over.

### D-40. A creator can ask for a tag, and the review page's job is "did you mean this one?"

The owner, 2026-09-06: *"Tag group around game systems: grab all the relatively well known ones and
more open categories. Also all yah categories should have the option of adding custom tags. With a
+. But I will always review and on review page similar named tags (fuzzy search) can be shown next
time it and be swapped in on a click instead. Otherwise accepting it makes it a tag for everyone to
use."*

**Two new groups first.** `Game system` opens with `system-agnostic`, `any-system` and
`homebrew-rules` before any of the two dozen named ones, because most maps are not made for a named
system and a list that opens with trademarks tells that creator their map does not belong.
`Rules style` is the "more open categories" half: `osr`, `pbta`, `forged-in-the-dark`,
`rules-light`, `crunchy` and the rest, which are real things to filter on whatever the system.

**The "+" is a REQUEST, not a text box, and that is the whole design.** The vocabulary is curated
because free tags fragment - "scifi", "sci-fi", "science fiction" and "SF" become four dead-end
filters that each find a quarter of the maps - and a "+" is exactly the door fragmenting comes
through. So a proposed tag does not go on the map yet: it would be an unreviewed word on a public
page, which is what the picture queue exists to prevent, and it would filter nothing because nobody
else can pick it. It lands on the map when a reviewer says yes, or the map gets the tag it was
merged into.

**The review page therefore does not ask "is this a good word".** It asks **"do we already have
this one?"** - the near matches sit first, drawn as pills, one click each, and taking an existing
tag is easier than keeping a new one. `similarTags` maxes three signals rather than averaging them,
because each is evidence on its own: edit distance catches `travellar`, containment catches
`hard-sf-setting`, and shared words catch `number-stars-without`. **What it cannot do is said in the
code and pinned by a test: a synonym sharing no letters is not a string problem.** `sci-fi` will
never suggest `hard-sf`. That is the reviewer's judgement, and the reason a person sees every word.

**Accepting makes it everyone's on the next request, with no deploy.** The vocabulary is now three
layers - the curated list, the `creator_vocabulary` config row, and accepted rows in
`tag_proposals` (migration 0029) merged into their group. A merged or rejected word is remembered,
so the second person to ask gets the first person's answer instantly, and a rejection does not
reopen by being asked again.

**And a crash log is now a thing the inspector reads.** The owner asked, in the same message,
whether debug parses crash files. It did not: a log is neither a zip nor JSON, so it got "neither a
zip nor JSON", which is true and useless - when the app falls over, the console is what a person
has to hand. `inspect.ts` now reads text as a log and pulls out the build, the browser, the first
error with the frames under it (the first is the cause; the rest are its echoes) and each distinct
error once. **One trap, found by a test rather than by thinking: a console log's first line is
often `[holo] scene ready`, and the old code called any leading `[` JSON.** A leading bracket now
has to parse before it counts as JSON; a leading `{` still means a save, because reporting on
broken saves is what the page is for.

### D-41. The hub answers to its own name, and the cutover cost one line

The owner, 2026-09-06: *"all dns setup right - https://explorers.starsystemx.com/ works for you now
- so can update everything accordingly."*

**Measured before changing anything, because that is what this whole file has been about all day:**
`https://explorers.starsystemx.com/` answers 200 with `x-hub-version: 0.23.1`, and
`/api/download/local-neighbourhood` answers 200 with `access-control-allow-origin: *`. The
workers.dev origin still answers.

**The change was `HUB_ORIGIN` in `src/lib/addresses.ts`, and nothing else** - which is the return on
D-37's "one file holds every address", collected within a day of paying for it. Every Open Graph
tag, every cover's QR code, every "Open in SSE" download URL and the sitemap and feed moved together
because they all read the same constant.

**Nothing was needed from the engine, exactly as its status report predicted.** Both hosts were
already on `TRUSTED_OPEN_HOSTS`; listing the agreed name ahead of the cutover is what made the day
an edit rather than a release. The workers.dev origin stays trusted, so every link already posted to
a Discord keeps working.

**Two per-hostname registrations are now owed, and both are the owner's** (they live in other
people's dashboards, not in this repo): the Discord OAuth redirect
`https://explorers.starsystemx.com/api/link/discord/callback` - the hub sends
`url.origin + '/api/link/discord/callback'`, so linking a Discord account from the new hostname
fails until it is registered - and Supabase Auth's redirect allow-list, which needs
`https://explorers.starsystemx.com/login` for the password-reset link to come back to the right
place. Sign-in itself is email and password through the API and is unaffected by either.

**And `cover_label` is now true.** It has printed `explorers.starsystemx.com` on every generated
cover card since migration 0015, which was a promise about a domain that did not answer; it is a
fact now, and nothing had to change to make it one.

### D-42. The log has somewhere to be read, and it is the admin's

The owner, 2026-09-06, having given somebody the moderator role: *"have admin get a list of all
moderator actions in a log."*

**Nothing new is recorded for this.** `audit.record` has been called on every staff action since
migration 0001, and `audit.ts` says why: *"when a creator asks why their map vanished, the answer
must exist."* What did not exist was anywhere to READ them - and a log nobody can open is a log
nobody is accountable to, which is most of the value gone. `/admin/log` is that page.

**ADMIN ONLY, and that is the point rather than an omission.** This is how the owner watches the
moderators, so it belongs to the person who hands out the role. It sits in "Running the place",
where a moderator cannot reach it.

**Three filters, and the third is the owner's question asked directly:** who (any admin or
moderator), what (Moderation / Tags / Accounts / Running the place / Other), and "only what a
moderator can do". The filters live in the address, so a view can be linked and paged.

**The labels live in `src/lib/auditLog.ts`, not in the page.** `creator.banned` and `asset.ban` are
written by two different files and read by one; a page de-dotting slugs by hand ends up saying
"creator banned" beside "asset ban". A slug this file has never heard of still renders - de-dotted -
because the next session will add an action and forget this file, and a test pins that it reads as
words rather than as nothing.

**Two small honesty details.** The group and moderators-only filters are properties of the ACTION
NAME, which lives in that module rather than the database, so the query over-reads and the Worker
filters - putting the slug list in a SQL `in` clause would be the same list in two places, drifting.
And an action whose actor is null shows as **"a deleted account"**: the foreign key is
`on delete set null`, so what was done outlives whoever did it, which is exactly what an audit log
is for.

### D-43. Four notes on the cover editor, and a badge that would not clear

The owner, 2026-09-06, after using the designer for the first time.

**"Outlined does nothing noticeable" - and it did nothing, by construction.** `outline` painted the
same halo every face gets over a photograph, in `p.bgBottom` - the background colour - on the
background. Invisible, and it had been since the face shipped. An outline is HOLLOW letters: the
ring takes the text colour and the body takes the colour behind it. That is what the name says and
it is now unmistakable at a glance, which was the complaint.

**"Put explorers.starsystemx.com BELOW the What is in it."** The domain sat at the bottom RIGHT,
opposite the counts, with a rule that shuffled it up a line when the two would collide. Stacked in
the left column they read as one block - what this map is, and where it came from - and the
collision rule is gone with the problem it solved. **The QR keeps the corner it has always had**,
which the owner said was the right placement; it is now drawn FIRST so the counts can be told how
much room is left and set smaller rather than run under it.

**The QR is on by default.** A card without one is a picture; a card with one is a way back to the
map, which is the only reason the hub draws cards. `coverOptionsFrom` still honours a creator who
turned it off - a default must not reach back and re-tick a cleared box, and a test pins that.

**"Greenscreen should colour the elements on the map green more."** The palette reached the words
and left the map alone, so a green screen carried a blue ocean world and an orange K star. A palette
may now carry a `tint`, and every element colour goes through it: LUMINANCE onto the phosphor's
ramp, floor lifted off black so nothing vanishes. **Relative brightness survives, which is the whole
argument for a ramp over one flat green** - a gas giant still reads differently from a moon, they
are just both green. The QR keeps its white quiet zone in every palette, because it has to scan.

**And the badge that would not clear.** The owner cleared the review queue and watched the (1) sit
there. The cause: the review page decides by `fetch`, not by a form action, so nothing re-ran the
layout load that counts the queue - every other staff page posts a real form, and SvelteKit re-runs
every load after an action, which is exactly why only this one was wrong. The layout load now
declares `depends('hub:counts')` and the review page invalidates that one key: the badge refreshes
and the queue on screen does not re-fetch, so a reviewer holding down A pays for four head counts
rather than for the whole queue as well.

### D-44. One place chooses the cover, and a picture that cannot be used says why

The owner, 2026-09-06: *"use cover does not work - even after approved. I think the add as cover
does not go there. instead the cover designer just below should let you pick the default or any
approved image they have ever approved (non approved appears greyed out)."*

**Two controls did the same job and one of them was invisible.** A screenshot carried "Use as
cover", which set the picture as the cover with no words on it; the designer below had its own
"one of my screenshots" base, which draws the picture WITH the words. Whichever you pressed, the
big image in the Cover panel went on showing the DESIGNER'S PREVIEW - so a working "Use as cover"
looked exactly like a broken one. **I could not reproduce a failure in the write itself** - the
action set `cover_sha256`, and `/asset/<hash>` serves any approved hash - which makes the preview
the likeliest thing the owner was reading, and either way the answer is the same: stop having two.

**So: one picker.** The designer opens with a row of choices - "The card", then every screenshot
ever added - and what you pick is what the preview shows and what "Use this cover" stores. The
separate button is deleted with the path (`?/cover` is gone).

**A picture that cannot be used is shown and greyed with the reason** - "Waiting to be reviewed",
or "PNG or JPEG only" - rather than left out of the list. A creator who cannot find the screenshot
they just added is being asked to guess which of their pictures the hub dislikes.

### D-45. Yours to upload, yours to take away

The owner, 2026-09-06: *"how do I as a user delete a starmap i uploaded - I can unpublish but not
seen how to remove altogether."* You could not. Unpublishing hid it; the only way to remove one was
to delete your entire account, which is not an answer.

`accounts.deleteSystem` is `deleteCreator` scoped to one map: gather what R2 holds, delete the row
so the children go by cascade, drop the bundle, then free every asset nothing else references. On
the manage page it is a danger zone with the title typed back, the same shape as deleting an
account, because it cannot be undone either.

**What survives it, and both are deliberate.** A ledger VERDICT outlives the map that carried the
bytes - a banned picture stays banned, which is the rule `deleteIfUnreferenced` exists for. And the
audit row stays: the record of what was done is the point of having one.

**Said plainly on the page:** if you only want it off the site, take it down instead - that keeps
everything and you can publish again whenever you like. Deletion should be the deliberate choice,
not the one people reach for because the other was not obvious.

### D-46. Two more alphabets, because four faces were one typeface

The owner, 2026-09-06: *"Different fonts - i kinda suggested new font families for different look
and feel."* Fair, and the earlier note in `font.ts` had already conceded it: `pixel`, `bold`,
`outline` and `wide` are four ways of DRAWING one glyph set, so a control labelled with font names
changed less than anybody would expect from it.

**`round`** is geometric - diamond bowls on O and Q, cut corners on C, E, F, L and S, a pointed A,
a U with a round bottom. **`narrow`** is a three-column alphabet of its own rather than the base
squeezed: squeezing five columns into three loses the counters, and a condensed face wants
different letters, not thinner ones. It fits a title half again as long, which the wrap width knows
about.

**Punctuation falls through to the base set**, and that is the design: a hyphen is a hyphen at any
width, and forty more glyphs nobody could tell apart is forty more chances to draw one wrong.

**BOTH FAULTS THESE SHIPPED WITH WERE FOUND BY LOOKING AT A RENDERED CARD, and both are now
pinned by a test.** `narrow`'s `N` was indistinguishable from its `K`, so "FRUNK" read "FRUKK" -
a diagonal has nowhere to go in three columns, so `N`, `M` and `W` were given a fourth. `round`'s
`U` was byte-for-byte its `V`. And the test written for those two then found a third nobody had
noticed: in both families the letter `O` and the digit `0` were the same glyph. A dotted zero and
a slashed one. **A glyph set is data, and data can be checked** - `tests/families.test.ts` now
refuses two characters drawn identically, which is a rule the eye finds only by accident.

### D-47. Every button on the Gates page had been throwing for a fortnight

The owner, 2026-09-06: *"I tested the mail and the discord link button. They both Error out with a
500. BTW - when I add a new map it does get posted on my Discord."*

**That second sentence is what made it findable.** The webhook works, the outbox works, `postShare`
works - so the fault could not be in any of them, and a 500 rather than the 502 the action's own
`catch` returns meant the throw happened before the code ever ran.

**It is a SvelteKit rule, enforced at request time:**

```
if (actions.default && Object.keys(actions).length > 1) throw new Error(
  'When using named actions, the default action cannot be used.')
```

The Gates page had `default` (Set a gate) from the beginning and grew its first NAMED action in
0.18.0. From that moment every button on the page threw - not only the two test buttons but **Set
itself**, which had worked for weeks. Nothing said a word: it is not a build error, not a type
error, not a warning. The page renders perfectly and dies on the POST.

`default` is now `set`, and the form names it.

**The test is the point of this entry.** The rule is one grep over the source, so
`tests/actions.test.ts` reads every `+page.server.ts` and refuses a default action beside named
ones. It was run against the fault put deliberately back before being trusted - it named the file
and listed the four actions - and the check that the heuristic itself still matches this codebase's
way of writing an action is in there too, because a source-scanning test that quietly matches
nothing passes every case.

**What this says about the two things it broke.** "Send me a test email" has never once been
pressable, so SMTP is still entirely unproven - the URL configuration is set, and the button that
would test it was broken. And any config row the owner has ever set was set in SQL, because the
page could not do it.

### D-48. What a save IS comes from the save, not from a filename that was never there

The owner, 2026-09-06: *"i uploaded a system map - it is still labelled a starmap and has 'open in
SSE' as an option (that we know will not work)."*

**One assumption, made once, in a place nobody would look for it.** `openBundle` reads the kind
from the document's filename inside a zip - real evidence. For a PLAIN `.json` upload there is no
filename, and the line that filled the gap was:

```ts
docPath = DOC_NAME.starmap;
```

A guess. And Star System Explorer exports a single system as `<Name>-System.json`, a bare file - so
**every plain upload the hub has ever taken was labelled a campaign.** From there the wrong kind
set the card's label, the tree's opening depth, and - since D-43 - whether the map was offered an
"Open in SSE" button the engine refuses for a system. One default, three visible symptoms, none of
which pointed at it.

**The document was never ambiguous.** A campaign has `systems`, a single system has `nodes` - the
rule the inspector and the facet counter have both used all along. `detectKind` is now that rule,
in `bundle/contract.ts`, and the filename survives only as the tie-breaker for a document that says
nothing either way, which is the one case where it is evidence rather than a default.

**It also fixes something quieter.** A save the creator asks the hub to strip is rebuilt as a zip
under `docPath` - so a stripped single system was being written into `starmap.json`, a bundle
lying about itself to whatever read it next. A bare `.json` is now named after what it turns out
to be.

**And the maps already stored wrong come right without anybody re-uploading**, which is the
standing rule (D-26): the re-index re-reads the kind from the stored bytes. It is on the manage
page as a button, so the owner's map is one press from being a system again.

### D-49. The hub can write to you, and two workarounds come out

The owner, 2026-09-06: *"i got a password reset e-mail. means we have mail working - so we can
probably fix a couple of the workarounds now - like the takedown can be sent to admin with the
appropriate header and i can start getting mails to approve stuff."*

**HALF TRUE, AND THE HALF THAT IS NOT MATTERS.** The password reset proves the Resend credentials
and the verified domain, because Supabase Auth sent it through the SMTP settings in its dashboard.
It does not give the hub a way to send mail: `resetPasswordForEmail` is Supabase sending one of ITS
templates to a user of ITS auth system, and there is no "send this text to this person" anywhere in
it. So the hub now calls **Resend's API directly** - one POST, no SMTP library, nothing held open,
which is a Worker's natural shape anyway.

**Inert until configured, exactly like the Discord integration:** `RESEND_API_KEY` as a Worker
secret, `mail_from` and `mail_admin` as config rows (migration 0030). With any of the three missing
nothing is sent, every surface says so, and the outbox leaves the intent PENDING rather than failed -
it is waiting, not broken. **The key is a secret and not a row** because a row is readable by
anything that can read the config table, and a sending key is a sending key.

**The takedown form, which D-16 refused to build.** That refusal was right at the time and its
reason was written down: *"a form that silently fails is worse than an address - a copyright claim
that never arrives is the one message here that must not go missing."* Only the first half of that
has changed, so: the form is offered AS WELL as the address, never instead. It rides the outbox, so
a claim that fails to send is retried rather than lost; it carries the reporter's address as
`reply_to`, so the notice comes from the hub's own domain (and is not filtered as a forgery) while
pressing reply reaches the person. Every refusal hands back what they typed, because a form that
empties itself when it says no is a form people abandon.

**The dedupe key is the CONTENT and the hour**, not the person and the hour. Pressing Send twice
sends one message; a second, different report in the same hour goes through. Keying on the sender
would have silently swallowed a real second claim - the exact failure this whole page is written
around.

**And the nudge: "something is waiting for you".** The queues have been visible since D-38, but
only to somebody already looking at the site, and a queue gets read when it comes to you. Three
rules, each about not becoming noise: it writes only when something is ACTUALLY waiting (a mail
saying "nothing to do" teaches you to filter the sender); at most one every six hours, enforced by
the outbox's unique dedupe key rather than a new table; and work younger than thirty minutes does
not count, because a picture uploaded a minute ago is not a backlog. It rides the existing
fifteen-minute cron, so there is no new schedule and no new secret.

**A third test button, because the two paths can break independently.** "Send me a test email"
asks Supabase to send one of its templates and proves its SMTP; "Send a test from the hub itself"
is the hub writing a message through Resend, which is what the form and the nudge use. Either can
work while the other does not, and a single button would have hidden that.

### D-50. The hub already knows your address; asking for it back was a row for the sake of a row

The owner, 2026-09-06, on being told "Set mail_admin first - that is where the hub writes to":
*"where? i am the admin - i used an email to set it up."* Then: *"it needs to be pinned there for
admin emails."* Both fair, and they want two different things, so it does both.

**The lookup.** `mail_admin` empty now means EVERY ADMIN'S OWN SIGN-IN ADDRESS. The hub already
reads one to send the Supabase test; asking the owner to type it back in was friction with nothing
on the other side of it. Plural deliberately: with two admins, a queue nudge that reaches one of
them is a rota nobody agreed to. The row still wins when it is set - that is how notices go to a
shared inbox or an alias instead.

**And the sender defaults too.** `mail_from` is `keeper@starsystemx.com` from `$lib/addresses` -
the owner's choice, and the site's own word for the person running the place (the **Keeper** badge:
*"Keeps the lights on and the celestial bodies clothed"*). It is the
one file that holds an address. It encodes the fact that matters: the sender must be on the domain
VERIFIED with Resend, which is `starsystemx.com` and NOT the hostname the hub is served from - a
verified domain does not carry its subdomains. A wrong sender is refused loudly by the mail service
and reported on the button, where a missing one was a row somebody had to be told about.

**So `RESEND_API_KEY` is the only thing that must be set by hand**, which is the right shape: a
secret cannot have a default, and everything that can have one does.

**Then: PIN IT, because a default nobody can see is a magic trick.** The Gates page now names the
address the hub would write to and says where it came from, and offers one button to write that
address into the row. Nothing about the destination changes; what changes is that it becomes
explicit, editable, and stable if the sign-in behind it ever moves. The general rule this is the
second instance of (after `open_in_sse_url`): **a default the page states out loud is a
convenience; the same default kept quiet is a surprise waiting for whoever inherits it.**

### D-51. A switch for the Discord posts, checked where nothing can pile up behind it

The owner, 2026-09-06: *"in testing can i have a switch under config to disable posts to the
discord."*

**Clearing `discord_share_webhook` already stops the posting - and that is exactly why a switch was
needed.** The webhook is a SECRET. A switch you have to go and find a secret to reverse is a switch
nobody uses, so the testing goes out to the live channel instead, which is the thing it exists to
prevent. `discord_share_enabled` (migration 0031, default true) turns the posting off and leaves
the webhook where it is.

**Checked at the ENQUEUE, not only at delivery, and that is the whole design.** Skipping at
delivery is what the webhook check does, and it leaves the intents sitting in the outbox - so a
week of test publishes would all land in a live channel the moment the switch came back on. Nothing
queued is nothing to release. The delivery check stays as well, for the one intent that might be in
flight when the switch is thrown, and it SKIPS rather than fails: it is waiting, not broken.

**The test button still posts.** It is an explicit press by an admin who wants to see the channel
work, which is a different question from whether publishing should announce itself.

### D-52. Mail is counted, and the notice that was waiting for it is sent

The owner, 2026-09-06, once the first mail arrived: *"Switch stuff over. We tracking mail use to
stay in free bounds on usage panel?"*

**No, and that was the wrong answer for the one integration with a DAILY cap.** Resend's free plan
is 100 a day and 3,000 a month, and the daily line is the one that bites: a queue nudge, a comment
digest and a takedown report can all land on the same busy afternoon. Both are meters on the usage
page now, beside the Workers and R2 lines. **Counted from the OUTBOX rather than a new table** -
every mail the hub sends is queued there and stamped `sent_at` when it lands, so the record already
existed; and counted in the Worker rather than added to `hub_stats`, because a new SQL function
would have been a migration for two numbers. **Sent only:** a pending intent has not cost anything
yet, and a failed one never will.

**And the switch-over: comment notices by mail**, which D-33 built the honest version of while the
hub could not send - *"when SMTP exists, mail can follow the same query"*. It follows the same
query, because a second definition of "a new comment" is a second thing to get wrong.

**The part that needed thinking about was the CLOCK, not the query.** `comments_seen_at` is moved
by LOOKING at the account page, and a mail is not a look: if sending moved it, a creator who read
the mail and then opened the page would find the list empty and wonder what they had missed. So
mail keeps its own mark (`comments_mailed_at`, migration 0032) and the two answer different
questions - what have I not READ, and what have I not been TOLD about. The digest asks for both, so
somebody who reads the page first is not mailed about what they have already seen, and somebody who
never opens it is still told once per comment.

**One a day per creator, through the outbox's dedupe key.** Comments arrive in ones and twos; a map
with a conversation on it would otherwise mail its creator hourly, out of a hundred a day.

**The mark moves on QUEUEING, not on delivery.** A retry loop that re-derived the same digest every
fifteen minutes would be worse than a digest that occasionally goes missing - and the outbox retries
the queued message anyway, so the failure this trades away is the smaller one.

### D-53. Decoding a screenshot is the most expensive thing this Worker does, and it was being done every keystroke

The owner, 2026-09-06: *"when using an uploaded pic as a background... it failed to display then we
have a cloudflare error: Error 1102 - Worker exceeded resource limits."*

**MEASURED BEFORE CHANGING ANYTHING, and the guesses were an order of magnitude out.** On the real
files:

| picture | decode | fit |
|---|---|---|
| 3795x1302 PNG, 4.0 MB (4.9 MP) | **168 ms** | 25 ms |
| 2284x1833 PNG, 3.3 MB (4.2 MP) | 125 ms | 23 ms |
| 1708x1177 PNG, 2.6 MB (2.0 MP) | 74 ms | 19 ms |

**The Workers free plan allows 10 ms of CPU per request.** The old guard refused above FORTY
megapixels, which is a limit for a machine that does not exist here. And going over does not fail
politely: Cloudflare kills the request with a 1102, which is exactly what he saw.

**And the cover preview re-renders on every change to the design** - every palette, every tick box,
every font. So the most expensive operation in the codebase was being repeated on each keystroke.

**Three changes, in order of how much they matter.**

1. **The fitted pixels are cached.** The decode happens once per picture and the 1200x630 result is
   kept in R2 as RAW RGB - raw rather than a PNG on purpose, because a PNG would have to be decoded
   again on every use, which is the cost being removed. 2.27 MB in a bucket, and free of CPU at the
   far end.
2. **A source too big is refused BEFORE it is decoded**, from the header - PNG's IHDR, a JPEG's
   first frame marker. Twelve megapixels and twelve megabytes. Refusing after decoding would be a
   refusal that costs exactly what it was avoiding.
3. **The picker says so in advance.** A screenshot too big to draw over is greyed with "Too big to
   draw over" beside the two reasons that were already there (D-44) - the manage page knows the byte
   size from the row, which is the cheap half of the same ceiling.

**WHAT THIS DOES NOT FIX, AND THE OWNER HAS TO DECIDE IT.** If the hub is on the Workers FREE plan,
the FIRST decode of any picture still exceeds 10 ms - 74 ms for the smallest file measured - so
choosing a screenshot as a background will still 1102 the first time, and then work for ever after
if the write landed. Two honest ways out: **Workers Paid** ($5/month, 30 s of CPU) makes this
disappear and removes a whole class of future limits; or the FITTING MOVES TO THE BROWSER, which
can resize an image for nothing, and the Worker is handed pixels it never has to decode. The second
is real work and only worth doing if the plan is to stay free.

### D-54. The browser prepares the picture, and the creator says where it is cropped

The owner, 2026-09-06, choosing between a paid plan and moving the work: *"move to browser... i
dont wanna be on the hook for any runaway cost."* Then, immediately: *"on the crop - let the user
decide where the crop happens... they can slide it."*

**THE EXPENSIVE HALF MOVES TO THE ONE MACHINE WITH CPU TO SPARE.** A browser decodes and rescales a
4-megapixel screenshot in single figures using graphics hardware it already has; the same work in
pure JavaScript on a Worker was measured at 168ms against a free plan's 10ms (D-53). So the page
does it and posts the RESULT to `/api/cover/fit`, which stores it and spends nothing.

**RAW RGB, NOT A PNG, and that is the whole point.** A PNG would have to be DECODED at the far end,
which is precisely the cost being avoided; raw pixels are stored exactly as they arrive and handed
to the rasteriser later with no work in between. 2.27 MB once per picture per crop, against never
spending CPU on it again.

**The validation is the LENGTH, and it is exact.** There is no way to send nearly the right number
of pixels, so anything else is refused without being looked at. The three ownership checks are the
same three `loadBaseImage` makes, because this writes what that reads - a cover is stored
auto-approved on the grounds that the hub drew it, and that holds only if what it drew over had been
looked at, which is as true of pixels a browser sent as of pixels the hub decoded.

**The server-side decode is not deleted, it is GATED** (`cover_server_decode`, migration 0033,
default false). It is a fallback for a picture nobody's browser has prepared, and it belongs off on
a free plan. With no fit and no gate, the card simply falls back to drawing itself: a picture
arriving a moment late rather than a Worker killed for trying.

**AND THE CROP IS NOW A CHOICE.** `coverCrop` takes a focus, 0 to 1 per axis, and it is exported so
the browser and the rasteriser use the SAME MATHS - two fitters that cropped differently would be a
picture that jumps when it is prepared again. The focus rides in `cover_options` with everything
else, and it is in the cache key, so sliding is a different set of pixels rather than a stale cache
to invalidate.

**One slider, not two.** A cover fit only ever has slack on one axis - a tall picture slides up and
down, a wide one side to side - so the page works out which and offers that one. Offering both would
be a control that does nothing half the time, and **a test I wrote for this got the axis wrong first
time and failed**, which is exactly the confusion a second slider would hand to every creator.

### D-55. A button that will not do the thing says so where it is, and the fix is on the same page

The owner, 2026-09-06: *"When I hit publish it fails as it says '1 asset needs a source before you
can share this' at the top. If you click a button and it wont do the thing you expect it should
tell you there... In addition it would be useful to let the user know HOW to do that - or even
better let them paste in the missing details and set licence from this page."*

**Two faults, and the first is the cheaper lesson.** The Publish button was DISABLED, and the reason
was in a notice at the top of a long page - which is nowhere at all once you have scrolled past it.
The button now says why, in its own words, with a link to the thing that fixes it: *"Not yet: 1
picture needs a source."* **A disabled control owes an explanation at the point of disappointment,
not at the top of the document.**

**The second is bigger: the only way to satisfy the gate was to leave.** "Record it in Star System
Explorer and upload the save again" - four steps and a different program, to type a name. And this
is the FIRST time anybody is asked the question, so it is the right place to answer it. The notice
now lists each blocked picture, shows it, and takes who made it, the licence, where it came from
and what it is. Any one of them satisfies the gate; a CC-BY licence still needs a name.

**THE GATE ITSELF DOES NOT MOVE, and the rules are not re-implemented.** `noProvenance` and
`breachesCcBy` are imported from `bundle/attribution.ts` and run over the typed entry exactly as
they run over one read from a file - because a credit typed here and a credit read from a save have
to mean the same thing, and two copies of that rule would drift within a month.

**WHAT IS STILL MISSING, AND IT MATTERS.** A credit typed here fixes the hub's row and the map's
page. **It does not reach the downloaded file**: the credit lives on the NODE in the save
(`node.image.credit`, `node.model.credit`), the download is reassembled from the stored bytes, and
nothing writes back. So a downloader still gets a file that says nothing. The owner asked for this
in the same breath - *"that is then written back to the file for publication"* - and it is the next
piece of work rather than part of this one, because it means patching the stored bundle and that
deserves care rather than the end of a long session. Until then the page says the honest thing:
recording it in the app and uploading again is better, because the credit then travels with the file.

**And "maybe have the option of binning an asset" carries a trap worth writing down before anybody
builds it.** Deleting the `system_assets` row would NOT withhold the picture - `packForDownload`
treats a zip member with no matching row as "not a tracked asset: these always travel" (the
document, ATTRIBUTIONS.md, README.txt), so unlinking it would make it travel unconditionally. Binning
has to be an explicit withholding, not an absence.

### D-56. A system cannot be opened, so it is copied instead

The owner, 2026-09-06: *"you can't OPEN systems into SSE like starmaps... but you can PASTE them
in... so follow through with a white 'Copy for SSE' button instead."*

**The engine has two doors and only one of them refuses a system.** `?open=` takes a campaign and
turns a single system away (R-18, D-43), which is why the hub hides that button for one. But the
PASTE target has been there since engine v3.0.292 (R-14), and every row of the tree on a map page
has offered a clip since D-19. So the door that works is the one the button uses: where a starmap
gets "Open in Star System Explorer", a system gets **"Copy for Star System Explorer"**, which is the
same clip rooted at the whole map rather than at one branch.

**White, and that is the design language rather than a preference.** The cards draw the kinds as a
matched pair - a starmap in the accent, a system in ink (D-43) - so the button that replaces the
blue one is the same shape in the other colour. It is a `<button>` and not an `<a>` because it
copies rather than goes, and it says "Copied - paste it into SSE" for two seconds afterwards, since
a clipboard write with no acknowledgement is indistinguishable from a broken button.

**ONE ROOT, and the limit is the envelope's.** `SseClip` carries `root`, singular, so a system whose
nodes form two separate top-level trees copies the larger one - chosen as the root with the most
beneath it, which is the star rather than a stray barycentre. **Not worked around**, because the
envelope is a contract with the engine and widening it unilaterally is how two codebases stop
agreeing.

**AND THERE IS A CHANGE COMING.** The owner: *"We may need some extra data put into paste files to
ID the [file] - i have asked the hub to work that out - will let you know."* When that arrives it is
a `CLIP_FORMAT` bump in `bundle/clip.ts` - the number exists precisely so the shape can change
without breaking what is already out there - and it should arrive as a SEAM REPORT block (D-37)
rather than as a description.

### D-57. The preview is drawn in the browser, by the same rasteriser

The owner, 2026-09-06, on a second 1102: *"got another Error 1102... while selecting a font on the
custom icon map. that need to be rendered client side too?"* Yes, and the measurement says why.

**IT WAS NOT THE DECODE THIS TIME - THAT WAS ALREADY CACHED (D-53). IT IS THE ENCODE.** PNG-encoding
1200x630 with fflate:

| what is being encoded | cost |
|---|---|
| a drawn card - flat colours, gradients | **14 ms** |
| a card over a photograph | **65 ms** |

A photograph does not compress, so deflate does real work on 2.27 MB of it. Against a free plan's
10 ms that is the whole budget five times over - **which is exactly why picking a font on a
picture-backed cover failed and picking one on a drawn card did not.** The drawn card was over
budget too and survives on Cloudflare's leniency; the photograph is not close.

**A FIRST MEASUREMENT SAID 400ms AND WAS WRONG** - it was the first call, before the JIT had warmed.
Measuring twice cost thirty seconds and would otherwise have justified a much more drastic change.

**And the fix is not a second rasteriser.** `src/lib/cover/` is plain TypeScript with no server in
it, and fflate runs in a browser - so the page imports the SAME `renderCover` the hub runs. The card
is deterministic by design (D-22: no randomness, every angle from a hash), so what the browser draws
is byte-for-byte what the hub would have drawn. **One module in two places cannot drift; two
implementations would.**

So the preview costs the Worker nothing at all now - not for a photograph, not for a drawn card,
not per keystroke. `/api/cover/preview` is deleted with the change rather than left as a second way
to do it. The picture the browser prepared (D-54) is already in memory, so drawing over it needs no
round trip either.

**WHAT IS STILL SERVER-SIDE, and honestly:** pressing "Use this cover" still renders once on the
Worker, because a cover is stored AUTO-APPROVED on the grounds that the hub drew it (D-21), and
bytes the browser hands over are bytes nobody has looked at. That is one ~80ms request instead of
one per keystroke. If it proves flaky, the answer is not to trust the upload - it is to let a
browser-supplied cover go through the ordinary picture review like any other image.

### D-58. The answer to "we might need another field" was a test

The engine coordinator, through the owner, 2026-09-06, on the extra data the hub had offered to put
in paste files: *"I don't think you need to build anything... the useful ask isn't a new field, it's
a promise: that the snippet keeps `kind` and `roleHint`. Today that's an accident of the spread."*

**"No action needed" and "nothing to do" are not the same sentence, and the difference is the whole
entry.** The behaviour is already right; what is missing is anything holding it right. `snippetFor`
keeps `kind` and `roleHint` because it spreads the node and deletes a few things - so a future
refactor to a whitelist would take them out, and the engine's "Paste as a new system" would stop
being offered **with no error at all, just an option quietly greying out.** A silent loss in another
repository is the worst-shaped failure available.

So: the promise is written beside the code that keeps it, and `tests/clip.test.ts` pins both fields
against a real node - alongside what must NOT survive, so the test says what the snippet is FOR
rather than only listing fields. A change now has to argue with a red test instead of passing
quietly.

**And the coordinator's refusal is worth recording as much as the request.** The hub offered a
`rootKind` on the envelope; he declined it because the app would have to verify the claim against
the nodes anyway (their DATA-R4 - a claim in a file is a claim), so it would become **a second
answer to "what is this clip"**. That is the same fault this pair of repositories has unpicked
several times over - the stamp that is not the gate (R-10), the attributions file that is not the
verdict (`ATTRIBUTIONS.md`), the hand-copied baseline that was not the engine's list (D-36). **The
right move when two things could answer one question is usually to keep having one.**

### D-59. Every credit on the map, in one place, with a licence you can pick or type

The owner, 2026-09-06, two notes in a minute: *"licence selection should be a drop down box and a
manual type in"* and *"user should be able to see all the attributions on their file and update them
in the same way."*

**A `<datalist>` is both controls at once.** Pick a suggestion, or type a licence the hub has never
heard of - a studio's own terms, a line from a bundle nobody else has - and it posts as plain text
either way, so nothing downstream needs to know which happened. A `<select>` with an "Other..."
option is the same idea with an extra click and a second piece of state to keep in step, and the
"Other" box is always the one that gets forgotten.

**Why suggest at all, when the field was already free text:** "CC BY 4.0", "cc-by-4", "CC-BY" and
"Creative Commons Attribution" are one licence spelled four ways, and the hub SHOWS this string to
whoever downloads the map. Making the common answer the easy one is the same reasoning as the
creator vocabulary. **It is not a validation** - a licence the hub has not heard of is somebody's
real licence, and `tests/licences.test.ts` says so out loud so that stays deliberate.

**And the list agrees with the gate, which is pinned rather than assumed.** `breachesCcBy` refuses
any CC-BY variant with nobody named; every suggestion containing "CC BY" trips it, and none of the
others does - including **CC0, the one that looks like it should and must not**, because CC0 asks
for nothing. A dropdown that suggested something the gate then refused, for a reason the creator
could not see, would be worse than no dropdown.

**The credits moved out of the failure notice and into a panel of their own.** They were only
visible when they were BLOCKING a publish, which meant a credit that was merely thin - a licence and
no name, a name and no source - had nowhere to be improved. Now every asset the map carries is
listed, blocked ones first and marked with why, each with the same four fields. A model shows a
label rather than a broken thumbnail, and a picture still waiting on review says that instead.

**The shape that came out of it is better than what was asked for:** the notice at the top says
there is a problem and links down, the panel is where the work happens, and the Publish button says
why it is asleep (D-55). Three places, each doing one job, rather than one notice trying to do all
three.

### D-60. The browser prepares the cover; it only SENDS it when the cover is saved

Two reports in one message, 2026-09-06: *"when I re-enter the map editor the picture shows default
even if the current one is a newly uploaded image"* and *"are we only saving the pixels we need for
our screen banner display... probably too high and we should restrict by configurable default."*

**The first was a hole left by D-57.** Moving the preview into the browser meant the fitted pixels
live in a variable, and a page that has just loaded has none - so a cover restored from
`cover_options` as `base: 'image'` drew the fallback card and looked as though the picture had been
forgotten. Nothing prepared it until a thumbnail was clicked. The fix is an effect on arrival: if
the saved cover is a picture, fit it before drawing anything.

**Looking for it found something worse.** `slide()` called `prepare()` on every input event, and
`prepare` uploaded. Dragging the slider therefore POSTed **2.27 MB of raw RGB per distinct crop
position** and left an R2 object behind for each one. A regression I introduced in D-54, and the
owner had not noticed it yet.

The split it needed was there in the requirement all along and I had not seen it:

- **Fitting is free** - a canvas draw the browser does for nothing. Do it on every change.
- **Sending is not** - it exists so the hub can draw its own copy. Do it once, on save.

So `fitLocally` runs on mount, on picking a picture and on every slider tick; `uploadFit` runs from
the form's submit handler and nowhere else. A `wanted` slot catches the crop asked for while a fit
was in flight, so the slider never ends up behind the last thing that finished.

**And the honest answer to the storage question was no, we were not.** Three copies existed: the
full-resolution original as the asset, a 1200x630 raw fit per crop, and the rendered card. The
original is right to keep - it is the creator's picture and it travels in the bundle - but the
2048x2100 upload was 1.3 MB of pixels nothing would ever display at that size, and every abandoned
crop position was a further 2.27 MB. Both are fixed: the browser shrinks anything past
`max_screenshot_edge` (2048) BEFORE it uploads, and a new fit sweeps the old crops for that picture.

**Two hard-coded numbers became config rows** - `max_screenshot_bytes` (was 8 MB in an `if`) and
`max_screenshot_edge` - because the owner asked for "a configurable default" and because a limit
nobody chose is a limit nobody can change. **The creator is told when a picture is scaled**: a
picture quietly resized behind somebody's back is the kind of thing they find out about later and
stop trusting the page over.

### D-61. Fan work is named as fan work, on every page and inside every file

The owner, 2026-09-06: *"people are going to be putting together their fave sci-fi universe - we
need to ensure everyone knows this is fan made content and no liability of ownership is made by the
user or SSE."*

He is right about what is coming, and the hub had already invited it: the Game system tag group
ships `star-trek-adventures`, `warhammer-40k`, `dune-rpg` and `star-wars-rpg`. A starmap of the
Alpha Quadrant with no notice on it looks, to a rights holder skimming the page, exactly like
somebody claiming it.

**Two layers, and the difference between them is the whole design.**

1. **The blanket.** Every map page, the footer of every page, and every download carries the notice
   whether or not anybody filled a field in. It has to be unconditional, because **the map that
   needs the notice most is the one where the field was left empty.**
2. **The name.** `systems.fan_setting` (0034) holds the universe the creator says it is - free text
   with a `<datalist>` of the obvious ones, the same control as the licence field (D-59). When it is
   there, the notice NAMES what is disclaimed: "an unofficial fan work based on Star Trek... not
   made, endorsed or approved by the owners of Star Trek... all trademarks and copyrights in Star
   Trek belong to their respective owners." That is a categorically stronger statement than a
   generic one, and it reads as somebody being careful rather than somebody covering themselves.

**Why not a tag.** There is already a Universe group and a Game system group and a setting nearly
fits. It is not a tag because a tag is a shared vocabulary that goes through review before it can be
used, and **a creator must not have to wait for a moderator before they can disclaim somebody else's
trademark.** Tags are for finding maps; this is a declaration.

**The wording lives in one module** (`src/lib/fanWork.ts`), for the same reason as `attestation.ts`:
it appears on the map page, on the cards, in the terms, in the upload form and inside the downloaded
README, and five copies would drift on the first change.

**It travels with the file.** A notice that exists only on a web page protects nothing once the zip
has been passed around a Discord server, and this is a hub whose entire purpose is files leaving it.
`packForDownload` appends it to `README.txt`. **A bare `.json` save does not get one** - it is a
document the engine parses, and adding a key to somebody's save to carry a legal notice would be
editing their file - so those carry it in an `x-fan-work` response header instead, which meant
adding `access-control-expose-headers`: a cross-origin reader cannot see a header it is not told
about, and the engine reads this endpoint cross-origin.

**Fair use is not claimed, deliberately and in the tests.** Whether a given map qualifies turns on
that map in that country. A hub asserting it on everybody's behalf would be making a legal claim it
could not stand behind, so `tests/fanWork.test.ts` asserts the phrase is absent.

**The attestation went to version 2** with the fan-work sentence added. The version is stored with
each answer, so every record made before today still says exactly what its creator was shown - which
is the only reason a stored attestation is worth anything.

**Tone matters here.** The pill and the notice are grey, not red. Fan work is welcome; a warning
colour would read as "something is wrong with this map" and put people off making it.

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

**ANSWERED 2026-09-06 (D-49), and only the first half changed.** The hub can send mail now, so
there IS a form - but the address stays on the page beside it, because the second half of that
sentence is still true. A broken form must never be the only way out of this page.

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
