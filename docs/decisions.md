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

### D-06. The admin image route is the single exception to "unreviewed is never served"

Somebody has to look at the picture to review it. `/admin/asset/[hash]` is admin-only, `no-store`,
`noindex`, and is the **only** route that reads R2 without consulting the ledger.

It returns 404 rather than 403 to a non-admin, so it does not confirm that a hash exists to anyone
not entitled to know. **If a second such route ever appears, the rule in §6.2 is gone.**

### D-07. Row types are `type` aliases, never `interface`

`src/lib/server/database.types.ts`. supabase-js constrains schema rows to `Record<string, unknown>`;
a TypeScript interface has no implicit index signature and fails that constraint — and the failure
is **silent**, degrading every query to `never` while still compiling. Cost about twenty minutes to
find. The file says so at the top.

### D-08. The daily allowance counts novel hashes, and an update is close to free

§6.3 asks for this and it is implemented in `gates.ts`: an update to your own map does not consume
the non-update allowance, and only novel hashes count. A creator iterating on a map would otherwise
burn a day's quota by lunchtime.

---

## Open questions — the owner's to answer

### Q-01. What happens to saves made before the `bundleFormat` stamp exists? **(recommendation below)**

Every bundle in the world today is unstamped. If the hub refuses unstamped bundles it refuses
**every save anyone currently has**, on day one, including the owner's own.

Config key `accept_unstamped_bundles`, currently `false`.

**Recommendation: set it `true` and treat unstamped as format 1.** The pre-stamp layout is known,
stable, and is the one the mirrored parser was written against; refusing it buys nothing and closes
the funnel to the existing user base. Refuse only integers *above* what the deploy knows.

Not done unilaterally because it decides whether the hub opens to today's users or only to users on
a future engine build — which is a product question, not a technical one.

### Q-02. Should a CC-BY breach block publication, as well as missing provenance?

The design's gate is `missing.length === 0`. But the engine singles out CC-BY-without-credit as
*"the one combination that is actively wrong, not merely unrecorded"* — a blank field is an
omission, a CC-BY breach is a licence violation being published.

Config key `block_cc_by_breach`, currently `false` (matching the design exactly).

**Recommendation: turn it on.** It is a small number of cases and the creator is told precisely what
to fix. Left off because it is stricter than the design specifies and that is not a change to make
quietly.

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
