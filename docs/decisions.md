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

**WHAT WAS STILL MISSING, AND IT MATTERED - CLOSED BY D-62.** A credit typed here fixed the hub's
row and the map's page and **did not reach the downloaded file**: the credit lives on the NODE in
the save (`node.image.credit`, `node.model.credit`), the download is reassembled from the stored
bytes, and nothing wrote back, so a downloader got a file that said nothing. The owner asked for it
in the same breath - *"that is then written back to the file for publication"* - and it was left as
the next piece of work because it looked like it meant patching the stored bundle, which deserved
care rather than the end of a long session.

**It did not mean that.** D-62 applies it at PACK TIME instead and never touches the stored bytes.
The sentence this decision used to end on - "recording it in the app and uploading again is better,
because the credit then travels with the file" - **is no longer true and has been taken off the
page**: the credit typed here travels with the file now. Recording it in the app is still worth
doing, but for a different reason: it is what makes the creator's OWN next export carry it.

**"Maybe have the option of binning an asset" was ANSWERED with "forget it" - see D-64**, which
keeps the trap that would have made it expensive.

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

### D-62. A credit typed on the hub goes into the file, and it is applied on the way out

The owner, 2026-09-06, asked for it when the Credits panel was built - *"that is then written back
to the file for publication as this is the first time the user is challenged"* - and then, when
asked what to do next: *"do the credit write-back - that is critical to this."*

**D-55 gave a creator the fields and did not close the loop.** The credit lived in `asset_claims`,
the download was reassembled from the stored bytes, and the person who downloaded the map got a
picture with nobody's name on it while the map's own page said who made it. **The hub was saying
something true on a web page and shipping a file that did not agree.** For a hub whose whole
argument is "credit the artists whose work you use", that is the wrong way round.

**THE DECISION THAT MATTERS IS WHERE IT IS APPLIED.** The obvious plan - read the stored bundle,
patch it, re-zip, store - is worse in four ways:

1. **The stored bytes are evidence.** They are what was uploaded and what the attestation was made
   about. Rewriting them means the hub no longer holds the thing the creator swore to, and a
   moderator looking at a map cannot tell which parts a machine changed.
2. **The claims are already the truth.** `asset_claims` is what the publish gate reads, what the map
   page prints and what the review tool shows. Copying that into a second place creates a second
   answer to one question - **the exact fault the coordinator refused on the clip envelope (D-58)**.
3. **It cannot drift.** Patch at pack time and the download is current by construction: edit a
   credit and the very next download has it, with nothing to re-run and no background job to fail
   silently.
4. **It costs no extra CPU.** `packForDownload` already unzips and re-zips, so this adds a JSON
   parse and stringify to work already being done rather than a second re-zip elsewhere - and a
   Worker has 10ms (D-53 is what happens when that is forgotten).

**KEYED ON THE BUNDLE PATH, NEVER ON A HASH.** A model's path is `assets/models/<hash>.glb` where
the hash is the ENGINE'S, and the hub hashes bytes itself precisely because a hash supplied by a
path is a claim from a stranger's zip. Matching on the path matches what `collectAttributions`
actually reads, so **the patch and the gate can never disagree about which asset is which.** Every
node using the asset is credited, not just the first - one hull on two ships is one attributions
entry and two nodes.

**AN EMPTY BOX NEVER BLANKS A CREDIT THE APP ALREADY RECORDED.** This is the dangerous direction: a
patch that deleted provenance while claiming to improve it would be worse than never running. An
empty field is "not answered"; the form already refuses a claim that is empty in all four fields.
The test was verified by breaking `applyTo` and watching it fail.

**ATTRIBUTIONS.md is regenerated** to match the patched doc - leaving it alone would ship a save
whose own attributions file contradicted its own nodes. It is a working document and never a gate
(the header of `attribution.ts` is emphatic about why), so nothing reads it back and getting the
format slightly wrong costs nothing. **One line is added to the engine's shape**: the engine's own
text says the file was "written automatically on export", and letting that stand over credits typed
on a web page is a small lie that costs somebody an hour later.

### D-63. Yes, a clip carries its attributions - by exclusion at one end and by carrying at the other

The owner asked directly, 2026-09-06: *"does every copy/paste carry its attributions to copy into
other maps?"* The answer has two halves and they meet exactly, which is why nothing is orphaned:

- **An asset the BUNDLE carries** (`assets/...`, a `model.hash`) is the only kind
  `collectAttributions` lists - and it is precisely the kind `snippetFor` removes, because it would
  paste a broken link into somebody else's save. **The whole `image` or `model` object goes, credit
  and all**, so a clip can never contain a picture without its provenance or a credit for a picture
  that is not there.
- **An asset that is a real url** - somebody else's hosting, or an app-shipped starter like
  `/models/nasa/iss.glb` - survives the clip **and keeps its credit fields**, because the snippet is
  a spread and a deny list (D-58). The ISS is still the ISS when it lands somewhere else, and it is
  still credited to NASA.

**The map-level half travels on the envelope**: `source.creator`, `source.title`, the deep link to
the object, and `source.chain` when the copied thing was itself pasted from somewhere. The engine
records that as a content credit on paste (R-16), which is what makes the receiving map say
"Includes work from X by Y" and the original's page say "Used in".

**The one thing that does NOT happen, and it is the engine's call not the hub's:** a remote image's
credit rides on the node but is not printed in the receiving map's `ATTRIBUTIONS.md`, because
`collectAttributions` only lists assets a bundle actually carries - *"someone else's hosting is not
ours to credit"*. That is defensible and deliberate; it is written down here so nobody rediscovers
it as a bug. `tests/clip.test.ts` pins all of it.

### D-64. No "bin this asset". The gate stands, and the way out is named instead

The owner, 2026-09-06, on the binning option he had asked for beside the write-back: *"forget it -
let them just be forced to add the attributions."*

**Nothing was built, and that is the whole decision.** The publish gate already forces it: an asset
with nothing recorded blocks sharing (`noProvenance`), and any one of who / licence / where clears
it. The Credits panel (D-55, D-59) is where that happens, and since D-62 what is typed there reaches
the downloaded file as well.

**WHAT THIS COSTS, said plainly, because it is a real cost.** A creator with a picture they genuinely
cannot credit - found years ago, no memory of where - now has no move on the hub at all. Declining
the button without naming the alternative would have left them on a page with a dead publish button
and no visible way forward, which is the same fault D-55 was written to fix. **So the blocked-publish
notice now says it: take the picture off the object in Star System Explorer, export, and upload the
new version** (the link goes straight to `/upload?replaces=<id>`). The move exists; it is just in the
other program, and the hub's job is to say so.

**AND IT IS THE RIGHT DEFAULT ANYWAY.** "I cannot credit this" and "I would rather not bother" look
identical from here, and a one-click bin makes the second one the easy answer. The whole argument of
this hub is that crediting artists is worth a minute of somebody's time - a button that removes the
minute would quietly remove the argument with it.

**THE TRAP, KEPT IN CASE THE QUESTION COMES BACK.** Binning is not a delete of a row. Removing the
`system_assets` row does NOT withhold the picture: `packForDownload` treats a zip member with no
matching row as *"not a tracked asset: these always travel"* - that is how the document,
`ATTRIBUTIONS.md` and `README.txt` get through. Unlinking would make the picture travel
**unconditionally**, which is the exact opposite of what the button says. Binning would have to be an
explicit withholding, with a row saying so, and the reviewer's view would need to show it.

### D-65. The phone pass: measured at 375px, and the good news was the boring part

The owner, 2026-09-07: *"Is this hub site fully mobile friendly? Give it a refresh to make it work
well on mobile - we have it feature full now - so good time to tweak."*

**Measured on a 375px viewport against the live site, not read off the stylesheets.** The answer to
the question was "nearly": **nothing overflowed sideways on any page**, at 375px or at 320px, which
is the failure everybody looks for and the one this site did not have. The layout was already fluid
- `auto-fill minmax()` grids, `flex-wrap` everywhere, one `min-width` query on the map page.

What was wrong was smaller and more annoying, and none of it is visible on a desktop.

**1. BROWSE PUT A SCREEN AND A HALF OF FILTERS BEFORE THE FIRST MAP.** The sidebar measures **924px
tall with one map in the library**, and the mobile rule was `grid-template-columns: 1fr` - which
stacks the sidebar first because it is first in the DOM. The first card sat at y=1272 on an 812px
screen. **And it was getting worse on its own**: that block grows with every tag anybody adds.

Fixed with grid AREAS rather than `order`, because the search box lives in the sidebar and had to
stay at the top while the rest of it went to the bottom - and `order` cannot split one element in
two. So the search form came out of the `<aside>` and became its own area. First card now at y=441.

**2. TAPPING A FIELD ZOOMED THE PAGE AND LEFT IT THERE.** iOS Safari zooms in on any field it
focuses whose text is under **16px, exactly**, and does not zoom back out. The map page's tree
search was `0.9rem` = 14.4px. The reader taps a search box and has to pinch their way out of a
scaled-up page.

`src/app.css` carries a 16px floor - **with the only `!important` in the file, on purpose**: Svelte
scopes a component's rules with a class, so `.q.svelte-1i18ra0` outranks a bare `input` selector no
matter how the global sheet is written, and **a floor any component can silently drop below is not a
floor**. `tests/mobile.test.ts` works out which classes land on a form field and refuses a
`font-size` under 16px on any of them. **It found a second one immediately** - `.row input` at
0.85rem on `/admin/reports`, which is exactly the page a moderator would clear from a phone.

**3. NO HOVER MEANS NEVER.** The tree's row actions sit at `opacity: 0.55` until the row is hovered.
On a touch screen that hover never happens, so the dimming is permanent and **the copy button - the
entire point of the row - reads as disabled**. `@media (hover: none)` rather than a width,
deliberately: a touch laptop has the same problem and a narrow desktop window does not.

**4. TAP TARGETS BETWEEN 21 AND 33 PIXELS.** Filter chips 25px, row actions 27px, the card's "Open
in SSE" chip 27px sitting **on top of a picture that is itself a link to the map**, sort links 22px,
footer links 22px (one of which is "Report a copyright problem"), banner links 25px. The download
button - the point of the entire site - was `inline-flex` sized to its text.

**TWO MISTAKES WORTH KEEPING, both caught by measuring the live page after shipping:**

- **Vertical padding on an INLINE link does not change what you can hit.** `header nav a
  { padding: 6px 0 }` shipped and the link stayed 21px. It needs a box: `inline-flex` with a
  `min-height`.
- **A media query adds NO specificity.** The mobile padding for `.seg button` was written near the
  top of the component's style block and the `5px 10px` it replaces is defined further down, so the
  later rule won and the buttons stayed 31px - after the change had shipped and been called done.
  **Every mobile override in a component now sits at the END of its style block**, with the reason
  written there.

**SCOPED BY THE OWNER once the first pass landed:** *"admin stuff will be done on PC anyway - just
as long as the user facing side works well."* So the admin pages are out. **But `/manage/[id]` and
`/account` are user-facing AND signed-in** - the manage page is where a creator tags a map, fixes a
credit and picks a cover - so they stayed in, and 0.41.4 did them: tag pills and the "+" 25px to
39px, the crop slider a 40px drag target rather than a 20px one, the credit block folding at 720
like everything else instead of 640.

**HOW A SIGNED-IN PAGE WAS VERIFIED WITHOUT A SIGN-IN**, because reasoning about CSS is exactly what
had already failed twice on this job: build, take the page's CSS chunk out of the client build, grep
its scope class, inline that CSS into a scratch page carrying the real markup and the same class,
serve it from `static/` through the dev server and measure at 375px. Pills 39, add 39, slider 40,
credit one column, fields 16px. **Then delete it from `static/` - anything left there deploys
publicly.** A `file://` page will not do: the browser pane renders anything outside the project as a
static snapshot with no script context.

**NOT CHANGED, deliberately:** the map page still puts the download above the cover picture on a
phone. That is design 2 and the owner's own ordering - the download is the point - and a share link
arriving from Discord has already shown the picture in the embed.

### D-66. Joining. Until 2026-09-07 nobody could

The owner: *"one query - how does a new user sign up?"* The honest answer was that they cannot.
There was no `signUp` call in the hub and nothing that ever inserted a `creators` row - an account
existed only if somebody made the Supabase auth user by hand AND inserted the row by hand, which is
why `/login` carries a message for the half-state where one exists without the other.

**The row is created at sign-up, not at first sign-in**, and that is the decision worth arguing
with. Creating it on first sign-in cannot RESERVE the handle: two people choose `nomad`, both are
told it is free, and the second discovers a week later that they are `nomad-2`. Supabase returns a
user id from `signUp` even when confirmation is pending, so the unique index holds the name from the
moment the button is pressed. An account that never confirms leaves a tidy-up row, not a fault.

**Handles are tidied and THEN judged**, as two pure functions in `src/lib/handles.ts`. The form shows
what you will be called before it tells you what is wrong with it, and tidying RESCUES what it can -
"The Star Keeper" and an accented name both work - rather than refusing them. The test caught `me`
and `you` sitting in the reserved list doing nothing (both two characters, already refused by the
length rule) and caught my own first draft asserting that a 40-character name should be refused when
truncating it is the entire point.

`signups_open` is a config row: closing the door is a thing an owner needs at two in the morning.

### D-67. An account is `pending` until its email is confirmed

The owner, an hour after D-66: *"a user gets a test mail - should they be in a different state until
they have confirmed - probably not able to comment/upload until their account is confirmed by the
e-mail."*

Yes - and **the shape of the answer was already in `auth.ts`**. `mayContribute` has always been
`state === 'active'`, and every upload, comment, star, report and Discord link asks it. So migration
0035 adding one enum value bought the whole feature with **no new guard anywhere**.

**Why not leave it to Supabase.** If "Confirm email" is on in the dashboard an unconfirmed person
cannot sign in at all and the question is moot - but that is a setting in a console no test here can
see, and if it is ever off, every new account can upload at once. A row saying `active` when nobody
confirmed anything is also simply untrue, and the hub reads that row to decide what a person may do.

**What DID need writing was the sentence.** All six guards said *"Sign in to share a map"*, which is
actively misleading to somebody who is signed in and waiting on an email - and it is the first thing
a new account would have hit. `whyNotContributing()` is one sentence in one place.

**A pending account may still sign in, deliberately**: their account page is where "send me another
link" lives, and locking them out would leave somebody whose confirmation went astray with nowhere
to go but a form that correctly refuses to say whether they exist. **`pending` is not `suspended`** -
a suspended account did something, a pending one has done nothing yet - so the explorers list can
tell them apart and reinstating somebody never means confirming their email for them.

### D-68. Forgotten passwords, and the PKCE trap nobody had hit yet

The owner: *"no reset password option on failure to log in - perhaps a reset option after 'That
email and password do not match an account.'"* The placement is right and the gap was worse than the
placement: **there was no reset flow at all**. `resetPasswordForEmail` existed in exactly one place,
the admin test-mail button, so the only person who could trigger a reset was the owner, on himself,
from a page nobody else can reach.

**Two pages, because a reset is two moments separated by an email** - and the second cannot be a
server action. The recovery token arrives in the URL **fragment**, which browsers never send to a
server. `/reset/new` is therefore the only page in the hub that talks to Supabase from the browser;
it hands the resulting session back to `POST /reset/new`, which **verifies the token** with the
service role before setting the ordinary cookie. Without that check the endpoint would be a way to
mint a session out of nothing. One page borrows the browser flow; the hub keeps its session model.

**THE TRAP, found by reasoning rather than by a failure, which is the only luck in this entry.**
supabase-js defaults to **PKCE**, which puts `?code=` on the emailed link and requires the matching
verifier to be in the storage of the client that ASKED. The hub asks from a Worker and throws that
client away, so the verifier is gone before the person opens their email, and the exchange fails
with a message about a missing code verifier that helps nobody. **`linkClient()` asks in `implicit`
mode**, which puts tokens in the fragment the browser can consume alone. This applied to D-66's
confirmation mail too, which had the same fault and had not been walked yet.

Not a weakening of PKCE: PKCE protects a code between two halves of the same client, and there are
no two halves here - the request is made on a server and completed in a browser that never met it,
which is the one shape PKCE cannot span.

### D-69. Takedown claims are catalogued and kept

The owner: *"takedowns should be catalogued and managed in the moderation stuff. eg: it is listed
there and will stay there until resolved one way or another"*, and when asked whether any of it
should be routed to Discord: *"It stays in the hub - a moderator page to see incoming requests and
whether the info was removed or the request ignored. Stored forever alongside who the takedown came
from - just so we can track these for good."*

The form only **mailed**. A copyright claim existed as a message in an inbox with no state, no owner
and no way to ask what happened to it.

**A new table, not a `reports` row**, and the reasons are structural rather than aesthetic:
`reports.reporter_id` is `not null references creators`, so a stranger with no account cannot be a
reporter; its check constraint demands a `system_id` or `sha256` a claim often has neither of; and a
report is a nudge from a member while a takedown is a legal claim from outside with a different
lifecycle and a different retention.

**`system_id` is `on delete SET NULL`, never cascade, and this is the one that must not be got
wrong.** Taking the map down is very often the OUTCOME - on a cascade, acting on a claim would
delete the record of the claim, so the hub would destroy its own evidence at the moment it most
needs it. The url and title are copied in as TEXT for the same reason: the row still reads after the
map is gone. `tests/takedowns.test.ts` pins both against the migration text.

**The row is written BEFORE anything is sent.** A claim now survives the mail failing, the queue
being full, or the admin address being unset - all of which used to refuse the whole form and send a
copyright holder away with nothing.

**Closing one requires a note.** "Actioned" on its own is the kind of record that looks complete and
answers nothing six months later. **Nothing is ever deleted**: resolving moves a claim out of the
open queue and no further, so a second claim about the same work a year later arrives with a history.

**Staff, not admin**, at the owner's word - it is the one place a moderator sees an outsider's name
and address, which widens D-39, but a claim cannot be answered by somebody who cannot see who made
it. **And a sentence that stopped being true was corrected**: the page said *"nothing is kept beyond
the message itself"*. A page about other people's rights is the last place to be vague about what
happens to what they type.

### D-71. A clip carries the custom rules its objects need, and there is a library of them

The owner asked, 2026-09-08, how the hub should handle a copied planet or construct that needs a
custom engine, fuel, gas, liquid or biosphere, and offered four options. He chose two of them
joined: *"1 and 2 should ride on the back... i.e. the site has a browse option for all these custom
overrides... and they can be copied and pasted in using the mechanism from 1. the rest is not
needed."*

**WHAT WAS WRONG WAS NOT A MISSING FEATURE BUT A QUIET WRONG ANSWER**, and it was found by reading
the engine rather than reasoning about it. Custom definitions do not live on the node; they live on
the starmap in `rulePackOverrides`, and the app builds an effective pack of shipped-plus-overrides.
A clip carries nodes only. And the lookup on the far side is:

```ts
liquidDef(name, pack) -> allLiquids(pack).find((l) => l.name === name)   // undefined
```

**The paste reported success.** The body arrived, the lookup missed, and its phase, appearance and
climate quietly fell back. Not a crash: a planet subtly wrong in a way the person pasting it cannot
see. That is what ruled out "just tell them" as the whole answer - somebody dragging a planet across
does not know what a pigment morphology is and should not have to.

**THE HUB CARRIES THEM WHOLE AND THE ENGINE NARROWS.** Working out which node field references which
definition is engine knowledge that changes whenever a field is added, and a hub that guessed would
quietly stop carrying a liquid the day somebody named one a new way. The same reasoning that
declined `rootKind` on the envelope (D-58): the app must check a claim against the nodes anyway, so
a second answer is the fault rather than the convenience.

**ONE ENVELOPE, TWO PRODUCERS.** A map clip carries the map's rules; `/rules` carries one rule with
`nodes: []` and no `root`. That absence is how a reader tells them apart - deliberately not a second
marker, because a second marker is a second thing to keep in step.

**THE MERGE RULE IS THE OWNER'S**, added while this was being built: *"the receiving end needs to
identify duplicates to what it had and discard (i.e. a related object pasted before)."* Three
outcomes - absent, add; identical, **discard silently**; same name but different, **never
overwrite**, rename and repoint. The middle one is the ordinary case, not the edge: paste a star,
then one of its planets, and every rule the second clip carries is one the first already brought.
The last one is the dangerous one: replacing somebody's "Liquid Unobtainium" with a different one
of the same name would silently change bodies they already had.

**AND "IDENTICAL" HAS A TRAP: KEY ORDER.** `{a,b}` and `{b,a}` are one definition and two strings,
and JSON key order is decided by whatever built the object. Comparing raw text would report an
ordinary duplicate as a conflict and rename something that needed no renaming. Both sides compare
canonical form - keys sorted recursively, **array order left alone**, because a pigment's `bands`
are a sequence while the fields of a band are a set. The hub publishes the rule rather than shipping
a hash for the engine to trust.

**ONE COLUMN, NOT AN INDEX TABLE** (0037). A library wants a row per customisation across every map,
which looks like a job for a `system_overrides` table - but that table would be derived from this
column, and a derived table is a second thing to keep in step on every upload, re-index and takedown.
Tens of maps; derive at read time; index it at thousands.

**A DELTA IS NOT A NEW THING.** `pigments` and `morphologies` are stored as `PackListDelta`, where an
entry may be a whole record or only the fields that differ from the shipped one. **The hub cannot
tell those apart without the base pack**, so it does not pretend to - a partial entry is labelled "a
change" rather than presented as something somebody invented.

**AND A TRAP RE-LEARNED THE HARD WAY, LIVE, FOR FOUR MINUTES.** The standing rule "a push deploys
before the owner runs the migration" is written down for WRITES, and `/rules` proved it is exactly
as true of READS: it named `rule_overrides` in a plain select and 500'd for everybody until 0037 was
run. **Worse, a `.not(col, is, null)` FILTER cannot be rescued at all** - `tolerantSelect` drops a
column from the projection and re-runs, but it cannot unpick a predicate. `tests/tolerantPages.test.ts`
now scans every route for both shapes, and contains no regular expressions on purpose: the first
draft's regex was mangled on the way into the file and threw instead of checking anything.

R-19 carries the engine's half. `tagVocab` is on `RulePack` but not on `RulePackOverrides`, so a
custom tag's definition cannot travel even though the tag on a node does - flagged, not fixed.

### D-72. A custom calendar is called out, not carried

The owner, immediately after D-71: *"Custom calendars are the only weird outlier. We just need to
tag a map as using a custom calendar. That does not work on the same mechanism so be called out."*

**THE TAGGING ALREADY EXISTED AND WAS LEFT ALONE.** `custom-calendars` is a rule-driven facet
(`facetRules.ts`) counting the keys of `temporal.temporal_registry` that are not in the engine's
shipped list, which arrives in R-13's manifest; it produces a filterable pill only when the count is
real. That machinery exists because **the hub hit this in August 2026 and the engine fixed the FILE
in response** - B112, after the hub's facet fired on every map ever made and the engine's own spec
concluded *"the fault is in the file, not the facet"*. A save now writes only the calendars the GM
made. Checking before building saved building it twice.

**WHY IT IS GENUINELY AN OUTLIER, and structurally rather than by oversight:** a calendar is not in
`rulePackOverrides` at all. It is in `temporal` - `{ masterTimeSec, displayTimeSec,
activeCalendarKey, temporal_registry }` - which is the campaign's CLOCK, not its rules.

**AND IT MUST NOT RIDE ALONG EVEN THOUGH IT COULD.** `epoch_offset_t` is a calendar's zero as a real
instant, so merging somebody else's into a running campaign would **re-date every event in it**.
Carrying the object and saying what did not come with it is the right answer here, not a lesser one.

**WHAT WAS ADDED IS THE NAME.** `countKeysAt` recorded a count and nothing else; `values` already
existed on `FacetResult` for the tag rules and costs nothing here. A count cannot be spoken: *"this
map keeps time on the Thousand Suns Reckoning"* is a sentence, *"1 custom calendar"* is a statistic.

**THE PLACEMENT IS THE CARE.** The note sits beside the COPY controls and deliberately nowhere near
the download button, and it says the full download **does** bring the calendar - because it does,
the calendar is in the save. Telling somebody their download was incomplete when it is not would be
a worse bug than the one being warned about.

### D-75. Moderators could not see the pictures they were created to review

The owner, 2026-09-10: *"Moderator review: moderators can't see images - admin could for review."*

`/private/asset/[hash]` is **the one route that serves an unreviewed asset** — the file's own header
says there must never be a second — and it asked for the admin role. So the role invented to judge
pictures could open the review queue and get a page of broken images.

The comparison predated the moderator role (D-39) and was never revisited when `isStaff` was written
for it. **A codebase does not re-read itself**: the same shape of miss put a bare `admin` check on
the explorers list badge two days earlier, and both were written before there was anything else for
them to be wrong about.

Every other hard-coded comparison turned out to be correct — config, backup, debug, stats, log and
the outbox drain are "running the place" and admin-only by D-39 — so the fix was one line and the
scan is what makes that a fact rather than a hope. `tests/staffAccess.test.ts` refuses the
comparison anywhere else.

**One awkwardness worth its comment:** `isStaff` is a type predicate, so a negated call narrows
`viewer` to `never` for the rest of the expression, and TypeScript follows that through an
intermediate boolean too. The viewer's id is read *before* the check rather than fought with.

### D-76. What the first bytes say, on the review card

The owner: *"We need more file details - name, apparent type, size, guess from first few bytes."*

The last one is the one that earns its place, and the reason is that **everything else on that card
is somebody's claim**. The filename came out of a zip a stranger built; the content type came off
that filename. Neither is evidence. The first bytes are.

**Not a hole being plugged.** The hub already refuses anything outside its allowed extensions and
never executes what it stores. This is a *signal*, shown to the person who has been asked to decide,
beside the other signals — a `.png` that is really a zip is worth a second look, not a refusal.

**On demand, per card, as a range read.** Computing it for the whole queue would be sixty R2 reads
before the page painted, in a Worker with 10ms of CPU, to answer a question about the one picture
somebody is looking at. And a range of 32 bytes rather than the object: pulling a 4 MB screenshot
down to look at eight bytes of it is D-53's mistake in a smaller key.

**THE MISMATCH LINE IS DELIBERATELY NARROW.** Only a positive identification that contradicts the
declared type. Unrecognised bytes say nothing at all, because the pattern list is short on purpose
and **a warning that cries wolf stops being read** — which would cost more than the warning is worth.

**My own tests found two real faults in it**, and both are the kind that only a test written to
disbelieve the code will find. Pointing one at the repo's own favicon rather than at bytes I typed
showed that most SVGs open with `<svg` and not `<?xml`, which the pattern list missed entirely. And
`mismatch()` treated "recognised but no mime" as "nothing to compare" — silently exempting the
executables, which are the single most alarming thing it exists to catch.

**Also on the card now: who.** The uploader is not on the asset — an asset is BYTES, and the same
bytes can arrive on four maps from four people, which is the whole reason the ledger keys on the
hash. So the person is reached through the maps that use it, with their role and account state,
because a picture from a suspended account is a different decision. One batched read, not one per
card.

**And the rest of the queue**, as captioned thumbnails. Clicking moves the cursor rather than
navigating: a queue you leave is a queue that does not get cleared. Being able to see that the next
eight are one person's screenshots rather than eight unrelated uploads changes how you read the one
in front of you.

### D-77. A copied system counts as a download

The owner: *"Count clicking on 'copy a System' as a download - and open in SSE (prob does already)."*

He was right about the second: `?open=` fetches `/api/download/<slug>`, so it always counted.

**Why the first should:** the engine refuses a single system through `?open=` (R-18), so the hub
offers Copy instead (D-56). **For those maps Copy IS the download**, and counting only the button
made the busiest systems look like the least read — purely because of a limitation in a different
program.

**What is not counted, and the line matters:** copying ONE ROW is not taking the map. That is
somebody borrowing a planet, and folding it in would turn a distribution count into a
fiddling-about count. The cards sort on this number, so it has to keep meaning one thing.

The counting was written out inline in the download route and became `server/takeaway.ts`, called
from both — a second copy is two places to remember when the shape of the event changes.

### D-78. Trust reverses the order of review; it does not remove it

The owner: *"I wanna be able to tag users as 'trusted' in which case their pictures are
'pre-approved' without a manual review and can be used right away. NB: they will still appear on my
review list (as pre-approved) and I still have the same control to withdraw them."*

**That second sentence is the whole design**, and it is the easy one to skip. A trusted creator's
pictures go out without waiting AND still appear in the queue, marked, with Withdraw on each. What
is removed is the WAIT — the thing that made a working session stop and start — not the review.

**It is only safe because an approval can be taken back.** The ledger keys on BYTES, so banning a
hash removes that picture from every map at once, retrospectively. The cost of being wrong is
minutes of exposure rather than a permanent hole — a very different trade from a system where
"approved" cannot be undone. Reordering trust and review is defensible here for that reason alone.

**`approved_on_trust` exists because three approvals otherwise look identical**: one a reviewer
made, one the hub made when it drew a cover (D-21), and one nobody made at all. Without the column
the queue would either lose the pictures it is promising to show or fill up with the hub's own
generated covers.

**A FLAGGED UPLOAD IS NEVER AUTO-APPROVED.** Trust says "this person does not upload rubbish"; the
flag says "this particular upload looks like the pattern we watch for". The narrower claim wins, or
trust becomes a way to launder exactly what the flag exists to catch.

**A column on `creators`, not a role.** A trusted explorer is not staff: they cannot see or judge
anybody else's content. Folding it into `creator_role` would have made it a rank and collided with
`moderator` on the first person who was both.

**A moderator's to give**, unlike the staff role, because D-39's line is whether a thing can be
undone — and this can be, completely.

### D-79. On hold: the state between published and taken down

The owner: *"We probably need to have a means to 'put a map on hold' - allow peeps to download it
with a warning that this file may have problems and to bring it to my attention if it does not
work."*

**Today a map with a suspected fault has two possible answers and both are wrong.** Leave it up and
say nothing, so people download something broken and blame the hub. Or take it down, so a map that
is probably fine disappears and its creator is punished for a suspicion.

**A FLAG, NOT A `state`.** `systems.state` is about PERMISSION — may this be seen. A hold is about
CONFIDENCE — does this work. Different questions, and a map can be any combination of them, so
folding hold into the enum would mean a taken-down map could not also be flagged as broken, and
restoring one would silently clear the other.

**The download stays open, which is the owner's entire point.** A file nobody can fetch is a file
nobody can diagnose, and the person best placed to say what is wrong with it is the person trying to
use it. The warning asks them to say so.

**And it travels in the file.** Most people who fetch a map never see its page — a direct link, the
API, the engine's own fetch — so a warning that exists only on a web page is a warning most of the
people who need it will not read.

**The controls are on the map page**, because a moderator who has to go somewhere else to act on
what they are looking at usually does not.

### D-80. A pending account, dealt with from both ends

The owner: *"Users on 'pending - email not confirmed' I need some additional controls. To make them
active (sends a mail) to send a new pending e-mail (need to offer the user that capability to send
again in case junked)."*

The user's own half already existed — the resend button on `/account` was built with the pending
state in D-67, for exactly the junked-mail case. This is the admin half, for when somebody writes in
because the mail is not arriving at all.

**Two acts, two buttons, and the difference is why they are not one:**

- **Resend** asks Supabase to send it again. Nothing changes; they still confirm.
- **Confirm** DECIDES that the address is good without them clicking anything.

The second is not a shortcut for the first. It says the hub is satisfied the person owns that
address on some other evidence, so it is written to the audit log — **if the address turns out to be
wrong, "who decided that" has to have an answer.** It updates Supabase's own record too, or the two
disagree and the next sign-in reads Supabase's answer rather than the hub's.

### D-81. Pushing a map into Debug, from the page you are already on

The owner: *"Be able to push from 'main site' into Debug if there is a problem with it."*

The same destination as a one-shot link, reached from the other side. A link is for a file the hub
does not have; this is for one it already stores and somebody has just found fault with — usually a
map on hold (D-79), where the next question is "what is actually wrong with it" and the file is
right there.

**The bytes are copied, not referenced.** The debug store's whole promise is that what a
diagnostician looks at is what arrived. Pointing at the live bundle would mean the evidence changed
the moment the creator uploaded a new version — which is precisely when somebody is most likely to
be looking at it.

**No invite row.** `invite_id` stays null: nothing was sent and no link was spent, so inventing an
invite to satisfy a foreign key would put a fiction into the record of how a file arrived.

**ADMIN, not staff** — the only control on that panel that is. A debug upload is an unredacted
campaign, GM notes and hidden systems intact, and `/admin/debug` is admin-only for that reason. A
moderator who could put a map there could not then read it.

### D-82. Trust from the explorers list, and the checkbox that lied

The owner, 2026-09-11, after running 0039: *"Have 'Trust User' as a checkbox on /admin/explorers."*

**A tick saves at once.** No Save button per row — a table of fifty rows each with its own button is
a table nobody uses. If the save fails the box goes back, because the database did not change and a
box left showing a change that did not happen is exactly the fault below. No note from the list: a
tick in a table has nowhere to put one, and the explorer's own page still takes one.

**One function, `accounts.setTrusted`, called from both pages.** The not-on-yourself rule and the
audit line were written inline in the explorer page's action; a second page copying them would have
made each one a thing two files had to remember. The rule is now checked inside the function too,
so a third caller cannot forget it.

**THE FAULT FOUND ON THE WAY, and it was mine from D-78.** The explorer page's load returned a
hand-picked set of fields and `trusted` was not among them, so its Trust checkbox **always opened
unticked**. The form was built to save the box's state — so pressing Save to add a note to a trusted
explorer would have quietly untrusted them. It went unnoticed because until 0039 ran nobody could be
trusted, so the box was always right by accident. **A form that shows a default instead of the truth
rewrites the truth the moment somebody submits it.** A test now pins that the load carries the flag.

**The migration hint went with it.** The action used to translate a missing-column error into "run
0039"; 0039 has run, and a message about a state the hub is no longer in is a message that will one
day mislead somebody.

### D-83. A saved map is named from its bytes, everywhere

The owner, 2026-09-11: *"a json file is relabelled to a zip on a copy to Debug and downloads as an
invalid zip file. it is just json. why has it been renamed?"*

**Because D-81 wrote `.sse.zip` by hand.** A map saved without pictures is a bare JSON document, and
the download route has always known that — `pack.ts` checked the magic number and named it `.json`.
The push to Debug did not ask; it assumed. The file in the store was intact; only its name was wrong,
and the name is what the browser and the unzipper believed.

**The likely source of the guess is worth writing down**: `r2.bundleKey` stores both kinds under
`bundles/<id>.sse.zip`. That key cannot be renamed without orphaning every stored map, so it now
carries a comment saying its extension describes nothing — and the contract file's own first rule
already said so: *"The extension is never evidence of anything; `isZip` is."*

**`savedFileName` in `bundle/contract.ts` is the one place that decides**, from the bytes, and both
the download and the push call it. A test refuses a hand-written `+ '.sse.zip'` or `+ '.json'`
anywhere else in `src`.

**An entry already pushed keeps its wrong name** — the row was written before this. Delete it and
push the map again, or rename the downloaded file to `.json`; the bytes are exactly right.

### D-84. A re-upload keeps the map's address

The owner, 2026-09-11: *"what happens if 2 starmaps of the same name happen?"*

**That part was already right.** The second gets `/s/my-starmap-2`, the next `-3`, and past twenty a
slug ending in eight characters of the map's id. The column is `unique` in 0001, so two maps can
never share an address whatever the code does. Identical titles are allowed and are told apart on
the cards by who made them.

**Answering it turned up what was not.** D-25 recorded that *"slugs never change"*, and three things
lean on that: every link already shared (a Discord post, a bookmark, the QR code printed on a
designed cover), the `origin/hub` url the engine stamps into OTHER people's files when they paste
from a map, and "Used in", which finds those maps by slug. But `uniqueSlug` ran on every upload,
**updates included**, from whatever the title now said. Rename a map in the app, upload it again, and
it moved — breaking all three — while its old address became free for the next stranger's map with
that name, which is where the old links, the QR code and the credits would then have led.

Renaming on the hub's manage page never did this; it edits the title only. The re-upload was the one
path, and its own comment said *"the stable URL is the `systems` row which is not touched"* two lines
above the line that touched it.

**The fix is the rule D-25 already stated:** an existing map keeps the slug it has. A creator who
uploads under the app's default name and renames later keeps the default-looking address — the
price of links that do not rot. A scan of the nine public maps on 2026-09-11 found one whose address
differs from its title: `local-neighbourhood`, titled "Local Neighbourhood (Default)". Its title was
most likely edited on the manage page; either way, before this fix its next re-upload would have
moved it to `local-neighbourhood-default`.

**Not fixed, because it is rare and harmless:** two maps with the same title uploaded in the same
instant can both find `my-starmap` free, and the second then fails on the unique column. Uploading
again works.

### D-85. A multi-star system's cover has a real star in the middle

The owner, 2026-09-11: *"do we need a slight tweak to the system view default cover image need a
tweak to cope with multistar systems?"*

**Yes, and it was more than a tweak.** Fourteen of the Local Neighbourhood's systems have more than
one star, and drawing them showed what the diagram did with every one. The engine roots a multiple
system at a BARYCENTRE — a point in space, `kind: 'barycenter'`, no roleHint — and the diagram took
the root as "the star". So:

- **a sun was drawn in the middle that is not there** — the barycentre, in the palette's default
  colour;
- **the real stars were small dots on rings, or missing entirely** when they sat one barycentre
  deeper — Alpha Centauri lost both A and B;
- **a barycentre on a ring became a construct's orange square**, having no roleHint to draw it by.
  That one reached single-star systems too: Sol's card had a "space station" where Pluto and Charon
  are.

**The rule now:** walk down from the root, at each barycentre taking the heaviest stellar member,
until a star is reached. That star is the middle. Every other stellar member met on the way is a
companion and gets a ring; anything orbiting a barycentre directly (a circumbinary planet) gets a
ring too. Heaviest by real mass when every contender has one, by the class's chart size cubed
otherwise — so one G star still outweighs a pair of red dwarfs.

**Why that picture and not a pair side by side in the middle:** it is how the system is arranged — the
lighter star goes round the heavier — and it needs no second rule. With the rings ordered by real
distance, S-type planets land inside the companion's orbit and circumbinary ones outside it on their
own. Alpha Centauri draws A in the middle, B on the inner ring, Proxima on the outer ring wearing her
own two planets; Sirius draws the blue-white A with the white dwarf beside it; a barycentre on a ring
draws as its members side by side.

**Companions always keep their ring** when the eight-ring limit cuts, because a binary drawn without
its second star is the fault being fixed.

**The starmap card had the same blind spot, smaller.** It read a barycentre's direct children only,
so Alpha Centauri was charted in Proxima's red. It now looks through nested barycentres for the
heaviest star.

**Covers already drawn stay as they are until redrawn.** Re-indexing redraws a generated cover, so
pressing Re-index on the config page until it reaches today refreshes every one; a creator's chosen
screenshot is never touched. `tests/cover.multistar.probe.test.ts` draws the real systems into
`tests/out/` for a person to look at.

### D-86. Two copies of one system on one map: renamed on the way in, and a failed write is a failure

Reported from the engine side, 2026-09-11 (a note left in `docs/`): a public starmap showed its 19
constructs and **no bodies at all**, while its counts listed 153. The owner chose the fix: *"Rename
the second copy automatically is indeed the solution SSE just utilised."*

**What happened.** The map carried both of the engine's bundled Sol examples, and those share every
node id on purpose. The hub keeps all of a map's objects in one table, unique on `(map, node id)`, so
the second Sol's rows clashed, the ONE insert carrying every body failed with them, and
`writeNodeRows` threw the returned error away. The upload reported success.

**Two faults, and both are fixed, because either alone would have done it:**

1. **The ids.** `normalise` now gives every object an id of its own across the whole map. The first
   copy keeps its ids; a later clash takes `-2`, `-3`... — the engine's own spelling for a duplicate
   system (A107). It happens in `normalise` because upload, re-index and the cover all read through
   it, so none of them can disagree.
2. **The silence.** A failed node write now throws on upload and is reported by re-index, instead of
   stamping the map as freshly read. `tolerantWriteMany` exists to forgive a column the database does
   not have yet; it was never meant to forgive a row the database refused.

**THIS IS A SHAPE TO STORE, NOT A MISTAKE THAT WILL STOP ARRIVING.** The engine's fix re-ids the
duplicate SYSTEM and leaves the objects inside it alone, because node ids only need to be unique
within a system for the engine. Every file with two copies of one system will carry this, fixed or
not.

**EVERY REFERENCE MOVES WITH THE ID, not only `parentId`.** The stored snippet is what Copy hands the
engine, and the engine re-mints ids on paste by rewriting every exact-match string anywhere in the
node (`remapRefsDeep`, io/hubClip.ts) — orbits, docking targets, autopilot legs. If the hub renamed
the row but not the snippet, a clip's `root` would name an id no node carries and the engine would
refuse it; if it renamed `parentId` alone, a station copied from the second Sol would paste docked to
the first. So the same deep walk runs here, scoped to the one system whose references mean its own
objects. Values only, never keys, and names are left alone. The document itself is not touched: the
same object goes on to be credited and packed, and the rename is the hub's storage concern, not
something to put into a file somebody takes away.

**What it cannot do**, and the engine's note says the same about routes: nothing in the file says
which copy a reference from OUTSIDE a system meant. And the suffix follows file order, so a creator
who reorders their systems and re-uploads can swap which copy is `-2` — which only changes a deep
link into the second copy, and only on the hub.

**Verified against the real file** locally (not committed): 180 objects, every id unique, no object
whose parent is missing. The tests were run against the old code first and seven of nine failed.

**The damaged map heals on re-index**, which reads the stored file again. Nobody has to upload
anything. (That sentence first said "Config, Re-index, pressed until the oldest reading is today" -
which is the advice D-87 found to be wrong.)

### D-87. Re-indexing is one map per request, and "behind" means read by an older build

The owner, 2026-09-11, after D-86 shipped: *"I hit 'Re-index the oldest maps' and nothing appeared
to happen - does it make sense that the mod/admin controls on each map let you run it for just that
1 map to fix."*

**It did make sense, and the batch was broken in two ways.**

**1. It asked one request to do eight maps, and a free Worker has the CPU for one.** The public
list afterwards showed exactly two maps re-read, two seconds apart, and none of the next in line.
Measured locally, one map costs 20-45ms of CPU, nearly all of it drawing the cover; eight is
200-350ms against 10ms - the wall D-53 hit decoding one screenshot. D-73 had written "a few at a
time" and chosen eight. The size that fits is one.

**2. It judged "behind" against today.** It reported the oldest reading and said "nothing is
behind" once that was today's date. On the day a reader changes, that is wrong about every map
uploaded that morning - including the one D-86 was fixing, which would never have been reached.

**So:**

- **`/api/reindex` does ONE map per POST** and says what it found — bodies and constructs, not
  "done", because a re-read that stores nothing looks exactly like one that did nothing. Staff may
  call it: it rebuilds what the hub derives from a file it already holds, changes nothing anybody
  made, and is harmless twice. Each call is audited as `system.reindex`.
- **The map page's Moderator panel has "Re-index this map"**, running in place and refreshing the
  page's own data so the tree shows the result.
- **The Config page walks the list from the browser**, one request per map, naming the map it is on
  and every map that failed. Leaving the page stops it; pressing again carries on from whatever is
  still behind. The page says how many maps are behind before anybody presses anything.
- **"Behind" is `reindexed_at` earlier than `__HUB_BUILT_AT__`**, the time the running code was built
  (a Vite `define`). Every deploy counts, including ones that did not touch the reader: re-reading a
  map that did not need it costs a moment, and calling a stale map current cost a map its bodies.

**The same "nothing happened" was hiding in the Moderator panel's forms.** The panel is at the bottom
of a long page and a form post reloads at the top, so Hold, Take off hold and Push to Debug all put
their confirmation out of sight. They are enhanced now and answer where they were pressed.

**A test pins who may call `reindexSystem`**: the one-map API, the creator's manage page, and the map
page's background re-read of a stale page. A new caller has to be added to that list on purpose.

### D-88. A map with problems: found in the file, explained to its creator, flagged to staff

The owner, 2026-09-11, after D-86: *"Worth having a 'problematic' map status that triggers when it
spots something like this - with advice on the issue to help them resolve it themselves."* Then,
as it was being built: *"tags the map with a pill and help"*, *"advises not to publish until fixed.
And if published mods/admin get a note that a 'dodgy' map has been uploaded"*, and *"A new issues
tab near reports/takedowns/comments"*.

**Found in the file, not judged.** `bundle/problems.ts` reads the document on every upload and
re-index. Each finding says what was found, naming the systems and objects, and **how to fix it in
Star System Explorer, in steps** - a flag that says "invalid" is one the creator can only forward.

**Only what can be stood behind.** The structural checks mirror the engine's own `validateStarmap`
field for field, so "will not open" is a fact about the app: a missing `id`, `name`, `distanceUnit`,
`systems` or `routes`; a system entry with no id, no position, no inner system or no nodes list; two
systems sharing an id (refused before 3.1.66, repaired on open since - A107). The rest are faults
visible in the file itself: one id used twice inside a system, an object whose parent is not there,
a loop of parents. **Deliberately not a problem:** the same object ids in two different systems - the
engine allows that and the hub stores it (D-86). A strange map is not a broken one, and a warning
that fires on good files is a warning nobody reads. Six real saves the app wrote came out clean.

**The first run found something**, and it was right: the hub's own starmap contract fixture has a
system entry with no `id` and no `position`. It was built to exercise the bundle layout, not to be
opened, and the engine would refuse it. A test now says so.

**A column of findings, not a state** (0040). `state` is permission and `hold_note` is a moderator's
judgement; this is what the hub READ, rewritten from the bytes every time, so it clears itself when a
fixed version is uploaded and nobody has to remember to take a flag down.

**What the owner asked for, and where it went:**

- **The pill.** `needs-a-fix` is an auto tag, first in the list so a card's four-pill limit can never
  cut it, and on the map page it links to the help rather than to other broken maps. Public, on
  purpose: a downloader deserves to know a map may not open before they fetch it.
- **The help.** On the upload result, the creator's manage page and the map page, each problem with
  its fix. The creator also gets a link to upload the fixed version.
- **Advised, not refused.** Publishing a map with problems asks once - a "publish anyway" box beside
  the button, re-asked by the server if skipped. The credit gate is a rule the hub keeps for other
  people's work; this is the creator's own file, and they may know something the hub does not.
- **The note to staff.** When a map with problems is published, or a public map is found to have
  new ones on re-index, every admin address and every active moderator gets a mail naming the map,
  the creator, each problem and the Issues tab. Once per map per distinct set of findings, through
  the outbox's dedupe key.
- **The Issues tab**, in Moderation beside Reports and Takedowns. Public maps with problems; drafts
  are counted, not listed, because their creators have already been advised. **"Noted"** takes a map
  out of the count without pretending it is fixed - a creator may never come back, and a badge that
  cannot reach zero stops being read. Noting is cleared when the findings change.

**Until 0040 is run** the checks still happen on upload and the pill still appears, but nothing is
stored for the page, the manage page or the Issues tab, which says so.

**One thing the advice depends on:** the fix for two systems sharing an id is "open it in Star
System Explorer 3.1.66 or later". Until production reaches that version, it means the beta.

### D-89. Maps that need a fix come last, and say so beside their title

The owner, 2026-09-11, after the first real one reached the Issues tab: *"Problem maps should be
deprioritised on searches/browsing"*, and *"perhaps carry the problem pill to its summary"*.

**Last, not hidden.** A map that half-works may still be what somebody is looking for, and it wears
its pill wherever it appears. But a browser should meet every map that opens before any map that
might not.

**In the query, because every list is cut short there** - twenty-four on the front page, sixty on
/browse, a page of ten for the app. Reordering rows after they arrive would only reshuffle a page, and
a healthy map just past the cut would lose its place to a broken one inside it. `orderCards` in
`server/cards.ts` orders on `problems` ascending with nulls first, so every healthy map comes ahead;
among the maps with problems Postgres orders the lists themselves (a shorter list first), then the
chosen sort. It is ONE definition now: the front page, /browse and `/api/maps` each had their own copy
of the sort clauses.

**It orders on a column only because 0040 has run.** An order clause cannot be tolerated the way a
missing projected column can (D-71), which is why the function lives in the library beside that note
rather than in a route, where the tolerant-pages scan would rightly refuse it.

**Browse no longer suggests `needs-a-fix` as a way to narrow a crowd** - offering it beside "oceans"
and "life" would have put broken maps one click from the top of the page this is pushing them down.

**The pill sits under the title** on the map page, where somebody deciding whether to download is
reading, with a line saying which kind of trouble it is and a link to the fix - the same place the
fan-work pill goes, for the same reason.

### D-90. The app's map list finds a person's tags, and names who made each map

The engine stream's seam report on R-20, relayed by the owner on 2026-09-11: *"tag= filters
auto_tags, not tags, so a hand-added `default` is invisible to it today. The list sends no creator,
so the card shows none."* It had built the in-app list against 0.59.2 and verified it in a browser.

**`tag=` matched the derived pills only.** `/api/maps` filtered `auto_tags` while `/browse` - which the
route's own header says it mirrors - matches `auto_tags` OR the creator's `tags`. So a tag a person
put on a map could never be found through the API. It now uses the same clause as /browse.

**Which made validation load-bearing.** The old filter passed the tags as an array parameter; the
new one writes them into a PostgREST `or` string, where a comma or a bracket is syntax. A tag must now
be lowercase letters, digits and hyphens, or it is dropped - the rule /browse already applied.

**`creator: { name, url }`** on each map: the display name the map's own page shows, or the handle,
read in one query for the page. `url` is null because the hub has no public profile page yet; the
field is shaped for the day it does. The raw `creator_id` is removed from the object rather than left
beside it - it is the database's, not the contract's.

**What is NOT decided: who may put `default` on a map.** Whatever carries it is the first thing a new
GM sees in the app. A tag in the ordinary vocabulary would let any cartographer put their own map on
that screen - the "app content versus somebody's content" line the hub drew in its R-20 note. The
filter will find `default` the moment a map has it; who can give it is the owner's call.

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
