# Moderation, operationally

How the pieces in `creator-hub-design.md` §6 actually fit together in this codebase, and what an
admin does day to day.

---

## The one property everything rests on

**A verdict is stored against a sha256, not against an upload.**

```
assets (sha256 PK) ──► review_state: novel | approved | banned
```

Consequences, all of which fall out of that single row:

- the hundredth person to share the same nebula backdrop costs **zero** review
- an approved hash **never re-enters the queue**
- a banned hash is refused at upload, **before anything reaches R2**
- re-uploading under a new filename does nothing — the bytes decide
- **the queue holds only novel images and shrinks as the library grows**

### The limit, stated honestly

This is **exact-byte matching, not perceptual**. Re-saving a banned image at 99% JPEG quality
produces a different hash and a fresh queue entry.

That is a real gap and the correct trade for now. The escalation — *if evidence ever asks for it* —
is a perceptual hash stored **alongside** the sha256 so near-duplicates cluster in the queue. **Do
not build it yet.** Do not let any UI string imply the hub does perceptual matching; it does not.

---

## The two rules that pull in opposite directions

> **An upload is never blocked. An unreviewed asset is never served.**

A hub with a review backlog is a dead funnel, and a hub that serves unreviewed images is the thing
the gates exist to prevent. The ledger resolves both:

| upload contains | what happens |
|---|---|
| only approved hashes | live immediately — after a while, most uploads |
| some novel hashes | live immediately, **those assets withheld**; creator sees "3 images awaiting review" |
| any banned hash | refused, naming the files, before a byte reaches R2 |

**The withholding covers the download.** `src/lib/server/pack.ts` reassembles the zip from approved
assets only and appends a note saying what was left out. The stored upload is **never served raw** —
that would hand out exactly the bytes being withheld.

### How serving works

The R2 bucket is **private**. Every object goes out through `/asset/[hash]`, which checks the ledger
on every request.

- no quarantine bucket
- no copying objects on approval
- approve or ban is a **row update**, effective on the next request
- **revoking something already public is also just a row update** — which is the part a
  copy-on-approve design makes slow and error-prone

The one exception is `/admin/asset/[hash]`, admin-only, because somebody has to see the picture to
judge it. See `decisions.md` D-06.

---

## The review pass

`/admin/review`. Unreviewed hashes only, ordered: **flagged first**, then most-reported, then most-
used, then newest.

The card shows the image **beside the creator's own licence claim**, so one pass judges two things:
is this acceptable content, and is that attribution plausible? A stock photo credited *"my own work,
CC0"* is a different problem from an uncredited one, and only this view makes it visible.

```
A  approve          R  reject: content
C  reject: copyright    S  reject: spam
U  undo last        J / K  move
```

A mouse-driven queue is a queue nobody clears, hence the keys. **Undo matters**: without it the
queue is a one-way door and a reviewer working fast will not work fast. Undo returns the hash to
`novel` and clears the reviewer name — a hash back in the queue has not been reviewed by anybody.

Reject **needs a reason**, because the reason drives what happens next: a copyright rejection is a
note to the creator; a content rejection may be a creator-level action.

Every decision is written with a reviewer and a timestamp, and mirrored into `admin_actions`.

---

## Catching abuse without an image classifier

There is no free, reliable nudity classifier to lean on. The signals that work are behavioural and
cost nothing (`gates.ts` `shouldFlag`):

- **novel-hash rate** — the single best signal. A legitimate map reuses models and carries a handful
  of pictures; an account uploading dozens of never-seen images is the pattern.
- **new account + immediate upload + all-novel assets** — the classic shape.
- **report velocity** against one creator or one hash.
- **attribution quality** — a bundle where everything says "no provenance recorded" is already
  blocked from public by the existing gate, so **the provenance gate is doing moderation work as a
  side effect.** Worth knowing.

**A flagged upload is never blocked. It is moved to the front of the queue.** Same philosophy as
everything else here: never stop the funnel, just look sooner.

Cloudflare Workers AI image classification is worth **evaluating** later as a queue-*reordering*
pre-filter only — never an automatic reject. Cost and accuracy at this volume are unknown and should
be measured before anything depends on it. **Out of scope for launch.**

---

## The gates

All rows in `config`, editable at `/admin/config`, effective on the next request. A limit that needs
a deploy to relax is a limit nobody relaxes.

| gate | default |
|---|---|
| `uploads_per_user_per_day` | 1 — counts **novel hashes**, so updating your own map is close to free |
| `zips_allowed` | true — **the kill switch** |
| `max_bundle_bytes` | 50 MB — also a real Worker memory ceiling (`decisions.md` D-03) |
| `max_assets_per_bundle` | 200 |
| `new_account_cooldown_hours` | 0 |
| `novel_hash_limit_per_upload` | 40 — flags, never blocks |
| `min/max_bundle_format` | 1 / 1 |
| `accept_unstamped_bundles` | false — **open question Q-01** |
| `block_cc_by_breach` | false — **open question Q-02** |

### The kill switch is real and costs almost nothing

`zips_allowed: false` rejects any upload whose bytes are a zip. That collapses the entire abuse
surface to **text** — names, descriptions, notes — which is a far smaller moderation problem, and
**the hub keeps working**, because the engine guarantees a plain `.json` save still loads and always
will. Implementation is one `isZip()` check.

---

## Account deletion, and the thing people forget

Not yet built; the schema is ready for it. Two rules, both from §7.2:

1. **Refcount before deleting bytes.** `asset_refcount(sha256)` counts `system_assets` rows. A
   content-addressed object must not be deleted because one creator left, while another creator's
   map still references it. `r2.deleteIfUnreferenced` enforces this.
2. **A verdict outlives the account.** `assets.reviewed_by` is `on delete set null`, never cascade.
   Delete bytes; never delete verdicts — **or a banned image returns the moment its uploader deletes
   themselves.**
