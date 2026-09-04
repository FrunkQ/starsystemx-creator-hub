# For the SSE stream: push on with the paste UI, then R-16 (credit on paste), then R-13

From the Creator Hub side, 2026-09-04, hub v0.11.0. Full text in the hub repo's
`docs/sse-requirements.md` (R-16 is new; R-14's status note records what you shipped).

## The sequencing question

**Paste UI first, R-13 after.** R-13 bites less than it did: since B112 a new save omits the
shipped registries, so the hub's hand-copied baselines only matter for files written before
v3.0.225, and they are currently correct. App artwork is told from uploads by path prefix and that
has not failed on a real file. The paste UI closes a loop users can see; R-13 closes one only the
maintainers can. Reasoning recorded under R-13.

On your two asymmetries: both fine by the hub. A construct root getting the plain attach is right
for something placed in "Low Orbit"; no need to raise the G64 extension with stream J on the hub's
account. Standing a pasted ship's autopilot down and tagging it is rule 5 done properly.

## R-16: a pasted clip carries its credit as an ATTRIBUTION, not only a tag

Owner: *"on cut and paste are we pushing through attributions with it to store on the map they
create? If not we need to engineer that in."* `origin/hub` is a breadcrumb, not a credit.

**The hub now sends `creator`** in the clip's `source`, beside `site`, `url` and `title`:

```jsonc
"source": { "site": "StarSystemX Explorers", "url": "https://…/s/local-neighbourhood",
            "title": "Local Neighbourhood", "creator": "frunk" }
```

**On paste, please:**

1. Append a content credit to the CAMPAIGN (not the node - nodes get deleted and renamed):
   ```jsonc
   "contentCredits": [ { "title", "creator", "url", "site", "pastedAt", "nodeIds": [ ...new ids ] } ]
   ```
   One entry per paste. Keep the `origin/hub` tag too - it says which body came from where.
2. Print it in `ATTRIBUTIONS.md` under *"Content from other cartographers"*: title, creator, link.
3. Carry it through save and load like any campaign block.
4. If `creator` is absent (older hub), credit title and url and say "cartographer not recorded".

**What the hub does with it:** reads `contentCredits` on upload (already built, 0.11.0, migration
0018) and shows *"Includes work from Local Neighbourhood by frunk"* with the link on the map's
page. Credit follows content through as many hands as it passes.

**Addendum (hub 0.12.0) - two more fields, one more line to print.** `source.url` is now a DEEP
LINK to the object (`…/s/<slug>#node=<id>`; store it whole, fragment included - the hub's page
opens and lights that row). And when the copied object had itself been pasted in from somewhere,
`source.chain` lists where it was before, deepest first:

```jsonc
"source": { "site": "…", "url": "https://…/s/gamma#node=e2", "title": "Gamma", "creator": "carol",
            "chain": [ { "url": "https://…/s/alpha#node=earth", "title": "Alpha", "creator": "alice" },
                       { "url": "https://…/s/beta#node=e",      "title": "Beta",  "creator": "bob" } ] }
```

Record `chain` on the `contentCredits` entry as received and print the lineage in
`ATTRIBUTIONS.md`: *"from Alpha by alice, via Beta by bob, via Gamma by carol"*. The hub then shows
the lineage on the page and lists every cartographer in it, and the original map's page lists
"Used in". Full text: R-16 addendum in the hub's `docs/sse-requirements.md`.

## One hub-side thing you may notice in clips

The clip now keeps app-shipped models and images (`/models/nasa/iss.glb` with its NASA credit,
`/images/star_types/G.webp`) and remote urls; it strips only bundle-carried assets and data: urls.
Nothing to do on your side - your reader already leaves unknown fields alone.

## Small objects (hub-side only, for your information)

The hub now shows a planet or moon under 1e20 kg (or under 250 km radius when mass is missing) as
a **small object** - asteroids modelled one by one, moonlets, sub-moons - so a detailed belt reads
as "412 small objects" rather than "412 planets". The engine's `roleHint` is untouched in the
save and in clips; this is the hub's display axis. If the engine ever grows its own role for these,
say so and the hub will read it instead of inferring.
