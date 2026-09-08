# R-19 test clips, and what each one should do

Seven clipboards for testing the paste side of R-19, and the outcome each is meant to produce.
From the Creator Hub, 2026-09-08, hub v0.51.1.

**These are not hand-written.** They are produced by the hub's own `buildClip` and `buildRulesClip`,
from real nodes out of the engine's own export fixture (`creator-hub-bundle.sse.zip`), by
`tests/clipFixtures.test.ts` — which also asserts their shape, so a committed file here can never
drift from what the hub actually emits. A hand-written fixture is a guess at what arrives, and a
paste target built against a guess passes its own tests and fails on the first real clipboard.

Only the custom rules are invented, because no real save on hand has any.

**Paste each one as text.** The clip is what the Copy control puts on the clipboard.

---

## The cast

One planet (**Bellwether**) with a moon and two ships beneath it. Bellwether's hydrosphere names a
liquid called `unobtainium`, which is the thing the paste has to resolve.

The rules carry three definitions, chosen to cover the three shapes: `liquids` (a list keyed by
`name`), `engineDefinitions` and `fuelDefinitions` (lists keyed by `id`).

---

## 1. `1-body-with-rules.json` — the whole point

A body that needs a custom liquid, with the rules that define it.

**Expected:** Bellwether and everything under it pastes. `unobtainium`, `q-drive` and `dt-slush` are
added to the destination campaign's own overrides. **Bellwether's hydrosphere resolves** — its phase,
appearance and climate are right rather than falling back.

The report says what came with it.

**This is the bug being closed.** Without the merge, the paste succeeds, the lookup returns
`undefined`, and the planet is quietly wrong in a way the person who pasted it cannot see.

---

## 2. `2-same-clip-again.json` — the duplicate, which is the ordinary case

Byte-identical to clip 1. Paste it **immediately after** clip 1, into the same campaign.

**Expected: nothing is added, nothing is renamed, nothing is duplicated.** Silently.

The owner's own requirement: *"the receiving end needs to identify duplicates to what it had and
discard (i.e. a related object pasted before)."* This is not an edge case — paste a star, then paste
one of its planets, and every rule the second clip carries is one the first already brought.

The objects themselves are a separate question and this asks nothing about them: whether pasting the
same planet twice gives two planets is the existing behaviour, unchanged.

---

## 3. `3-same-rules-shuffled-keys.json` — the key-order trap

The same three definitions, with the fields of the liquid written in reverse order
(`colorHex, boilK, meltK, label, name` instead of `name, label, meltK, boilK, colorHex`).

**Expected: identical to clip 2 — a duplicate. Nothing added, nothing renamed.**

**This is the one a reasonable implementation gets wrong.** JSON key order is decided by whatever
built the object — a different engine version, a hand-edited save, a round trip through a database —
so comparing the raw text reports an ordinary duplicate as a conflict and renames something that
needed no renaming. Compare canonical form: object keys sorted recursively, **array order left
alone** (a pigment's `bands` are a sequence; the fields of a band are a set).

The hub's `canonical()` in `src/lib/bundle/overrides.ts` is four lines and does exactly this.

---

## 4. `4-conflicting-liquid.json` — the one that must not be got wrong

A **different** liquid under the same name: `unobtainium` again, but `boilK` 140 rather than 90, a
different melt point and a different colour. Paste after clip 1.

**Expected: the destination's own `unobtainium` is NOT touched.** The incoming one is renamed —
something like `unobtainium (from Contract Reach)` — and **the pasted body is repointed at the new
name**, so it gets the liquid it was authored with. The report says a rename happened and why.

Overwriting here would silently change **bodies the destination already had**, turning a quiet wrong
answer on one pasted planet into a quiet wrong answer across a whole campaign. Asking instead of
renaming is also fine; overwriting is not.

---

## 5. `5-rules-only.json` — a clip with no objects in it

`nodes: []`, no `root`, one liquid. This is what the hub's `/rules` library puts on the clipboard.

**Expected:** the liquid is merged. **No body, moon or ship is created.** The report says one liquid
arrived.

`hubClip.ts` refuses anything that is not a hierarchy today, which is correct for a map clip and
wrong for this one. Empty `nodes` with no `root` is how the two are told apart — deliberately not a
second marker, because a second marker is a second thing to keep in step.

---

## 6. `6-no-rules.json` — the regression check

The same subtree with no `rulePackOverrides` key at all — what every clip looked like before R-19.

**Expected: exactly today's behaviour.** Nothing merged, nothing reported, no mention of rules
anywhere. If this one changes, the change has reached clips it had no business reaching.

---

## 7. `7-unknown-future-key.json` — a key this hub has never heard of

The three definitions plus `somethingTheEngineAddedLater`.

**Expected: not a refusal.** Whatever the engine understands, it merges; what it does not, it
ignores. The hub stores and relays overrides **whole** precisely so a new engine key works without a
hub release — it deliberately does not filter to a list of keys it knows, because that list would go
stale the day the engine added one.

---

## The three outcomes, in one table

| the destination | what should happen | which clip |
|---|---|---|
| does not have it | **add it** | 1 |
| has it, identical | **discard, silently** | 2, 3 |
| has it, **different** | **never overwrite** — rename and repoint | 4 |

---

## After you have run them

The hub's half needs nothing changed for any of this, so a report of what happened is all that comes
back. If a clip is the wrong shape for what the paste wants, say so and the hub will change what it
emits — it is much easier to move than the paste is.

Worth knowing: **no real map on the hub has custom rules yet**, verified against three real starmaps
in the engine repo, all of which have no `rulePackOverrides` key and an empty `temporal_registry`.
That is B112 working as intended. So these fixtures are, for now, the only clips of this kind in
existence — which is exactly why they are generated rather than typed.
