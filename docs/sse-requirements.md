# Requirements for the Star System Explorer engine

**Written by the Creator Hub, for an agent working in the SSE repo. The hub does not edit that repo.**

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

## What the hub will NOT ask the engine to do

Recorded so nobody builds them by mistake:

- **No hub rendering, no engine on the hub.** Cover image, data, copy-paste snippets. Settled.
- **No moderation in the app.** Review is a hub concern; the app never needs to know a verdict.
- **No provenance parsing from `ATTRIBUTIONS.md`.** It is a human document and the hub treats it as a
  claim. The gate is computed from the node fields. Do not add machine-readable structure to it on
  the hub's behalf.
