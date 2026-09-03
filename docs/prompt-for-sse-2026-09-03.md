# For the SSE stream: the paste target for hub clips, and four small things the hub now does

From the Creator Hub side, 2026-09-03, hub v0.6.0. The hub repo is
`C:\Development\starsystemx-creator-hub`; its full requirements list is `docs/sse-requirements.md`
there (R-01..R-14) and its integration spec is `docs/sse-integration-spec.md`. Read R-14 in full
before building anything below; this note is the short version plus what changed today.

---

## 1. R-14: a paste target for hub clips — it must take a HIERARCHY

**The situation.** Every row of a hub map page's tree has a copy control. Copying puts a **clip** on
the clipboard: that object **and everything beneath it** — a star with all its planets and their
moons, a planet with its moons, a station with its docked ships — as JSON. **Nothing in the engine
reads it.** Main and `wt/hubside` were grepped for clipboard reads: the gas-giant recipe and the hub
link are the only paste targets. So the hub's Copy has led nowhere since it shipped.

**The owner's one hard requirement:** *"it must be spec'd to receive hierarchies rather than one
object."* A target that takes `nodes[0]` and drops the rest is not this feature. Placement, the
entry point, and where the paste buffer lives are the owner's to discuss with you — the format is
not.

### The format, fixed

```jsonc
{
  "sseClip": 1,                 // marker AND version - refuse anything else, with a reason
  "source": { "site": "StarSystemX Explorers", "url": "https://<hub>/s/<slug>", "title": "..." },
  "root": "<node id>",          // the first entry in nodes
  "nodes": [
    { "id": "...", "parentId": null,       "kind": "body", "roleHint": "star",   "orbit": {...}, ... },
    { "id": "...", "parentId": "<root id>", "kind": "body", "roleHint": "planet", "orbit": {...}, ... },
    { "id": "...", "parentId": "<planet>",  "kind": "body", "roleHint": "moon",   ... }
  ]
}
```

- `nodes` is the whole subtree, **depth-first, parents first** — a one-pass insert always finds the
  parent already present.
- The root's `parentId` is `null`. Where it lands is your decision (the selected body, or a new
  root when nothing is selected).
- **Ids are the source map's.** They are carried only so `parentId` resolves *within* the clip.
  Mint new ids and remap, or one clip pasted twice collides.
- Nodes are your own node shape minus `image`, `model` and `gmNotes`. The hub touches nothing
  else — orbits, masses, tags, classes arrive as they were saved.

The producer is `src/lib/bundle/clip.ts` in the hub repo; `tests/clip.test.ts` pins the shape. Any
public hub map is a live source: copy Sol from the Local Neighbourhood page and you have a
53-node clip to test against.

### What the target has to do

1. **Parse or refuse with a reason** — the `giantRecipe.ts` pattern. `sseClip > 1` is "made by a
   newer hub than this app understands".
2. **Insert the whole subtree under one host.** This is a reparent of the root plus a straight
   insert of its descendants, and **G64 is building the reparent**: orbit re-expressed about the new
   host, `orbit.hostMu` restamped, then `hierarchyRebuild` + `barycenterReconcile`. Build R-14 on
   G64, not beside it.
3. **Leave the orbits inside the clip alone.** A moon's orbit about its planet came from a real
   save and is internally consistent; only the root's host changed.
4. **Steer, don't stop.** A 2 Msun star pasted under Earth is allowed and tagged, never refused.
5. **Tolerate a dangling reference** — a custom calendar, gas or tag category the receiving campaign
   lacks. The clip carries nodes, not definitions. Tag it, keep the node.
6. **Carry the credit.** `source.url` onto the pasted root as a tag (`origin/hub` with the url as
   its value), so a body lifted from someone's map still says whose map it came from.
7. **A text field as well as a paste event** — Firefox will not hand a page the clipboard.

---

## 2. Four things the hub changed today that touch your side

1. **`pagePath` in `hub/hubConfig.ts` is still `/m/<slug>`; the page is `/s/<slug>`.** The hub now
   redirects `/m/` to `/s/` so nothing breaks, but the one-token fix belongs with you.
2. **The upload endpoint accepts the file as `file`** (what `hubUpload.ts` posts) as well as
   `bundle`. Nothing to change; recorded so you know it was a mismatch and is not one now.
3. **A new refusal code: `stale-revision`.** On an update (`replaces=<systemId>`) whose `revision`
   is LOWER than the published copy's, the hub answers 400 with
   `{ code: 'stale-revision', message, detail: { incoming, published } }`. That is R-12 doing its
   job. To override knowingly, resend with `confirmStale=on`. Show the message; do not auto-confirm.
4. **C-07: `capturedInApp` is mirrored.** The hub's provenance gate now exempts a capture from
   "missing provenance" exactly as your `attributions.ts` does (absence only; a CC-BY claim naming
   nobody is still a breach; a literal `true` only). Until today the two sides disagreed about the
   same file, and a creator publishing a map whose cover was their own screenshot would have been
   refused by the hub after the app said it was fine. **Also honoured now:** `coverAssetId` is used
   first when the hub picks a cover; `exportMode` and `revision` are stored and shown.

---

## 3. Pairing and in-app publish

The hub's device-code endpoints and `/api/attestation` are live (shapes in the hub's
`docs/sse-direct-integration.md`). The hub owner still has a migration to run before pairing can be
walked end to end; the hub side will confirm "verified live" once it has been. Nothing changes in
the request shape you already built — `Authorization: Bearer <token>`, `attest=on` never
pre-ticked, `publishGmTree` absent unless chosen.

## 4. Still owed by the engine, unchanged

- **R-13**, a manifest of what SSE ships — the hub still hand-copies the calendar and tag-category
  baselines out of your repo, and they drift.
- The **capture button** (R-07's screenshot; engine side complete, surface undecided).
