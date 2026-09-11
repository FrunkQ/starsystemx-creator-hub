# For the SSE stream: the hub's map list, for a panel inside the app

From the Creator Hub side, 2026-09-11, hub **v0.56.0**. This is **R-20** in
`docs/sse-requirements.md`.

The owner: *"We need to have closer integration between SSE and explorers site — and use it to host
the default files. eg: a small API that can provide a compact list of star systems in Explorers as a
list INSIDE SSE to single click and load. I will work out the SSE side BUT we need the ability for
SSE to hook into — thumbnail & key data & url. Be able to get them 10 at a time sorted by latest,
most popular, most comments, etc. I just need an interface definition for SSE."*

**Here is the interface. It is live now** — nothing is waiting on the hub.

---

## The endpoint

```
GET https://explorers.starsystemx.com/api/maps
```

**No credentials, ever.** Browsing and downloading the hub never need an account, in the app exactly
as on the web. `Access-Control-Allow-Origin: *` is set, and `OPTIONS` is answered, so a browser
fetch from the app works with `credentials: 'omit'`.

Cached for 60 seconds at the edge.

### Query parameters

| parameter | values | default | notes |
|---|---|---|---|
| `sort` | `new` \| `loved` \| `discussed` \| `detailed` | `loved` | latest, most starred, most comments, most written-up |
| `limit` | 1–50 | 30 | **pass 10** for a panel |
| `page` | 1–50 | 1 | 1-based; `page=2` with `limit=10` is items 11–20 |
| `kind` | `starmap` \| `system` | both | see the note on `openUrl` |
| `tag` | repeatable, up to 8 | — | matches the hub's derived pills **or** the creator's own tags; every tag given must match; lowercase letters, digits and hyphens only |
| `q` | text | — | title contains |

`sort=detailed` orders by how much of a map is *written about* — the 0–5 "information" figure below.
It is the hub's own answer to "which of these is worth a GM's evening", and it may be the most
useful default for a panel that is trying to show something good rather than something recent.

---

## What comes back

```jsonc
{
  "maps": [ /* … */ ],
  "page": 1,
  "pageSize": 10,
  "sort": "new",
  "downloadPath": "/api/download/{slug}",   // legacy templates, still honoured
  "coverPath": "/asset/{sha256}"
}
```

### One map

The fields worth a panel's attention. There are more on the object — they are the hub's own card
columns and are not part of this contract; **read the ones below and ignore the rest**, because
anything else may change without a version bump.

```ts
interface HubMap {
  slug: string;              // stable forever; the hub's own identifier
  title: string;
  blurb: string | null;      // one line, the creator's own hook
  kind: 'starmap' | 'system';

  url: string;               // the map's page on the hub, absolute
  downloadUrl: string;       // the .sse.zip or .json, absolute — no account needed
  coverUrl: string | null;   // 1200×630 cover image, absolute; null when it has none
  openUrl: string | null;    // opens this map in Star System Explorer; see below

  system_count: number;
  body_count: number;
  construct_count: number;
  hearts_count: number;      // stars
  comments_count?: number;
  download_count: number;
  information: number;       // 0–5: how much of it is written about, 5 = best on the hub today

  auto_tags: string[];       // derived from the file itself
  tags: string[];            // what the cartographer says it is
  updated_at: string;        // ISO 8601

  creator: { name: string; url: string | null } | null;
                             // the name the hub shows on the map's page; url is null until the hub
                             // has public profile pages, and will be absolute when it does
}
```

**Maps that need a fix come last**, in every sort, and carry `needs-a-fix` in `auto_tags` (hub D-88,
D-89). That pill means the hub read something wrong in the file - often something that stops the app
opening it. A panel that only wants maps that will open can leave those out; one that shows them
should say so.

**`coverUrl` is the thumbnail.** It is the picture the hub draws or the creator chose — 1200×630,
and safe to scale down hard; the card designs on the hub use it at about 240px wide.

---

## The one field with a trap in it

**`openUrl` for a single system is "Add System to SSE", and it points at the BETA** (hub 0.62.0, D-92).

Until R-18 it was null for every system, because the engine refused one through `?open=`. The beta
(v3.1.69) now takes a system and offers to place it, so the hub fills the field in - on its own
config row, `add_system_in_sse_url`, which defaults to `https://beta.starsystemx.com/?open=`.
Campaigns keep `open_in_sse_url`, which points at production. **Production (v3.1.48) still refuses a
single system**, so until the owner releases R-18 and moves that row, a system's `openUrl` opens the
beta. The hub labels the button "Add System to SSE"; a campaign's stays "Open in Star System Explorer".

The row can be set to "off", and then `openUrl` is null for systems again - so a panel should still
handle null.

**The credit for an added system comes from `GET /api/maps/<slug>`: `title` and `by`**, which the hub
holds as contract.

---

## Two things this does not do yet, and would happily

**No cursor paging.** `page` is an offset, which is fine at ten a time and this library's size, and
would be the wrong shape at ten thousand maps. Say the word before that matters.

**No "since" parameter.** If a panel wants to poll for what is new, an `updated_after` would be
cheaper than fetching page one and diffing. Not built because nobody has needed it — ask.

---

## Hosting the default files

The owner's larger point — *"use it to host the default files"* — is a bigger conversation than this
endpoint and is **not** answered here. Worth noting the shape of the problem before anybody starts:

- A map on the hub is somebody's, with a creator, a licence and a takedown route. A file the app
  ships as a **default** is the app's, and the two have different rules about being removed. Serving
  a shipped default through the same list would blur that.
- The hub already tells the engine what it ships, in the other direction: `shipped-content.json`
  (R-13) is how the hub knows a calendar is yours and not a GM's. Whatever this becomes should not
  end up as a second, disagreeing answer to "what is app content".

A reasonable first step, if you want one: publish the defaults as ordinary hub maps under a hub
account, and have the panel filter on a tag. That gets the list, the covers and the download path
for free, and keeps "app content" and "somebody's content" distinguishable. **Not doing that unless
the owner says so** — it is his call, not the hub's.

---

## Answering the seam report (hub 0.61.2, 2026-09-11)

- **`tag=` now matches the creator's own tags too**, the same clause /browse uses. A hand-added tag is
  found; `tag=real-astronomy&kind=starmap` returns Local Neighbourhood.
- **`creator` is on every map** - `{ name, url }`, `url` null for now.
- **`default` is settled (hub D-91): only the admin sets it**, from a switch on the map's page. An
  upload's own tags, the creator's tag boxes and tag proposals can neither add it nor take it off, so
  `tag=default` returns exactly the maps the admin chose.

---

## To try it now

```
https://explorers.starsystemx.com/api/maps?sort=new&limit=10
https://explorers.starsystemx.com/api/maps?sort=discussed&limit=10&kind=starmap
```
