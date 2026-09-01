# Direct save and load between SSE and the hub — the spec

**Answers to the SSE agent's questions, and the design for building against.** From the hub side.

Read `sse-integration-spec.md` first for the shape of the relationship; this is the wire detail.

---

## 1. The two questions, answered

### "What origin should the app fetch shared maps from?"

**`https://explorers.starsystemx.com`** — that is the decided default.

**It is not live yet.** Today the hub answers on
`https://starsystemx-creator-hub.orange-tree-847c.workers.dev`, and it will keep answering there
after the move. Use the workers.dev origin to build and test against now.

**Make it a config value, not a constant** — the owner's instruction, and he is right: there will be
more than one transition. One setting, defaulting to `explorers.starsystemx.com`, overridable for
testing.

### "Is the device-code pairing endpoint live?"

**No. Nothing exists yet.** `/api/device/*` is not built, and §3 below is the design, not a
description. **Do not build against it until this document says it is live.**

What IS live today:

| endpoint | status |
|---|---|
| `GET /api/download/<slug>` | **live**, no credentials, returns the bundle |
| `POST /api/upload` | built, but needs a session the app has no way to obtain yet |
| everything in §3 | **not built** |

And one thing that would stop an upload even with a token: **the format gate is closed.** Until the
engine ships `bundleFormat` + a fixture (R-01, R-02), every upload is refused with `no-parser-yet`.

### The attestation wording, verbatim

From `src/lib/attestation.ts`, `ATTESTATION_TEXT_VERSION = 1`. **Show this text, unaltered:**

> I made everything in this save, or I have the right to share it, and the credits and licences I
> have recorded are accurate to the best of my knowledge. I understand that maps here are downloaded
> and reused by other people, and that if a claim is made about this map I am the person responsible
> for it.

And the note beneath the checkbox:

> We take you at your word. Nobody here can check who really made a picture, so the hub runs on trust
> - and on people crediting the artists whose work they use.

**Do not pre-tick it, do not reword it, and do not summarise it.** The hub stores the exact text
alongside the answer, so an old record still says what was actually agreed to. If the app shows
different words to the ones stored, that record stops meaning anything.

**Better still: fetch it** rather than copying it — see `GET /api/attestation` in §4. Then a wording
change never leaves the two out of step.

---

## 2. Loading: browsing the hub from inside the app

Everything the hub serves today is server-rendered HTML, which is right for the web but useless to
the app. **The hub will add a small JSON API.** Not built yet; specified here so the app can be
written against it.

```
GET /api/maps?q=&tag=&sort=loved|new&page=1
GET /api/maps/<slug>
GET /api/download/<slug>          ← already live
```

`GET /api/maps` returns what the browse page shows — title, blurb, cover hash, counts, pills, hearts,
downloads — plus `slug` and `updated_at`. `tag` repeats for multiple filters, and narrows (AND), the
same as the website.

**No credentials on any of these. Ever.** One click and no account is the entire point, and it must
be as true in the app as it is on the web.

Cover images are at `GET /asset/<sha256>` — also open, also uncredentialed, and served only when the
image has passed review.

---

## 3. Saving: device-code pairing

**Recommended and specified here; needs the owner's yes before it is built.** The alternative is an
OAuth redirect, which needs a loopback listener or a custom scheme and is more moving parts for the
same result.

### Why this shape

The app never sees a password, never embeds a browser, and the person approves in a place where
they can already see who they are signed in as. It is how a television signs into a streaming
service, and people already understand it.

### The flow

```
1. app  →  POST /api/device/start
           { "client": "sse", "version": "3.0.190" }
   hub  →  { "device_code": "<64 hex, the secret>",
             "user_code": "WXYZ-1234",
             "verification_url": "https://explorers.starsystemx.com/link",
             "expires_in": 600, "interval": 5 }

2. app shows WXYZ-1234 and the URL. Person opens it in any browser, signs in, types the code,
   sees exactly what they are approving, and confirms.

3. app  →  POST /api/device/poll   { "device_code": "..." }   every `interval` seconds
   hub  →  202 { "status": "pending" }        keep waiting
           429 { "status": "slow_down" }      double the interval
           410 { "status": "expired" }        start again
           200 { "token": "...", "handle": "frunk", "expires_at": null }
```

### Rules the hub will enforce, and the app should expect

- **`device_code` is the secret; `user_code` is not.** The short code is for a human to type and is
  useless on its own — approving it requires a signed-in browser session.
- **`user_code` avoids ambiguous characters** (no `0`/`O`, no `1`/`I`/`l`). Eight characters,
  hyphenated for reading aloud.
- **Ten-minute expiry, and single use.** An approved code cannot be polled twice.
- **Polling faster than `interval` gets `slow_down`.** Respect it; the hub will start refusing.
- **The token is hub-issued, not a Supabase session.** It is scoped to publishing, it cannot change
  the account's email or password, it is listed on `/account` with the device name and last-used
  date, and **the person can revoke it there.** A leaked app token must never be a lost account.
- **Store it as securely as the platform allows**, and treat a `401` as "revoked" — discard it and
  re-pair rather than retrying.

---

## 4. Saving: the upload itself

```
POST /api/upload
Authorization: Bearer <token from §3>
Content-Type: multipart/form-data
```

| field | required | notes |
|---|---|---|
| `bundle` | yes | the save file, `.sse.zip` or plain `.json` |
| `attest` | **yes** | `on`. Absent = refused. See §1 for the wording |
| `replaces` | no | the hub `systemId` this updates. Comes from the `hub` block in the file |
| `stripGm` | no | `on` = "take the GM material out for me" |
| `confirmGmTree` | no | `on` = "publish it including GM notes", after the hub warned |

Also available:

```
GET /api/attestation   →  { "version": 1, "text": "...", "note": "..." }
```

**Fetch this and show what it returns.** No credentials. It is the one way the app and the hub
cannot drift.

### The responses that matter

```jsonc
{ "ok": true, "systemId": "…", "mayPublish": false,
  "missingProvenance": ["assets/images/n17.jpg"],
  "withheldCount": 3, "gmContent": [], "autoTags": [...],
  "resave": { "worthResaving": false, "reasons": [] } }
```

- **`mayPublish: false`** — uploaded fine, but **cannot be published** until every asset has a source
  recorded. `missingProvenance` names them. **Say so in the editor, where those fields are** — that
  is a far better place to fix it than a web form, and it is the single biggest thing the app can do
  that the website cannot.
- **`code: "gm-content"`** — the hub found GM notes, hidden objects or secret tags, and `detail` says
  what. Offer three things: re-export the player version, let the hub strip it (`stripGm`), or
  publish everything deliberately (`confirmGmTree`). **Never default to the third.**
- **`code: "no-parser-yet"`** — the format gate. Expected until R-01/R-02 land.
- **`code: "banned-asset"`** — contains an image previously removed. `detail` names the paths.
- **`resave.worthResaving`** — the file would gain from being saved in a current SSE. A suggestion,
  never a fault; only shown after a *successful* upload.

### Two things the hub will not trust, so the app need not try

- **`hub.systemId` is a claim.** It says which entry you mean to update; ownership is checked
  server-side against the token. A file claiming someone else's map is refused.
- **The path hash on a model is a claim.** The hub rehashes every asset. A mismatch is refused as a
  damaged save.

---

## 5. What the hub owes, and in what order

1. `GET /api/attestation` — trivial, and it removes the copy-paste risk immediately.
2. `GET /api/maps` and `/api/maps/<slug>` — in-app browsing.
3. `/api/device/*` and the `/link` approval page — **pending the owner's yes on §3.**
4. Token management on `/account` — list, name, last used, revoke.

**1 and 2 need no decision and can be built now.** 3 and 4 wait on the owner.

## 6. What the engine owes for any of this to be useful

- **R-01 / R-02** — the `bundleFormat` stamp and a fixture. Until then every upload is refused.
- **R-05** — `?hub=<slug>` open-on-startup, which needs only the already-live download endpoint.
- **The `hub` block** stamped on open (`sse-integration-spec.md` §2), so "update my map" works
  without the person hunting for their own entry.
