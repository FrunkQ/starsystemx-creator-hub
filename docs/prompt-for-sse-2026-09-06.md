# For the SSE stream: R-18, `?open=` should take a single system too

From the Creator Hub side, 2026-09-06, hub v0.20.0. Full text in the hub repo's
`docs/sse-requirements.md` under R-18. Small, and it is the second half of something you have
already built rather than a new thing.

**First: thank you, both of the last two landed and both are in use.** R-17 (`?open=`, beta
v3.0.314) and R-13 (`shipped-content.json`, beta v3.0.315) are wired into the hub as of 0.20.0. The
hub's hand-copied lists of what SSE ships are deleted; it fetches the manifest and caches it. Two
findings from wiring them up are at the bottom of this file and are worth your minute.

## The ask

`openHubBytes` in `src/routes/+page.svelte` refuses anything that is not a starmap:

```
if (classified.kind !== 'starmap') {
  hubProblem = 'That link points at a single system rather than a campaign. Download it from the
                hub and open it with Load System.';
  return;
}
```

**The hub hosts both kinds, and the single system is the more common upload.** One interesting
star system is a Tuesday evening's work; a campaign is a project. So most of the library's maps
carry a button saying "Open in Star System Explorer" which, clicked, opens the app and then
explains that it will not open the map. The words are good. The moment is wrong — it is after a
click on a promise.

**Nothing is broken today:** the hub now hides the button for a single system (`src/lib/openInSse.ts`).
This is a request to give it back.

**What we would like:** when `?open=` classifies as a system, hand it to the app's own Load System
import path and let that path ask whatever it already asks — add to the open campaign, or open it
alone. The answer should come from the importer, not from a refusal in the link handler.

**Not asking for:** any change to `?hub=`, to `isTrustedOpenUrl`, or to the replace-or-add question.
Only the classification branch.

**When it ships,** say so and the `kind !== 'starmap'` line comes out of the hub with its test. The
hub cannot detect this from outside.

## Two findings from wiring up what you shipped

### 1. `explorers.starsystemx.com` does not reach the hub — the allow-list is fine, the DNS is not

Measured 2026-09-06:

```
GET https://explorers.starsystemx.com/api/download/local-neighbourhood
  -> 404, Server: Vercel, X-Vercel-Error: DEPLOYMENT_NOT_FOUND

GET https://starsystemx-creator-hub.orange-tree-847c.workers.dev/api/download/local-neighbourhood
  -> 200, access-control-allow-origin: *, x-hub-version: 0.19.2
```

**Nothing for you to change** — having the name on the allow-list ahead of the cutover is exactly
right, and it means the DNS can move without an engine release. It is flagged because R-17's worked
example uses that host, and anybody building a test URL by copying the example will get a 404 that
looks like an engine fault. The hub's own `site_url` row is deliberately left unset so the download
URL is built from the origin that actually answers.

### 2. The download is not always a `.sse.zip`

R-17's text says the download returns the `.sse.zip` bundle. It returns the bundle **reassembled
from approved assets** — a `.sse.zip` when the map carried assets, and the plain `.json` document
when it did not, because an assetless save has nothing to withhold and nothing to repack. Your
classifier takes both, so this has never been a problem; the requirement's wording was simply
narrower than the behaviour, and both documents now say so.

### And one note on the manifest, for whoever edits it next

`appAssetPrefixes` is the field that replaced the hub's path-prefix matching, so **a new artwork
directory has to be added there** or its contents will read as a creator's own upload. The hub also
treats a list the manifest does not carry as UNKNOWN rather than empty, and skips the facet that
needs it — so removing a list is safe, and shipping an empty one means "we ship none of these".
