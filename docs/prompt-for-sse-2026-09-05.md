# For the SSE stream: R-17, open a hub map from a URL

From the Creator Hub side, 2026-09-05, hub v0.19.0. Full text in the hub repo's
`docs/sse-requirements.md` under R-17. Small, self-contained, and it closes a loop a user can see:
a map page on the hub gets an "Open in Star System Explorer" button beside its download.

## What the hub sends

```
https://starsystemx.com/?open=https%3A%2F%2Fexplorers.starsystemx.com%2Fapi%2Fdownload%2Flocal-neighbourhood
```

The parameter name is yours to choose; the hub stores the prefix (`https://starsystemx.com/?open=`)
in a config row and appends the percent-encoded download URL. Tell the hub the exact prefix when
it is live and the button appears; until then it is not shown.

## What the URL returns

`GET /api/download/<slug>` returns the `.sse.zip` bundle, reassembled from approved assets only,
with `access-control-allow-origin: *` on success and on error. A plain `fetch` from
starsystemx.com works today. No CORS work is needed on either side.

## What to build

1. On load, read the parameter.
2. Accept only `https:` URLs on hosts you trust: `explorers.starsystemx.com`, the hub's
   `*.workers.dev` name while it lasts, `*.pages.dev` previews. Ignore anything else with a plain
   message. A URL the app will fetch and load is an SSRF-shaped thing; the allow-list is the
   defence.
3. `fetch` it and hand the bytes to the same bundle import path the file picker uses, so
   provenance, attributions and the format gate behave exactly as for a file.
4. Ask the same "replace or add?" question the picker asks, in the same words. Never auto-replace
   an open campaign because a link said so.
5. Strip the parameter from the address bar once handled, so a reload does not import twice.

## Not asked

Deep-linking to an object inside the map on open. The hub's clip already carries `#node=<id>`;
a second parameter can come later if you want it.

## Sequencing

After the paste UI if that is in flight; before R-13 otherwise. It is an afternoon.
