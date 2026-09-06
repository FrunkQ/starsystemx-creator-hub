# Requirements for the Star System Explorer engine

**Written by the Creator Hub, for an agent working in the SSE repo. The hub does not edit that repo.**

**SEAM PROTOCOL (2026-09-06, D-37). This file is the HUB's half of the contract with the engine:**
the R-numbers as the hub wrote them and, under each, a **HUB-SIDE STATUS** saying what the hub has
SET, CONSUMED and VERIFIED. The engine's half - the requirements banked verbatim, the coordinator's
triage, and an `SSE-SIDE STATUS` under each R-number it ships - is
`C:\Development\star-system-explorer-v2\<worktree>\docs\dev\hub-requirements-for-sse.md`. **Each
side writes only its own half, reads the other's directly, and quotes it; a status that has been
retold is not a status.** Every shipped R-number arrives as a fixed SEAM REPORT block and is pasted
here unchanged. A change to the contract from this side goes back in the same shape with side `hub`,
for the coordinator to paste into the engine's G57 row. The protocol and the Stream N checks live in
the engine repo's `docs/dev/session-briefs-2026-08-28.md` under SEAM PROTOCOL.

**The prod rule, stated once:** the engine's production is a read-tree release of beta on the
owner's explicit word. Nothing here points the hub at `https://starsystemx.com` for a feature until
he has said the release is made.

Ordered by what unblocks what. R-01 and R-02 are the only ones the hub is currently *blocked* on;
everything else makes the funnel work properly from inside the app.

Each item states what to build and — more usefully — the trap the hub hit that makes it necessary.

---

## R-01. Stamp a `bundleFormat` integer in the document — BLOCKING

**What:** a single integer at the top level of `starmap.json` / `system.json`, written on every save.
Start at `1`. Bump **only** on a breaking layout change, never per release.

**Why.** There is currently no format version anywhere in the bundle. `appVersion` is a *build stamp*,
not a contract: v3.0.1 and v3.9.0 may have identical or incompatible layouts and nothing says which.
That was survivable while one codebase both wrote and read the format. **It is a time bomb the moment
a second codebase reads it** — which is now.

**Do not conflate it with `appVersion`.** They answer different questions and the hub stores both:

| | question | on change |
|---|---|---|
| `bundleFormat` | *can this parser read this layout at all?* | a number we do not know is **refused** |
| `appVersion` | *what could the app do when this was made?* | never a gate; a newer SSE loads an older map |

**Owner's decision, already taken:** stamp from here on out. Saves made before the stamp are accepted
by the hub as **legacy** and base-stamped as format 1 — so this does not need backfilling.

---

## R-02. Ship a canonical fixture bundle — BLOCKING

**What:** a real save, checked into the SSE repo at a stable path, that the hub's parser tests
against. Regenerate it and bump `bundleFormat` whenever the layout changes.

It should exercise the whole layout, and specifically:

- `starmap.json` **and** a `system.json` sibling — the hub handles both kinds
- `assets/models/<sha256>.glb`, with **one model shared by two nodes** (the "credited once" path)
- `assets/images/<nodeId>.<ext>` and `assets/images/player/<assetId>.<ext>`
- **one asset with full provenance and one with none**, so the public-sharing gate is exercised in
  both directions
- `ATTRIBUTIONS.md` and `README.txt`

**Why.** The hub's reader was written by reading SSE's source. That is evidence, not proof. Until a
real bundle has been through it, `KNOWN_BUNDLE_FORMATS` stays empty and **every upload is refused** —
which is the correct behaviour for a parser that has never seen the thing it claims to parse, and is
the single reason the hub is not open today.

**This is the contract test between the two repos and it costs one file.**

---

## R-03. Verify that a model's path hash matches its bytes on export

**What:** when writing `assets/models/<sha256>.glb`, assert the filename hash equals the hash of the
bytes being written. Fail the export loudly if not.

**Why.** The hub found this from the other side and it is worth closing at source. A bundle can name
a file after **any** hash. If a consumer keys anything on the path-supplied hash, a crafted bundle
naming a file after an already-approved asset inherits that approval while carrying different bytes.

The hub defends itself — it hashes the bytes and treats the path as a claim — but an engine-side
assertion turns a *silent* corruption into a caught bug, and costs one comparison on a code path that
already computed the hash.

---

## R-04. Upload, update and download from inside SSE

**What the owner asked for.** Three things, and they need hub API surface that is mostly already
built:

| in-app action | hub endpoint | notes |
|---|---|---|
| **Download / open** a hub map | `GET /api/download/<slug>` | no account, returns the bundle. Already live. |
| **Upload** a new map | `POST /api/upload` (multipart) | needs a signed-in session — see R-06 |
| **Update** an existing map | same, with `replaces=<systemId>` | **an update costs almost nothing** against the daily allowance: only *novel* asset hashes count |
| **Browse** | `GET /` and the system pages | SSR HTML today; a JSON index can be added when the app wants one — ask |

**Two things the app must send and it will be refused without them:**

1. **`attest=on`** — the provenance attestation. The exact wording the hub shows lives in
   `src/lib/attestation.ts`; the app must show the same text and send the confirmation. **Do not
   pre-tick it.** The whole point is that a person actually read it and took responsibility.
2. **`publishGmTree`** — absent means publish the **player** tree. `computePlayerSnapshot` already
   does the redaction; this flag only records which of the two the creator chose. **Never default it
   on.**

**And what the app should show back:** the upload response reports `mayPublish` and
`missingProvenance`. A map with uncredited assets uploads fine but **cannot be published** until the
creator fills the credits in — so the app should say so at that moment, in the editor, where the
fields actually are. That is a much better place to fix it than a web form.

---

## R-05. One-click open a hub map on startup

**What:** SSE accepts a hub map on launch and opens it, so a link on the hub is one click into the
app rather than a download-then-import.

Two mechanisms, and the web one is the important one:

- **Web:** `https://starsystemx.com/?hub=<slug>` — fetch `GET /api/download/<slug>`, open it. This is
  the funnel: a Discord link becomes a running system in one click.
- **Desktop/installed:** a `starsystemx://open?hub=<slug>` protocol handler, if and when there is an
  installed build. Not needed for launch.

**Two cautions.**

1. **Treat a hub map as untrusted input on the way in**, exactly as an imported file already is. The
   slug comes from a URL a stranger can craft.
2. **Do not auto-import into the current campaign.** Open it as its own thing, or ask. A link that
   silently merges a stranger's systems into somebody's live campaign is a bad afternoon.

---

## R-06. How the app signs in — a decision needed, not just a build

The hub uses Supabase auth. For the app to upload it needs a session, and there are two shapes:

- **(a) Device-code / paired link.** App shows a code, user approves it on the hub in a browser, app
  gets a token. No embedded browser, no password ever touches the app. This is the recommended one.
- **(b) OAuth redirect in a system browser** with a loopback or custom-scheme callback. More moving
  parts, better if there is ever an installed build.

**The hub has neither yet.** This needs a decision before R-04 can be finished, and it is the one
place these requirements need an answer rather than an implementation. Ask the owner.

**Whatever the shape: the app must never handle a password, and the token must be revocable from the
hub's account page.**

---

## R-07. Small, cheap, and useful

1. **A designated cover image.** Nothing in the bundle marks one, so the hub guesses: map background,
   then any player graphic, then the first body picture. A `coverAssetId` field would make it the
   creator's choice. Now less urgent — creators can upload screenshots on the hub and pick one — but
   still the tidier answer.
2. **A screenshot action in-app.** Creators are being asked to add screenshots to sell their maps; a
   "capture for the hub" button that produces a correctly-sized image would raise the quality of
   every hub page. This is probably the highest-value item on this list after R-01/R-02.
3. **Show `created_with` on load** when a map was made by an older build — a quiet marker, not a
   warning. It is a capability marker, so **never refuse to load on it**.


---

## R-08. The Cloudflare deploy of SSE failed — and NOT for the reason it looks like

**Observed, 2026-08-28**, deploying `star-system-generator@3.0.164` to Cloudflare Pages:

```
> star-system-generator@3.0.164 build
> wrangler types --check && node scripts/generate-examples-list.cjs && vite build

X [ERROR] Types file not found at worker-configuration.d.ts.
```

**The repository's build script is not that.** It is, in every worktree checked:

```
"build": "node scripts/generate-examples-list.cjs && vite build"
```

`wrangler types --check` **is not in the repo.** It was injected at deploy time by Cloudflare's own
auto-configuration — the stack trace shows `maybeRunAutoConfig` -> `runAutoConfig` -> `runCommand`.
Wrangler saw a SvelteKit project with **no `wrangler.toml` / `wrangler.jsonc` at all**, decided it
should have Workers types, prepended a check for `worker-configuration.d.ts`, and then failed
because nothing has ever generated that file.

> **So the SSE repo is not broken and its build script should not be "fixed" in response to this.**
> Editing it to satisfy an injected check would be patching a symptom that only exists because the
> project has no wrangler config for auto-config to read.

**The real fix is the adapter swap and a real `wrangler.toml`** — which is the migration, and the
migration is sequenced (below). If a green Cloudflare build is wanted *before* that, the options are:

1. **Commit a `worker-configuration.d.ts`** (run `wrangler types` once). This is the intended
   workflow and it makes `--check` meaningful; it must be regenerated when bindings change.
2. **Add a minimal `wrangler.toml`** so auto-config has something to read and stops guessing.
3. **Do not point Cloudflare at SSE yet** — see the ordering warning.

### THE ORDERING WARNING, and this is the important part

Deploying SSE to Cloudflare Pages **is the migration starting**, and `creator-hub-design.md` §5.2 is
explicit that its steps are sequenced for a reason:

1. push the `sw.js` cache-constant bump **to prod on Vercel first**, and let it propagate for days;
2. *then* swap the adapter and deploy to Pages in parallel on `*.pages.dev`;
3. verify with a hard reload and `?no-sw=1`;
4. cut DNS;
5. leave Vercel up for a week.

The cutover is **same-origin**, so every returning visitor's service worker survives the change of
host and will serve a Vercel-era precached shell that requests asset hashes Cloudflare does not
have. Step 2 before step 1 is exactly the shape of that failure.

**This is owner-and-coordinator work, not an agent job.** Recorded here so whoever picks it up knows
the failed build was auto-config, not a repo defect, and knows which step of a sequenced plan it
belongs to.

---

## R-09. Analytics must follow the deployment path — because for a while there are two

**Today:** `src/routes/+layout.svelte` calls `injectAnalytics` from `@vercel/analytics/sveltekit`,
and `@vercel/analytics` is a dependency.

**The problem is specific to the migration window.** §5.2 step 2 deploys to Cloudflare Pages **in
parallel** while Vercel is still serving production, and step 5 leaves Vercel up for at least a week
after DNS is cut. So for that whole period the same code runs on **both hosts**, and:

- Vercel Analytics on Cloudflare collects nothing and loads a script for no reason;
- Cloudflare Web Analytics on Vercel does the same in reverse;
- shipping both unconditionally double-counts every session on whichever host has both.

**Recommended shape — an explicit build-time switch, not host sniffing:**

```
PUBLIC_ANALYTICS = vercel | cloudflare | none
```

Each host builds separately, so a build-time constant is enough, and an explicit variable beats
detecting `VERCEL=1` / `CF_PAGES=1` because during a migration the thing you most want is to be able
to say *"this deployment reports here"* and have it be true — including being able to set `none` on
a pages.dev verification build so test traffic does not pollute either dataset.

Then in the layout: call `injectAnalytics()` only for `vercel`, and render the Cloudflare beacon
`<script>` only for `cloudflare`. Neither for `none`.

**Cloudflare's side needs no package.** Web Analytics is either a dashboard toggle on the Pages
project (Cloudflare injects the beacon itself — simplest) or a single deferred `<script>` with a
token. The hub does the token version in `src/routes/+layout.server.ts` and
`src/routes/+layout.svelte`, which is ~15 lines and can be copied verbatim.

**Do not remove `@vercel/analytics` until Vercel is actually switched off** (§5.2 step 5 keeps it
running for a week after DNS). Removing it early makes a rollback to Vercel a code change rather
than a DNS change, and the whole point of leaving Vercel up is that rollback stays cheap.

---

## R-10. Stamp the export mode — for the LABEL, not for the gate

**What:** an `exportMode: 'player' | 'gm'` field written at export, recording which the GM chose in
the Save modal.

**Why it is only nice-to-have.** The hub no longer asks the uploader which kind of save they are
uploading — it reads the file (`src/lib/bundle/gmContent.ts`), because the choice was already made
at export and asking someone to restate a fact is asking them to get it wrong. The wrong answer
there leaks a campaign.

**But the inference is asymmetric, and a stamp is what would close the gap:**

| the file | the hub can tell |
|---|---|
| contains GM notes / hidden objects / secret tags | **certainly a GM tree** — every one of those is removed by `computePlayerSnapshot` |
| contains none of them | a player export, **or** a GM export of a campaign with no secrets — genuinely indistinguishable |

That ambiguity is **safe** — a GM tree with nothing hidden in it has nothing to leak — so nothing is
blocked on this. What it costs is precision in the *labelling*: the hub cannot honestly print "this
is the player version" on a page, only "no GM-only content found".

> **CRITICAL, if this is built: the stamp must never become the gate.** It arrives inside a file a
> stranger uploaded, so it is a claim, exactly like `ATTRIBUTIONS.md` (`contract-with-sse.md` C-02).
> Detection stays the control; the stamp only makes the label certain. A stamp saying `player` on a
> file full of GM notes must lose to the detector, loudly.

---

## R-11. Put custom definitions in the save, under a predictable key

**The owner's framing, and it is the right one:** *"If players add their own custom gases, engines,
fuels, constructs, etc, then those are added to the starmap file - so if they are in, we know things
like Custom Gases: 3, Habitable Biospheres: 2, Custom Liquids: 4."*

That removes the need for a separate artefact library on the hub entirely. **The hub does not need a
"fuels" section; it needs the map to carry its own custom fuels**, and it will count them.

### What already works

Two containers already ride in a save and the hub already counts them:

| container | in the save as | shipped baseline |
|---|---|---|
| calendars | `temporal.temporal_registry` (keyed object) | the four in `static/temporal/calendars.json` |
| tag categories | `coiCategories` (array) | the nine SSE ships |
| points of interest | `poiPacks` (array) | none |

### What is missing

Custom **gases, liquids, fuels, engines, reactions** and **atmosphere mixes** have no container in
the save format. The hub already ships disabled rules naming the keys it will look for -
`customGases`, `customLiquids`, `customFuels`, `customEngines`, `customReactions` - as a **proposal**,
not a spec. Any consistent naming works; the hub adapts with a config edit, not a deploy.

**Two things that make the counting honest, and both are cheap:**

1. **Mark what is custom, or keep the shipped set stable and listed.** The hub subtracts a baseline
   of app-shipped names. A `custom: true` flag on each entry would be better still - it removes the
   baseline maintenance entirely.
2. **Do not write the whole shipped library into every save.** If a save carries all 24 shipped
   liquids plus one custom one, the hub must subtract 24 names it has to keep in step with. Writing
   only what the GM actually added or changed is clearer and self-describing.

### THIS IS A CORRECTNESS PROBLEM, NOT A SIZE ONE — and that is the stronger argument

Measured on the real 327 KB Local Neighbourhood starmap, because the size case is the one people
reach for first and it does not hold:

| | share of file |
|---|---|
| `systems` (the actual campaign) | 51% |
| **whitespace / pretty-printing** | **45%** |
| `coiCategories` (shipped defaults) | 2.6% |
| `temporal` (shipped calendars) | 1.0% |
| null / empty node fields | ~10% of node fields |

**So the shipped-defaults block is under 4% of the file.** Removing it saves almost nothing, and
**the 45% is whitespace that a `.sse.zip` compresses away to near-nothing anyway** — and which buys
the hand-editable, diffable working file that `io/bundle.ts` deliberately set out to produce. **Do
not chase it.** That trade was made on purpose and it was made correctly.

**The reason to fix this is that the file currently misdescribes itself.** A save carrying the
shipped calendar registry is claiming to define four calendars the GM never defined. Nothing reading
that file can tell the difference between "this campaign uses a custom reckoning" and "this campaign
was saved by SSE" — which is precisely why the hub's facet lied on every map until the baseline was
corrected.

A save should describe what the GM made. Everything else is the app's, and belongs in the app.

> **The trap, stated plainly because the hub already fell into it:** the first version of the
> calendar rule listed one shipped calendar instead of four, and reported *"3 custom calendars"* for
> every real starmap. A facet that is universally true is worse than no facet - it teaches people
> the pills cannot be trusted, which devalues every other pill beside it.

### Not needed

**No export/import of individual definitions.** A custom fuel travels inside the map that uses it,
which is also the only context where it means anything.

---

## R-12. A monotonic revision counter — this one prevents real data loss

**What:** an integer on the document that increments on every explicit save. `revision: 47`.

**The scenario, and it will happen:**

1. A creator uploads their campaign. The hub stores it.
2. Weeks later they find an older export in their Downloads folder and upload it as an update.
3. **The hub accepts it, replaces every row, and overwrites the stored bundle.** The newer version
   is gone — from the hub, and from anybody who would have downloaded it.

The hub cannot currently prevent this, because **there is nothing in a save that says which of two
exports is newer.** Verified across two real exports of the same map nine months apart:

| | fresh export | bundled example |
|---|---|---|
| `id` | `starmap-local-neighbourhood` | `starmap-local-neighbourhood` — **stable** |
| system ids | — | **42/42 shared** |
| `appVersion` | 3.0.190 | 2.1.692-beta |
| **revision / serial / updatedAt** | **none** | **none** |

`appVersion` is not a substitute: two saves from the same build are indistinguishable, and a creator
who has not updated SSE produces identical stamps forever.

**A file timestamp is not a substitute either.** It is a client clock, it survives copying badly, and
it is trivially wrong.

With a revision the hub can simply say: *"the copy you uploaded is older than the one already
published — did you mean to roll back?"* — and let the creator decide, instead of silently
destroying work.

> **Bonus, free with the same field:** `doc.id` being stable already means the app could offer
> *"this came from the hub — update your published version?"* without the creator hunting for their
> own entry. The revision is what makes doing that automatically **safe**.

---

## R-13. A machine-readable manifest of what SSE ships — SHIPPED engine-side, beta v3.0.315; WIRED UP hub-side in 0.20.0

```
SEAM REPORT | R-13 | engine | beta v3.0.315 (bfdacc90) | prod: NOT RELEASED
sets:      fetch https://beta.starsystemx.com/shipped-content.json (the same path on https://starsystemx.com once released)
must know: generated from the real sources and pinned by a spec, so it cannot drift; keys appVersion, bundleFormat,
           appAssetPrefixes, calendars, tagCategories, starterModels, appImages, gases, liquids, fuels; everything under a
           path in appAssetPrefixes is app artwork; lists are sorted; static JSON answers with
           Access-Control-Allow-Origin: * on both prod and beta (measured 2026-09-06 against /temporal/calendars.json)
verified:  five mutations seen red (a throwaway star image, a renamed calendar, a bump without a rebuild, a hand edit,
           STAR_IMAGE pointed at a missing picture); CORS measured on both hosts
not done:  the R-07 capture button (engine complete, surface undecided); R-04 upload, parked on the hub's pairing endpoint
ready for: STREAM N N-3
```

**HUB-SIDE STATUS, 2026-09-06, hub 0.20.0 and 0.21.0.**

- **SET.** `sse_manifest_url`, default `https://beta.starsystemx.com/shipped-content.json` from
  `src/lib/addresses.ts` (`SSE_ORIGIN`), overridable by the config row; migration 0027 creates the
  row and **the owner has run it**. Beta, not production, under the prod rule.
- **CONSUMED.** `src/lib/server/shippedContent.ts` fetches it (4s deadline) and caches it in R2 at
  `cache/shipped-content.json`; `src/lib/bundle/shipped.ts` reads it. Facet baselines come from
  `calendars` and `tagCategories` (`baselineFrom` in `bundle/facetRules.ts`); app artwork is decided
  by `appAssetPrefixes` (`isAppAsset`). **The hand-copied baselines are DELETED, not shadowed** -
  `git show f59e14c -- src/lib/bundle/facetRules.ts` is the evidence (there are no tags in this repo). `gases`, `liquids` and `fuels`
  are already named by the three R-11 rules, which stay `enabled: false` until a save carries the
  container.
- **THE STATED FALLBACK** (Stream N N-3.3 asks for this in the browser; the honest answer is that a
  page never fetches it). The fetch is SERVER-SIDE, on the upload and re-index paths only, so an
  unreachable manifest cannot break a page - no map page, card or browse view makes this request.
  What degrades is the reading of a NEW upload: the last good manifest stands however old it is; a
  failed check is remembered for fifteen minutes; and with no cached manifest at all the two
  baseline facets are **skipped** rather than computed against nothing, because an empty baseline
  reports every shipped calendar as custom. A re-index puts an affected map right afterwards.
  `sse_manifest_url` set to `"off"` is the same path deliberately.
- **VERIFIED.** Fetched live 2026-09-06 and parsed: `appVersion` `3.0.317` (it moved from .315 to
  .317 during this work), 4 calendars, 13 tagCategories, 3 appAssetPrefixes, `Access-Control-Allow-Origin: *`.
  Production 404s the path, as expected. Run over four real saves the manifest changes NOTHING today
  (`temporal_registry` is empty since B112, and their `coiCategories` are `status`, `class`,
  `disposition`, all of which the stale list already had) - **so the drift it fixes was latent, not
  live.** 266 unit tests green, including "no baseline, no facet". **Not verified: a live ingest or
  re-index through this path, which needs an upload or an admin.** That is N-3's to see.

> **SHIPPED and in use.** `https://beta.starsystemx.com/shipped-content.json`, generated by the
> engine's `scripts/shipped-manifest/build-shipped-manifest.mjs` and pinned by its suite. The hub
> fetches and caches it (`src/lib/server/shippedContent.ts`), reads it in `bundle/shipped.ts`, and
> **the hand-copied baselines are deleted** — see D-36.
>
> **It was already stale when it was replaced, which is the argument for this requirement in one
> line:** the hub's copied list of tag categories said nine; the engine ships thirteen. A map
> carrying `frontier`, `anomaly`, `science` or `intrigue` would have been credited with up to four
> custom categories it did not have. Measured: no real save to hand does yet, so the wrong answer
> was latent rather than live - which is the point, because nothing would have announced it.
>
> **Measured 2026-09-06:** beta serves it with `Access-Control-Allow-Origin: *`; **production 404s
> the path** and will until the owner makes the read-tree release. The hub's `sse_manifest_url`
> config row therefore points at beta, and moves to production with `open_in_sse_url`, not before.
>
> Two notes for whoever changes the manifest next. `appAssetPrefixes` is the field that replaced
> the hub's path-prefix matching, so a new artwork directory must be added there or its contents
> read as a creator's own upload. And **an absent list is not an empty one**: the hub treats a list
> the manifest does not carry as UNKNOWN and skips the facet that needs it, rather than reporting
> everything shipped as custom.

> **How much it bites today (2026-09-04), so it can be sequenced honestly:** less than it did.
> Since B112 (v3.0.225) a new save omits the shipped registries, so the hub's hand-copied baselines
> only matter for files written before that — and those baselines are currently correct. The
> other thing the manifest would settle, telling app artwork from an upload, the hub does today by
> path prefix (`/images/...`, `/models/...`), which has not failed on a real file. **So: after the
> paste UI, not before it.** The paste UI closes a loop users can see; this closes one only the
> maintainers can.

**What:** one static JSON, served from the app, listing the content that ships with the build —
calendar names, tag category ids, star-type image paths, starter model paths, and later the shipped
gases/liquids/fuels.

```jsonc
{ "appVersion": "3.0.190",
  "calendars": ["Earth Gregorian", "Star Trek Stardate", "…"],
  "tagCategories": ["status", "owner", "…"],
  "starterModels": ["/models/nasa/iss.glb"] }
```

**Why: it removes an entire class of bug rather than one instance of it.** The hub has to tell
GM-authored content from app-shipped content, and right now it does that by **hardcoding lists
copied out of this repo**. That list drifted within an hour of being written — the calendar baseline
had one name where it needed four, and the facet lied on every map until it was corrected against
the real file.

Every such list is a standing promise to notice a change in another repository. **A manifest turns
that into a fetch.**

**This is the cheaper alternative to R-11's per-entry `custom: true` flag**, and it also covers the
cases a flag cannot: knowing that `/images/star_types/M.webp` is app artwork rather than a creator's
upload, which the hub currently decides by matching a path prefix.

**Either solves the problem; the manifest solves more of it.** If both happen, the flags win for
save contents and the manifest still earns its place for assets.

---

## R-14. A paste target for hub clips — SHIPPED engine-side in v3.0.292, UI pending

> **Status 2026-09-04.** The engine's `src/lib/io/hubClip.ts` takes the whole subtree, refuses a
> cycle, re-mints every id and rewrites it wherever it sits (an autopilot leg, an avoid-list, a
> docking target — not only `parentId`), re-hosts a body root through the G64 reparent, and stamps
> `origin/hub`. Every kind works: a construct is a body with `kind: 'construct'`, so stations,
> hab rings, ringworlds, ships and belts all arrive as themselves. The owner confirmed a paste.
> **Two recorded asymmetries, both fine by the hub:** a construct root gets a plain attach (parent,
> host and `hostMu` restamped, elements kept) rather than the body root's state re-expression —
> right for something placed in "Low Orbit"; and a pasted ship's autopilot is stood down and
> tagged, because its route's stops were never copied. That is rule 5 below done properly.
> **Still to build:** the paste UI — onto the selection in the system view with a text box for
> Firefox, system-then-body from the starmap. The hub side (0.10.0) now keeps app-shipped models
> and images in the clip; see the format note below.

**What the hub does.** Every row of a map page's tree has a copy control. Copying a row puts a
**clip** on the clipboard: that object and everything beneath it — a star with all its planets, a
planet with its moons, or one body — as JSON, with asset references and GM notes already stripped.

**What the engine does with it: nothing, yet.** Measured 2026-09-03 on main and `sse2-hubside`: the
only clipboard reads in the app are the gas-giant recipe (`giantRecipe.ts`) and the hub link
(`NewStarmapModal.svelte`). Nothing reads a node. **So the hub's Copy has led nowhere since it
shipped** — the flat "Copy JSON" it replaced had the same problem, and nobody noticed because nobody
tried to paste one. Recorded so the gap is visible rather than assumed closed.

### The format

```jsonc
{
  "sseClip": 1,                 // the marker AND the version. Refuse anything else, with a reason.
  "source": { "site": "StarSystemX Explorers", "url": "https://…/s/<slug>", "title": "…" },
  "root": "<node id>",          // the first entry in `nodes`
  "nodes": [
    { "id": "…", "parentId": null, "name": "…", "kind": "body", "roleHint": "planet", "orbit": {…}, … },
    { "id": "…", "parentId": "<root id>", "roleHint": "moon", … }
  ]
}
```

Three rules, from the hub's `src/lib/bundle/clip.ts`:

1. **Depth-first, parents first.** A one-pass insert always finds the parent already present.
2. **The root's `parentId` is `null`.** Where it lands is the paste target's decision, not the
   source map's.
3. **Ids are the SOURCE map's ids**, carried only so `parentId` resolves within the clip. **Mint new
   ones and remap** — one clip pasted twice, or two clips from the same map, collide otherwise.

Nodes are the engine's own node shape minus `gmNotes` and minus any picture or model **the bundle
carried** (`assets/...`, a `model.hash`) - those would be broken links on arrival. App-shipped
references (`/images/star_types/G.webp`, `/models/nasa/iss.glb` with its credit) and remote urls
stay, so a station built on the ISS is still on the ISS elsewhere. The hub does not touch orbits,
masses, megastructure parameters or anything else: what was in the file is what is in the clip.
Constructs, megastructures, barycentres and their subtrees copy exactly like bodies do - every row
of the tree has the control.

### What the paste target has to do

- **Accept a HIERARCHY, never just one object** — the owner's words, 2026-09-03. A clip is a
  subtree: a star with its planets and their moons, or a planet with its moons, or a lone body as
  the degenerate case. `nodes` is the whole subtree, parents first, and the target inserts all of
  it under one chosen host. A target that takes only `nodes[0]` is not R-14.
- **Recognise it or refuse with a reason.** `giantRecipe.ts` already does this right for recipes —
  parse, say what was wrong, never fail silently. Same shape here. `sseClip` above 1 means "made by
  a newer hub than this app understands".
- **Land the root under the selected body**, or as a new root when nothing is selected (a star clip
  with no selection is the obvious case). This is a reparent — **G64 is building exactly that
  machinery**: re-express the orbit about the new host, restamp `orbit.hostMu`, then let
  `hierarchyRebuild` and `barycenterReconcile` settle it. Build R-14 ON G64, not beside it.
- **Keep the orbits within the clip as they are.** A moon's orbit about its planet came from a real
  save and is internally consistent; only the root's host changed.
- **Steer, don't stop.** A 2 Msun star pasted under Earth is allowed and tagged, never refused.
- **Tolerate a dangling reference.** A node may name a custom calendar, gas or tag category the
  receiving campaign lacks — the clip carries nodes, not definitions. Tag it; keep the node.
- **Carry the credit.** `source.url` should survive on the pasted object — a tag such as
  `origin/hub` with the url as its value — so a body lifted from someone's map still says whose map.
  The attribution culture, applied one body at a time.
- **A text field as well as a paste event.** Firefox will not hand a page the clipboard; the recipe
  paste already uses a field for this reason.

**Where it goes in the UI is the engine's call.** The natural home is beside "Add body": *Paste
from the library*.

---

## R-16. A pasted clip carries its credit as an ATTRIBUTION, not only a tag

**Owner, 2026-09-04:** *"on cut and paste are we pushing through attributions with it to store on
the map they create? If not we need to engineer that in."* Today the paste stamps `origin/hub`
with the url on the root. That is a breadcrumb; it is not a credit. The hub's whole culture is
that the people whose work you use get named, and a clip is somebody's work.

**What the hub now sends.** `source` in the clip gained `creator` — the cartographer's display
name or handle — beside `site`, `url` and `title` (hub 0.11.0):

```jsonc
"source": { "site": "StarSystemX Explorers", "url": "https://…/s/local-neighbourhood",
            "title": "Local Neighbourhood", "creator": "frunk" }
```

**What the engine should do on paste.**

1. **Append a content credit to the campaign**, not to the node — a node can be deleted, renamed,
   split; the credit is for the map. Proposed key, on the document:
   ```jsonc
   "contentCredits": [
     { "title": "Local Neighbourhood", "creator": "frunk",
       "url": "https://…/s/local-neighbourhood", "site": "StarSystemX Explorers",
       "pastedAt": "2026-09-04T18:12:00Z", "nodeIds": ["…new ids…"] }
   ]
   ```
   One entry per paste; the same source pasted twice is two entries (they name different nodes).
   Keep the `origin/hub` tag as well — it is what tells a person *which* body came from where.
2. **Print it in `ATTRIBUTIONS.md`** under its own heading — *"Content from other cartographers"*
   — title, creator, link. The bundle is the unit of distribution; that file is where credit
   lives; a pasted system deserves the same line an image does.
3. **Carry it through save and load.** It is campaign data like any other block.
4. **Absent `creator`** (an older hub, or a hub-side blank): credit the title and url and say
   "cartographer not recorded" rather than inventing a name.

**What the hub does with it.** On upload the hub reads `contentCredits`, stores them
(`content_credits`, 0018) and shows *"Includes work from Local Neighbourhood by frunk"* with the
link on the map's page. So credit follows content through as many hands as it passes — and a
creator can see, from their own page, where their work went.

**Not asked:** any check that the credited map still exists, or that the paste was permitted. The
hub's terms make sharing the point of uploading; this is about naming, not gating.

### R-16 addendum (hub 0.12.0): the link is to the OBJECT, and a copy of a copy names its original

Owner, 2026-09-04: *"Could it link to the right point on the explorer hub - so if a user uses it or
REUSES it you could link right back to the true source (also if it has been appended and updated,
ownership is kind of shared)."*

Two more things now ride in `source`, and one more thing to record:

1. **`source.url` is a deep link**: `https://…/s/<slug>#node=<id>`. The map page opens that
   branch, scrolls to the object and lights it. Store it as it arrives; do not trim the fragment.
2. **`source.chain`** (optional): where the object was BEFORE the map it is being copied from,
   deepest first — present when the copied root carries an `origin/hub` tag from an earlier paste.
   ```jsonc
   "source": { "site": "…", "url": "https://…/s/gamma#node=e2", "title": "Gamma", "creator": "carol",
               "chain": [ { "url": "https://…/s/alpha#node=earth", "title": "Alpha", "creator": "alice" },
                          { "url": "https://…/s/beta#node=e",      "title": "Beta",  "creator": "bob" } ] }
   ```
3. **Record `chain` on the `contentCredits` entry** exactly as received, and print the lineage in
   `ATTRIBUTIONS.md`: *"Earth — from Alpha by alice, via Beta by bob, via Gamma by carol."* When
   `chain` is absent, print the single line as before.

**Shipped engine-side 2026-09-04 (stream F).** `pastedAt` is ISO 8601, which is right: it is a
date a person reads in a hand-edited save. The hub does not consume it - `readContentCredits`
reads `title`, `creator`, `url`, `site` and `chain` and ignores everything else, so its type is
the engine's to choose. Also fixed there: the attributions file is now written when a campaign has
credits but no uploaded art, where before it was skipped and the credit lost with it. The hub
reads credits from the document, never from that file, so this affects the human copy only.

**What the hub does with it:** the page shows *"Includes work from Alpha by alice (via Beta by bob,
Gamma by carol)"* and lists every cartographer whose hands the content passed through — that is
the shared ownership, made visible. And the ORIGINAL map's page lists *"Used in: Gamma by carol"*,
because the hub can see which public maps credit it (0019). Nothing for the engine to do for that
half; it falls out of recording the chain faithfully.

## R-17. Open a hub map from a URL — SHIPPED engine-side, beta v3.0.314

```
SEAM REPORT | R-17 | engine | beta v3.0.314 (21779f3e) | prod: NOT RELEASED
sets:      open_in_sse_url = https://beta.starsystemx.com/?open=
must know: the parameter is `open` on the query string, not the hash; explorers.starsystemx.com answers 404 from Vercel
           (DEPLOYMENT_NOT_FOUND) so download URLs must use the workers.dev origin until DNS moves; both hosts are already on
           the allow-list (TRUSTED_OPEN_HOSTS, src/lib/hub/hubConfig.ts:90), so the cutover needs no engine release
verified:  walked in a browser against the live hub - no campaign: opens; a campaign: asks in the picker's words; refused
           host: plain message and no request; the parameter is stripped in every case
not done:  -
ready for: STREAM N N-1
```

**HUB-SIDE STATUS, 2026-09-06, hub 0.21.0.**

- **SET.** `open_in_sse_url`, default `https://beta.starsystemx.com/?open=` from
  `src/lib/addresses.ts`, overridable by the config row. **The row created by migration 0026 is
  empty, and an empty ADDRESS row now means "nobody has said otherwise" so the default stands**
  (`ADDRESS_GATES` in `server/config.ts`) - the owner asked for a variable he could change rather
  than a row he had to set. The off switch is a row reading `"off"`, or anything that is not an
  http(s) URL: `openLink` builds nothing from it.
- **CONSUMED.** `src/lib/openInSse.ts` builds `prefix + encodeURIComponent(siteUrl + '/api/download/' + slug)`,
  used by the map page, the cover link and every card.
- **The download URL's host** is `site.url`: the `site_url` config row, and with it unset
  `HUB_ORIGIN` (0.21.0; it used to be the request's own origin, which was right for a page and
  wrong for a link that outlives it).
- **THE DNS HAS MOVED, AND THE HUB NOW SENDS `explorers.starsystemx.com` (hub 0.24.0,
  2026-09-06).** The owner: *"all dns setup right - https://explorers.starsystemx.com/ works for
  you now."* Measured before the change: `https://explorers.starsystemx.com/` answers 200 with
  `x-hub-version: 0.23.1`, and `/api/download/local-neighbourhood` answers 200 with
  `access-control-allow-origin: *`. **Nothing was needed from the engine, exactly as its status
  report predicted** - both hosts were already on `TRUSTED_OPEN_HOSTS`. The workers.dev origin
  still answers and is still trusted, so links already posted to a Discord keep working. **The
  earlier trap in this section is now history and is marked as such below.**
- **ONE THING THE HUB DOES THAT THE BLOCK DOES NOT COVER:** the control is hidden for a map whose
  `kind` is not `starmap`, because `openHubBytes` refuses a single system. See R-18 - that is the
  hub's SEAM REPORT going back the other way.
- **VERIFIED, live at hub 0.21.0 against engine beta, 2026-09-06.** The map page and the browse
  card both carry the control, and both hrefs are
  `https://beta.starsystemx.com/?open=https%3A%2F%2Fstarsystemx-creator-hub.orange-tree-847c.workers.dev%2Fapi%2Fdownload%2Flocal-neighbourhood`
  - the parameter on the query string, the download URL on the workers.dev origin, nothing naming
  `explorers`. Following it: the engine fetched the hub cross-origin, read the bundle (it named the
  map and said which build wrote it), and **asked before replacing the campaign that browser held**,
  in its own words with the single step back offered. Declining left the campaign alone and **the
  `open` parameter was off the address bar**. Unit tests cover the built URL, the `"off"` row,
  whitespace, and the single-system and unknown-kind refusals.
- **NOT verified, and it is N-1's:** the no-campaign path, a refused host showing a plain message
  with no request made, and the opened map's provenance and attributions - the import was declined
  rather than completed, so nothing was seen past the offer.

> **SHIPPED, and the answer to the question this asked: the parameter is `open`, on the QUERY
> STRING.** So the prefix for the hub's `open_in_sse_url` row is `https://beta.starsystemx.com/?open=`
> now, and `https://starsystemx.com/?open=` only once the owner has released the engine to
> production. `src/lib/openInSse.ts` already builds exactly the right URL; setting the row turns the
> button on everywhere it is gated.
>
> The engine's allow-list (`src/lib/hub/hubConfig.ts`, `isTrustedOpenUrl`) carries the hub's
> workers.dev name, `explorers.starsystemx.com` and `*.pages.dev`, so the DNS cutover needs no
> engine release.
>
> **~~THE TRAP~~ - RESOLVED THE SAME DAY. The DNS moved on 2026-09-06 and
> `explorers.starsystemx.com` now serves the hub (200, `x-hub-version` present, CORS `*`). The hub
> sends that host from 0.24.0. Everything in the paragraph below WAS true for about a day and is
> kept because the reasoning still is: an address the hub embeds outlives the request, and R-17's
> worked example named a host that did not answer. Check before believing either way.**
>
> **THE TRAP, MEASURED 2026-09-06 (no longer true): `explorers.starsystemx.com` DOES NOT REACH THE HUB.**
> `GET https://explorers.starsystemx.com/api/download/local-neighbourhood` answers 404 from Vercel
> (`X-Vercel-Error: DEPLOYMENT_NOT_FOUND`); the workers.dev origin answers 200. The worked example
> below uses the `explorers` host and **a button built from it would fail for every visitor today**.
> Concretely: `loadSite()` falls back to the request's own origin when the `site_url` config row is
> unset, which is why the download URL is right — so **do not set `site_url` until that host serves
> the hub**, or every "Open in SSE" link builds a download URL that 404s and it will look like an
> engine bug. Check with `curl -sI https://explorers.starsystemx.com/api/download/<a real slug>`.
>
> **What the download actually returns, since the text below overstates it:** `/api/download/<slug>`
> serves the bundle **reassembled from approved assets** — `.sse.zip` when the upload carried
> assets, and the plain `.json` document when it did not (`server/pack.ts`: an assetless save has
> nothing to withhold and nothing to repack). The engine puts both through the same classifier, so
> nothing is broken; the requirement simply promised one of the two cases.
>
> **What it does NOT do, and became R-18:** a map that is not a starmap is refused —
> *"That link points at a single system rather than a campaign."* The hub now hides the button for
> a single system rather than offering a promise the engine will not keep (`openInSse.ts`).

**The owner's ask (2026-09-05):** *"how feasible is just an 'open in SSE' button next to download -
instead of the Open SSE at the top - it is just 'open this in SSE'."*

**What the hub does.** When the config row `open_in_sse_url` is set, every map page shows "Open in
Star System Explorer" beside the download. The link is that URL with the map's download URL
appended, percent-encoded:

```
https://starsystemx.com/?open=https%3A%2F%2Fexplorers.starsystemx.com%2Fapi%2Fdownload%2Flocal-neighbourhood
```

`GET /api/download/<slug>` already answers cross-origin: `access-control-allow-origin: *`, no
credentials, on success and on error alike (the hub's `cors.ts`, learned the hard way). So there
is no CORS problem to solve on the engine side: a plain `fetch` of that URL from starsystemx.com
works today and returns the bundle reassembled from approved assets only — `.sse.zip` when the map
carried assets, the plain `.json` document when it did not.

**What the engine needs to do.**

1. On load, read `open` from the query string (or the hash — the hub can send either; say which).
2. Accept it only when it is an `https:` URL on a host the engine trusts — the hub's domain, its
   workers.dev name while that lasts, a `pages.dev` preview. Anything else is ignored with a
   plain message. A URL parameter that the app will fetch and load is an SSRF-shaped thing; the
   allow-list is the whole defence.
3. `fetch` it, and hand the bytes to the existing bundle import path — the same one the file
   picker uses — so provenance, attributions and the format gate behave exactly as for a file.
4. Then behave as a normal import would: ask the same "replace or add?" question the picker asks,
   in the same words. Do not auto-replace a campaign somebody has open because a link said so.
5. Strip the parameter from the address bar once handled, so a reload does not import twice.

**What the hub will set.** The URL template goes in `open_in_sse_url`, e.g. `https://starsystemx.com/?open=`
— the engine tells the hub the exact parameter name and the hub sets the row. Until then the button
is not shown; nothing ships dead.

**Not asked:** deep-linking to an object inside the map on open. The clip's `#node=<id>` already
does that on the hub side; the engine can honour a second parameter later if it wants to.

---

## R-18. `?open=` should take a single system too, not only a campaign

**Found by reading the shipped R-17 code, 2026-09-06** — `src/routes/+page.svelte`, `openHubBytes`:

```
if (classified.kind !== 'starmap') {
  hubProblem = 'That link points at a single system rather than a campaign. Download it from the
                hub and open it with Load System.';
  return;
}
```

**Why this matters more than it looks.** The hub hosts both kinds — `kind` is `starmap | system` —
and **the single system is the smaller, more common upload**: one interesting star system is a
Tuesday evening's work, a campaign is a project. The library will be mostly systems, every one of
them carrying a button labelled "Open in Star System Explorer" that opens the app and then explains
that it will not do that. The message is a good message; it is being shown at the wrong moment,
after a click on a promise.

**The hub's stopgap, already shipped (0.20.0):** the button is hidden for a single system. So
nothing is broken today — this is a request to give it back, not a bug report.

**What we are asking for.** The same door, one step further: when `?open=` classifies as a system,
offer it the way the file picker's Load System offers a file. Whatever that path already does about
"add to the open campaign or open it alone" is the right behaviour here too — the point is that the
answer comes from the app's own import path rather than from a refusal in the link handler.

**What we are NOT asking for:** any change to `?hub=`, to the allow-list, or to the replace-or-add
question. Only the classification branch.

**How the hub will know it can stop hiding the button:** it cannot, from the outside — say so, and
the `kind !== 'starmap'` line comes out of `src/lib/openInSse.ts` with its test.

**The block going the other way** (SEAM PROTOCOL rule 2, side `hub`; for the coordinator to paste
into the engine's G57 row). Two: R-18 itself, and the DNS cutover, which changes what the hub sends
even though it needs nothing from the engine.

```
SEAM REPORT | R-17 | hub | 0.24.0 | prod: LIVE (the hub has one environment; a push to main is the deploy)
sets:      the hub now sends https://explorers.starsystemx.com/api/download/<slug> in every "Open in SSE" link
must know: the DNS cutover happened 2026-09-06 and NOTHING WAS NEEDED FROM THE ENGINE - both hosts were already on
           TRUSTED_OPEN_HOSTS, which is exactly what listing the name ahead of the cutover bought; the workers.dev
           origin still answers and is still trusted, so links already posted to a Discord keep working; the trap in
           R-17's own text (explorers answering 404 from Vercel) is now history and is marked as such in the hub's half
verified:  measured before the change - https://explorers.starsystemx.com/ answers 200 with x-hub-version 0.23.1, and
           /api/download/local-neighbourhood answers 200 with access-control-allow-origin: *
not done:  the round trip has not been re-walked from the new hostname; that is N-1's, and its criterion 3 (curl the
           explorers host) now PASSES rather than reporting a dead name
ready for: STREAM N N-1
```

```
SEAM REPORT | R-18 | hub | 0.21.0 | prod: LIVE (the hub has one environment; a push to main is the deploy)
sets:      nothing on the engine side. The hub hides "Open in Star System Explorer" where kind != 'starmap'
must know: openHubBytes refuses a non-starmap with "That link points at a single system rather than a campaign";
           the hub hosts both kinds and the SINGLE SYSTEM is the more common upload, so most of the library would
           carry a button that opens the app to say it will not open the map; the ask is that ?open= hand a system
           to the app's own Load System import path and let that path ask what it already asks; no change to ?hub=,
           to TRUSTED_OPEN_HOSTS or to the replace-or-add question
verified:  read in src/routes/+page.svelte (stream L worktree, 2026-09-06); the hub's gate is unit-tested
           (tests/openInSse.test.ts) and the button is live-gated on kind, so nothing is broken today
not done:  the hub cannot detect from outside when the engine gains the door - tell it, and the kind gate and its
           test come out in one commit
ready for: STREAM N N-1 (the starmap path only, until this ships)
```

---

## What the hub will NOT ask the engine to do

Recorded so nobody builds them by mistake:

- **No hub rendering, no engine on the hub.** Cover image, data, copy-paste snippets. Settled.
- **No moderation in the app.** Review is a hub concern; the app never needs to know a verdict.
- **No provenance parsing from `ATTRIBUTIONS.md`.** It is a human document and the hub treats it as a
  claim. The gate is computed from the node fields. Do not add machine-readable structure to it on
  the hub's behalf.
