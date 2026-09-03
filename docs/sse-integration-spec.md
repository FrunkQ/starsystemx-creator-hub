# SSE ↔ Creator Hub — the integration spec

**For an agent working in the Star System Explorer repo.** The hub does not edit that repo; this
says what the hub needs, what it promises in return, and where the boundaries are.

Companion to `sse-requirements.md`, which lists the individual asks. This one describes the *system*
they add up to.

---

## The principle, and its one exception

> **From here on, a saved file carries the metadata. The hub stops inferring.**

The hub currently reads things out of files by inference — whether a save is a GM tree, which build
made it, what it is called. That works, and some of it works well, but inference is a fallback and
should be treated as one. A file that states its own facts is better for everybody: the hub is more
accurate, the pages are better labelled, and the round trip stops losing information.

**THE EXCEPTION, AND IT IS NOT NEGOTIABLE:**

> **Metadata makes a LABEL certain. It never becomes a GATE.**

Every field below arrives inside a file that a stranger uploaded. It is a *claim*, exactly like
`ATTRIBUTIONS.md` (`contract-with-sse.md` C-02) and exactly like a model's path hash (C-03). So:

| the hub uses a stamp for | the hub never uses a stamp for |
|---|---|
| what to print on the page | whether an asset may be served |
| which fields to prefill | whether a map may be published |
| finding the map you are updating | whether you may update it |

Concretely: `exportMode: "player"` on a file full of GM notes **loses to the detector**, loudly. The
detector (`src/lib/bundle/gmContent.ts`) stays the control. The stamp only decides whether the page
can honestly say *"the player version"* instead of *"no GM-only content found"*.

Get that inverted and a one-line edit to a JSON file becomes a way past every gate the hub has.

---

## 1. What a saved file should carry

One object at the top level of `starmap.json` / `system.json`. Everything is optional except
`bundleFormat`; absent is always a legal state and must never be an error.

```jsonc
{
  // --- the contract (R-01). An integer the hub REFUSES if it does not know it. ---
  "bundleFormat": 1,

  // --- capability markers. NEVER parse gates: a newer SSE opens an older map. ---
  "appVersion": "3.0.164",     // already stamped today, on explicit saves
  "baseMapVersion": 2,         // already stamped today; never invented

  // --- what kind of save this is (R-10). For the LABEL. ---
  "exportMode": "player",      // "player" | "gm"

  // --- the creator's own write-up, authored in the app ---
  "meta": {
    "title": "The Hystrine Reach",
    "summary": "A dying binary with three habitable moons and a lot of secrets.",
    "description": "Longer prose. Markdown is fine.",
    "tags": ["hard-sf", "binary", "campaign"]
  },

  // --- where this file came from, if it came from the hub (section 3) ---
  "hub": {
    "host": "share.starsystemx.com",
    "slug": "the-hystrine-reach",
    "systemId": "0f9c…",
    "fetchedAt": "2026-08-28T15:00:00Z"
  }
}
```

### Why `meta` is worth having

The creator is being asked to write a pitch — a title, a one-liner, a description, tags — because
that is what makes somebody click download rather than scroll past. **They should be able to write
it in the app, where they are already working**, not only in a web form afterwards.

The hub prefills from `meta` on upload and lets them edit on the page. Edits made on the hub win for
that published entry; the file is the starting point, not the master.

### What the hub does NOT want in a save

- **Anything about moderation.** Verdicts are per-hash and live in the hub's ledger. The app never
  needs to know one, and a save must never carry one.
- **Anything about accounts, tiers or entitlements.** Those are hub state.
- **Hearts, download counts, or any other hub metric.** They would be stale the moment they were
  written.

---

## 2. Downloads — no credentials, ever

```
GET https://share.starsystemx.com/api/download/<slug>
```

Returns the bundle (`.sse.zip`, or `.json` for an assetless save). **No account, no token, no
header.** One click is the entire point of the hub, and a download that asked for a login would
defeat it.

Three things the app should know about what comes back:

1. **It is REASSEMBLED, not the original upload.** Any asset still awaiting review is left out of
   the zip and named in `README.txt`. This is normal and not an error.
2. **A missing asset is already handled.** The engine's own `unpackBundle` treats a
   referenced-but-absent picture as *"an honest blank, not a broken img"* and a missing player asset
   as a visible gap. Nothing new is needed — that behaviour is exactly what makes withholding cheap.
3. **Treat it as untrusted input**, precisely as an imported file already is. The slug comes from a
   URL a stranger can craft.

### The one-click link (R-05)

```
https://starsystemx.com/?hub=<slug>
```

The app fetches the download URL above and opens it. This is the funnel: a Discord link becomes a
running system in one click.

> **Do not auto-merge into the open campaign.** Open it as its own thing, or ask. A link that
> silently merges a stranger's systems into somebody's live campaign is a bad afternoon.

**When the app opens a map fetched this way, it should stamp the `hub` block itself** — it knows the
host and slug because it just used them. The hub deliberately does **not** rewrite the file on
download: keeping the bytes faithful is what makes the content-hash dedup reasoning hold.

---

## 2b. Clips — copying part of a map

The map page's tree lets a visitor copy any row — one body, or a star and everything under it — as a
**clip**: a JSON envelope marked `sseClip: 1`. The full shape and the paste rules are R-14 in
`sse-requirements.md`. The hub strips `image`, `model` and `gmNotes` before copying; nothing else is
altered, and ids are the source map's own.

**The engine has no paste target yet.** Until R-14 ships, a clip is text Star System Explorer does
not recognise. The hub does not hide its copy controls in the meantime — the format is fixed and the
app catching up is the plan — but nobody should describe the round trip as working.

---

## 3. Uploads and updates — the round trip

```
POST https://share.starsystemx.com/api/upload        multipart/form-data
```

| field | required | meaning |
|---|---|---|
| `bundle` | yes | the save file |
| `attest` | **yes** | `on`. The provenance attestation — see below |
| `replaces` | no | the `systemId` of the map being updated |
| `confirmGmTree` | no | only after the hub has *detected* GM content and warned |

Needs a signed-in session. **How the app gets one is still an open decision — `sse-requirements.md`
R-06.** Device-code pairing is the recommendation; nothing here is buildable until that is settled.

### The attestation is not a formality

The exact wording lives in the hub's `src/lib/attestation.ts` and the app must show **that text** and
send the confirmation. **Never pre-tick it.** Nobody can check who really made a picture, so the hub
runs on trust — and the record of what someone agreed to is the only thing that means anything if a
claim is ever disputed.

### Why the round trip needs `hub.slug`

Without it, "update my map" means the creator re-finding their own entry in a list. With it the app
can say *"this came from the hub — update it?"* and send `replaces` automatically.

> **The hub will not trust `hub.systemId` for authorisation.** It identifies which entry you are
> *claiming* to update; ownership is checked server-side against your session. A file can claim any
> id, and one that claims someone else's is refused.

**An update is close to free.** Only *novel* asset hashes count against the daily allowance, so
re-uploading a map whose pictures the hub already has costs almost nothing. A creator iterating all
morning will not run out.

### What the app should do with the response

```jsonc
{ "ok": true, "systemId": "…", "mayPublish": false,
  "missingProvenance": ["assets/images/n17.jpg"],
  "withheldCount": 3, "gmContent": [] }
```

- **`mayPublish: false`** — the map uploaded fine but **cannot be published** until every asset has
  a source recorded. `missingProvenance` names them. **Say so in the editor, where the fields
  actually are** — that is a far better place to fix it than a web form.
- **`withheldCount`** — images awaiting review. The map is public and downloadable regardless.
- **`code: "gm-content"`** — the hub found GM notes, hidden objects or secret tags. The message
  names what. Offer to re-export the player version; only send `confirmGmTree` if the creator
  actively chooses to share the full map.

---

## 4. Boundaries

**The hub will never ask the engine for:**

- rendering, previews, or any engine code on the hub — cover image, data and copy-paste snippets,
  settled;
- moderation state of any kind;
- machine-readable structure inside `ATTRIBUTIONS.md`. It is a human document and the hub treats it
  as the creator's claim. The provenance gate is computed from the node fields.

**The engine should never rely on the hub for:**

- anything at load time. A map opens with or without the hub reachable;
- validation. The hub's gates protect the hub's library, not the app's data.

---

## 5. Order of work

1. **`bundleFormat` + the canonical fixture** (R-01, R-02) — the hub is *blocked* on these and
   uploads stay closed until they land.
2. **A decision on app sign-in** (R-06) — nothing in section 3 is buildable without it.
3. **`?hub=<slug>` open-on-startup** (R-05) — the funnel's payoff, and it needs nothing but the
   download endpoint, which is already live.
4. **`meta` and `exportMode` stamps** (section 1, R-10) — quality of labelling.
5. **`hub` block on open** (section 2) — makes the update round trip work.
6. **A "capture for the hub" screenshot action** (R-07) — probably the highest-value item for how
   good the pages look, once anything can be published at all.
