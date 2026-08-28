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

### Q-04. The three non-technical things §6.8 still owes, and one of them blocks launch

1. **Terms and an acceptable-use line.** The tooling enforces a policy; it does not write one. It
   must exist before the first public upload.
2. **A takedown address that reaches a person**, for copyright claims from people with no account.
3. **Does a rejected asset leave its map published-without-it, or does the whole map come down?**

The footer links `/terms`, `/acceptable-use` and `/takedown` are **placeholders and those routes do
not exist yet.** They must be real before uploads open.

On (3): **the hub is built assuming the map lives and the asset is withheld** (§6.2's own
assumption), because that is what "never stop the funnel" implies everywhere else in the design and
because it is the behaviour that reads as fair rather than arbitrary. If the answer is the other
way, `pack.ts` and the system page both change. Please confirm rather than let the assumption
harden.

### Q-05. Does the hub host campaigns as well as single systems? (§9.3)

The schema and parser handle both (`kind` is `starmap | system`) so nothing is blocked, but a
campaign is the bigger payload and interacts with `max_bundle_bytes`. Currently both are accepted.

### Q-06. Anonymous upload, or account required? (§9.4)

Built as **account required** — reports and hearts need one anyway, the daily allowance is
per-account, and §6.6's best abuse signals are behavioural and need an identity to attach to. Easy
to relax; hard to add later. Flagging it because §9.4 lists it as open.
