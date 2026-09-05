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
R2; the backup names which ones matter. A Worker has no clock, so the schedule is the owner's to
point at `POST /api/admin/backup`.

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
