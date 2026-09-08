# For the SSE stream: a hub clip now carries the custom rules its objects need

From the Creator Hub side, 2026-09-08, hub **v0.49.0**. This is R-19 in
`docs/sse-requirements.md`. **The hub's half is shipped and live**; this is the other half, and it
is the half that does the interesting work.

---

## The bug this closes, which is not a missing feature but a wrong answer

Custom definitions do not live on the node. They live on the starmap, in `rulePackOverrides`, and
the app builds an effective pack of shipped-plus-overrides. A hub clip carries **nodes only**.

So today, when somebody copies a planet whose hydrosphere names a GM's custom liquid:

```ts
// src/lib/physics/liquids.ts
export function liquidDef(name: string | undefined, pack?: RulePack | null): LiquidDef | undefined {
  return allLiquids(pack).find((l) => l.name === name);      // undefined
}
```

**The paste reports success.** The body arrives, the lookup misses, and everything derived from that
liquid — phase, appearance, climate — quietly falls back to a default. Not a crash, not a warning: a
planet that is subtly wrong in a way the person who pasted it has no way to notice. `hubClip.ts`
does not mention overrides today, so this is silent for every one of them: liquids, gases,
atmosphere mixes, pigments, morphologies, fuels, engines, sensors.

The owner, asked how he wanted this handled: *"1 and 2 should ride on the back… i.e. the site has a
browse option for all these custom overrides… and they can be copied and pasted in using the
mechanism from 1."* So there is **one mechanism and two producers** — and the second one is already
built and live, which is why this is worth doing now rather than later.

---

## What arrives

`SseClip` gains one optional key. **Nothing else about the envelope changed**, and an engine that
ignores the key behaves exactly as it does today — no version break, no coordination needed.

```jsonc
{
  "sseClip": 1,
  "source": { "site": "…", "url": "…", "title": "…", "creator": "…" },
  "root": "<id>",                    // ABSENT on a rules-only clip
  "nodes": [ /* … */ ],              // EMPTY on a rules-only clip
  "rulePackOverrides": { /* … */ }   // NEW, optional
}
```

`rulePackOverrides` is **your `RulePackOverrides`, whole and unmodified**, under your own name, in
your own shape, straight out of the source map's save. Absent when the map customises nothing, which
is most of them.

**Two producers, one envelope:**

| | `root` | `nodes` | `rulePackOverrides` |
|---|---|---|---|
| a map clip | present | the subtree | present when that map has any |
| a rules clip (`/rules`) | **absent** | **`[]`** | exactly one customisation |

Empty nodes and no root is how a reader tells them apart — deliberately not a second marker, because
a second marker is a second thing to keep in step.

---

## The ask

**1. Narrow, then merge.** Take from `rulePackOverrides` what the pasted nodes actually reference and
merge it into the destination campaign's own overrides.

**Narrowing is yours, and that is on purpose.** The hub carries the lot rather than working out
which node field points at which definition, because that is engine knowledge that changes whenever
a field is added — a hub that guessed would quietly stop carrying a liquid the day somebody named
one a new way. Same reasoning your coordinator used to decline `rootKind` (D-58): the app has to
check a claim against the nodes anyway, so a second answer is the fault.

If narrowing is more trouble than it is worth for a first pass, **merging the lot is an acceptable
version one** — it is somebody's published campaign rules, not junk, and it is a few kilobytes.

**2. Three outcomes per definition, and only one of them is interesting.** The owner asked for this
one specifically: *"the receiving end needs to identify duplicates to what it had and discard (i.e. a
related object pasted before)."*

| the destination | what to do |
|---|---|
| does not have it | **add it** |
| has it, identical | **discard, silently** — this is the ordinary case |
| has it, **different** | **do not overwrite** |

The middle row is not an edge case: paste a star, then paste one of its planets, and every rule the
second clip carries is one the first already brought.

**The last row is the one that must not be got wrong.** Somebody else's "Liquid Unobtainium" is not
this one, and replacing it would silently change bodies they already had — turning a quiet wrong
answer on one pasted planet into a quiet wrong answer across their whole campaign. Rename the
incoming one and point the pasted nodes at the new name, or ask. Never overwrite.

**3. The comparison has to ignore key order, or it will rename things that needed no renaming.**

`{a:1,b:2}` and `{b:2,a:1}` are one definition and two strings, and JSON key order is decided by
whatever built the object — a different engine version, a hand-edited save, a round trip through a
database. Compare **canonical** form: object keys sorted recursively, **array order left alone**
(a pigment's `bands` are a sequence; the fields of a band are a set).

The hub uses exactly this and the code is four lines — `canonical()` in
`src/lib/bundle/overrides.ts`. It deliberately does **not** ship you a hash to trust, for the same
reason as everything else on this seam: a claim you have to verify anyway is not worth carrying.

**4. Say what came with it.** After a paste: *"added 2 liquids and an engine definition; renamed
Unobtainium to Unobtainium (from Local Neighbourhood) because you already had one."* The hub has
`describeOverrides()` for its own wording if the phrasing is useful.

**5. A rules-only clip pastes nothing but rules.** `hubClip.ts` currently refuses anything that is
not a hierarchy, which is right for a map clip and wrong for this one — a clip with `nodes: []` and
no `root` should merge and report, not refuse.

---

## Not asking for

Any change to `?open=`, `?hub=`, `isTrustedOpenUrl`, or the replace-or-add question. Any new
envelope key beyond the one above. Any change to how overrides are stored — this is your shape and
the hub only relays it.

---

## Two things worth knowing

**The hub reads names out of these, and nothing more.** Enough to list a liquid called "Unobtainium"
on `/rules`: `LiquidDef.name`, `PigmentDef.key`, `EngineDefinition.id`, and the record key for
`gasPhysics`. If those identity fields ever change, the library shows a blank where a name was —
worth a line in a seam report, not worth a coordination dance.

**`tagVocab` is on `RulePack` but not on `RulePackOverrides`.** So a campaign cannot override the tag
vocabulary today, which means a custom tag's *definition* cannot travel even though the tag itself
does (it is on the node and the snippet keeps it). Not asking for anything — flagging it, because
the owner's original list of things to carry included tags and this is the one item that is not
where the others are.

---

## When it ships

Say so and the hub will note it under R-19. Nothing has to change on the hub's side — the key is
already going out on every clip from a map that has custom rules, and `/rules` is already producing
rules-only clips that currently do nothing on arrival.

**Ready for STREAM N** on this one once both halves are in: copy a body with a custom liquid, paste
into a fresh campaign, check the liquid arrived and the body's phase is right; then paste the same
clip again and check nothing is duplicated or renamed.
