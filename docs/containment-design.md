# Containment: systems inside starmaps, and everything above starmaps

**DESIGN — decisions needed before building.** Owner's brief, 2026-08-28: a starmap's contained
systems should be searchable in their own right, parsed for their own constructs, shown as
*"contained in X"*, **not separately downloadable**, and ranked below standalone systems. Plus:
*"we will be extending up soon to star clusters (a starmap now), galaxies, galaxy clusters — so bear
that in mind in architecture."*

That last sentence is the one that shapes everything else.

---

## 1. The shape: a tree, not two special cases

The tempting build is "systems table, plus a contained_systems table". **That is wrong the moment
clusters arrive**, and wrong again at galaxies — each level would need its own table and its own
copy of search, facets, hearts and reports.

What is actually being described is **one containment tree at many scales**:

```
galaxy cluster
└── galaxy
    └── star cluster
        └── starmap
            └── system
                └── (bodies, constructs — already rows)
```

**So: one table of entries, self-referencing, with a `scale`.** A starmap today is an entry at
scale `starmap` with no parent. When clusters arrive, that same starmap gains a parent at scale
`cluster` and **nothing else changes** — not search, not facets, not hearts, not the review queue.

```sql
parent_id  uuid references entries(id)   -- null = the root of an upload
scale      entry_scale                    -- system | starmap | cluster | galaxy | galaxy_cluster
root_id    uuid references entries(id)    -- the upload this belongs to; = id for a root
depth      integer                        -- 0 for a root
```

`root_id` is denormalised deliberately: *"which upload do I download to get this?"* is asked on
every contained-entry page, and it must not be a recursive walk.

### THE RENAME, AND WHY NOW

The table is called `systems`. It already holds starmaps. Under this design it will hold galaxies.
**`systems` becomes actively misleading, and the table currently has ZERO ROWS.**

> **This is the cheapest this rename will ever be.** Today it is one migration and a find-replace
> across a codebase with 84 passing tests. In six months it is a data migration, a deploy window,
> and every future reader wondering why a galaxy is a row in `systems`.

**Recommendation: rename `systems` → `entries` now.** Needs a yes/no — it is structural.

---

## 2. Downloadable is a property of position, not a flag

The owner: *"this does not let the user download a separate system's file (as it would miss a lot of
data) but they can still download the starmap containing it."*

**So downloadability is simply `parent_id is null`** — you can download an upload, and a contained
entry is not one. No flag to set, nothing to get out of sync, and it stays correct automatically
when a starmap acquires a cluster parent.

The contained page therefore shows: everything the system contains, its facets, its pills — and
**one download button, for the map it lives in**, labelled as such.

That is also honest about the reason. A system lifted out of a starmap loses routes, positions and
inter-system context; the hub would be handing out something that looks complete and is not.

---

## 3. Ranking: standalone above contained

*"Always have separately available systems above those parsed from starmaps."*

One `order by depth asc` ahead of the existing sort does it — depth 0 (uploaded in its own right)
before depth 1+ (found inside something). Cheap, and it generalises: at galaxy scale, an uploaded
cluster still outranks one discovered inside a galaxy.

---

## 4. Duplicate Earths — and a warning about "byte-identical"

The owner: *"many versions of Earth — probably each different unless byte identical, in which case
first wins."*

The rule is right. **But be aware how rarely it will fire.**

Two exports of a genuinely identical Earth will differ if they were saved by different SSE builds,
because `appVersion` rides in the file — and possibly on key ordering too. **So byte-identical
catches literal re-uploads of the same file, and almost nothing else.** Expect many near-duplicate
Earths regardless, which the owner has already anticipated.

If real deduplication is ever wanted, the lever is a **normalised** hash: serialise with sorted keys
and volatile fields (`appVersion`, ids, timestamps) excluded, then hash. That would collapse "the
same Earth exported twice, months apart" — which is the case people would actually expect to merge.
**Not proposed for now**; noted so the choice is deliberate rather than discovered.

### The question this raises, which is not technical

If Alice uploads a starmap containing Earth, and Bob's starmap contains a byte-identical Earth,
**"first wins" means the shared Earth entry is Alice's.** Bob's map then links to an entry credited
to someone else.

Three options, and this needs an answer:

| | behaviour |
|---|---|
| **A. First wins, shared entry** | one Earth, credited to Alice, linked from both maps. Tidiest search; odd for Bob. |
| **B. One entry per upload, always** | two Earths, each credited correctly. Noisier search; nobody surprised. **Recommended.** |
| **C. Shared entry, credited to both** | one Earth listing both. Best of both; most code. |

**B is recommended** because the search noise is small (it is one extra row per duplicate) and the
ownership confusion in A is the kind that generates a message the owner has to answer personally.

---

## 5. What contained entries cost

Real numbers, from the Local Neighbourhood starmap: **42 systems, 192 nodes.**

So one upload creates 43 entries rather than 1. That is fine — but it means **the review queue,
hearts and reports must remain attached to the ROOT**, not to contained entries, or a single upload
could generate 42 report targets and 42 heart buttons for content the creator uploaded once.

**Rule: contained entries are searchable and viewable. They are not hearted, reported, or
moderated separately.** Those all resolve to the root.

---

## 6. Versioning an upload

Owner, 2026-08-28: *"A user should be able to version and update their uploads — to provide a new
version (we don't need to keep any historical files; old URLs will point to latest version with an
update warning)."*

**The slug never changes.** `/s/the-hystrine-reach` is always the current version — which is right,
because that URL is what people paste into Discord, and a link that rots is a link that stops
sending anyone to Star System Explorer.

```sql
version        integer not null default 1   -- increments on each republish
version_note   text                         -- "added the outer belt", optional
published_at   timestamptz                  -- when THIS version went up
```

**A versioned URL is accepted and redirects**: `/s/slug?v=2` on a map now at v4 serves the current
page with a quiet notice — *"You followed a link to version 2. This map is now at version 4."* No
historical page, no historical file, just an honest explanation of why what they are looking at is
not what they were promised.

### THE RISK THAT COMES WITH "NO HISTORICAL FILES"

Not keeping old versions is a reasonable call — they are large, and almost nobody wants v1 of
anything. But it means **an overwrite is final**, and that changes the weight of one thing already
asked of the engine:

> `docs/sse-requirements.md` **R-12 (a monotonic revision counter) moves from useful to important.**
> A creator who uploads an older export over a newer one currently destroys the newer one, and with
> no version history there is nothing to restore from. The hub cannot detect that today, because
> nothing in a save says which of two exports is newer.

Until R-12 exists, the hub should at minimum **show what it is about to replace** — "you are
replacing version 3, uploaded 6 days ago, 41 downloads" — so the mistake is visible before it is
irreversible rather than after.

### Updating a starmap rebuilds its contained entries

Systems get added, removed and renamed between versions, so contained entries are **discarded and
re-derived** on each republish.

**That is safe precisely because of §5**: nothing is attached to a contained entry. No hearts, no
reports, no moderation state — those all live on the root. So rebuilding them loses nothing, and
the alternative (diffing contained systems across versions to preserve their identity) would be a
great deal of work to protect data that does not exist.

**The root's own hearts and downloads survive a version bump**, obviously — they belong to the map,
not to a version of it.

---

## 7. Order of work

1. **Rename `systems` → `entries`** — needs the yes/no. Zero rows today.
2. **Add `parent_id`, `root_id`, `scale`, `depth`** and backfill roots.
3. **Ingest creates contained entries** for each system in a starmap, with its own facets.
4. **Search and browse** rank by depth, and show "contained in X".
5. **Contained entry page** — facets, pills, and the parent's download button.
6. **Versioning** — `version`, `version_note`, the `?v=` notice, and the "you are replacing…"
   confirmation.
7. Later, and touching none of the above: `cluster`, `galaxy`, `galaxy_cluster` become legal values
   of `scale`.

Step 7 costing nothing is the whole point of doing steps 1 and 2 properly.
