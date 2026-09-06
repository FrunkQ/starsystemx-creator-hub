# Handover: the Creator Hub, evening of 2026-09-06

Written at **v0.34.0**, live at **https://explorers.starsystemx.com**. This continues
`docs/handover-2026-09-06.md` (still the START HERE for the standing rules, the file map and the
traps) and covers one long day: **0.19.2 to 0.34.0**, decisions **D-36 to D-55**.

**The owner's next instruction, in his words: "set up the discord bot next."** That is the first
section below.

---

## Read these, in this order

1. `docs/handover-2026-09-06.md` — the standing rules from the owner. Unchanged and still binding:
   never edit the SSE repo; commit as `FrunkQ <frunk@frunk.net>`; stage files by name; green
   (`svelte-kit sync`, `vitest run`, `svelte-check --threshold error`, `npm run build` with a real
   exit check) before every push; a push to `main` IS the deploy; bump the version and add a
   CHANGELOG entry on every push; record decisions as the next D-number; secrets never in a file.
2. `docs/decisions.md` **D-36 to D-55**. Today's reasoning, and several of them are traps.
3. `docs/sse-requirements.md` — the hub's half of the SEAM PROTOCOL (D-37). Read the header.

---

## 1. THE NEXT JOB: the Discord bot

The owner made a role called **Explorers** for "anyone who uploads a map", and asked whether it can
be granted automatically. **It can, and the code is already written — none of what follows is new
development.** What is missing is the bot itself.

**How it already works.** The **Cartographer** badge is earned by having one public map
(`src/lib/badges.ts`: `earned: (f) => f.maps.length >= 1`). D-34 maps any badge to any role, and
`integrations/badges.ts` `reconcile` queues an add when a badge is earned and a **remove when it is
lost** — a map unpublished or taken down. Keep that symmetry; a role attached to content that no
longer exists stops meaning anything.

**The steps** (`docs/integrations.md`, "Turning it on"):

1. Create the application, add a bot, invite it with **Manage Roles** only.
2. **The bot's own role must sit ABOVE Explorers** in the server's role list. Discord refuses
   otherwise and the error is unhelpful. This is the single most common way it goes wrong. The
   owner's role list, seen 2026-09-06: Developer, Moderator, Ko-fi Bot, Gunfella, MoveBot 1.5,
   **Explorer Manager**, Explorers, @everyone — so if "Explorer Manager" is the hub's bot it is
   already above and this is fine. Check before assuming.
3. Secrets: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` via
   `wrangler secret put`. The OAuth redirect for `explorers.starsystemx.com` is **already
   registered** — the owner did it 2026-09-06.
4. On the Gates page: `discord_enabled` → `true`, `discord_guild_id` (already `1443167899933212744`),
   and `discord_badge_roles` → `{"cartographer": "<the Explorers role id>"}`.
5. Members link their Discord on `/account`, then the outbox delivers on the fifteen-minute cron.

**The sharing webhook needs none of this** and already works — the owner confirmed a published map
posts to the channel. `discord_share_enabled` (D-51) turns those posts off for testing **without**
clearing the webhook, and is checked at the ENQUEUE so nothing piles up behind it.

---

## 2. WHAT WAS HALF-DONE - finished now, and the follow-up declined

**A credit typed on the manage page does not reach the downloaded file (D-55).** Today a creator can
fix a blocked publish in place — who made the picture, the licence, the source — and it satisfies
the gate and shows on the map page. But the credit lives on the NODE in the save
(`node.image.credit`, `node.model.credit`), the download is reassembled from the stored bytes, and
nothing writes back. **The owner asked for this explicitly:** *"that is then written back to the
file for publication as this is the first time the user is challenged."*

What it needs: read the stored bundle (`r2.getBundle`), patch every node whose image or model is
that hash, regenerate `ATTRIBUTIONS.md`, re-zip, store. The reader is `bundle/attribution.ts`
`collectAttributions` — patch the same fields it reads, or the two will disagree.

**BOTH SETTLED, evening of 2026-09-06. Do not rebuild either.**

**The write-back is DONE (D-62)** - and NOT the way the paragraph above proposes. It is applied at
PACK TIME, in `creditDownload` (`server/pack.ts`) over the pure `bundle/credits.ts`, and the stored
bundle is never touched: the stored bytes are the evidence the attestation was made about,
`asset_claims` is already the truth the gate reads, patching on the way out cannot drift, and it
costs no extra CPU because the download already unzips and re-zips.

**"Bin an asset" is DECLINED (D-64).** The owner: *"forget it - let them just be forced to add the
attributions."* The gate already forces it, and the way out for a picture nobody can credit is to
take it off the object in the app and upload the new version - which the blocked-publish notice now
says out loud. The trap that made binning expensive is kept in D-64 in case the question comes back:
deleting the `system_assets` row does NOT withhold the picture, because `packForDownload` treats a
zip member with no matching row as *"not a tracked asset: these always travel"*.

---

## 3. The traps this day added. Each cost real time.

- **D-47. SvelteKit refuses a `default` form action beside named ones — as a 500 at REQUEST time.**
  No build error, no type error, no warning. The Gates page grew its first named action in 0.18.0
  and **every button on it threw for a fortnight**, including the Set that had worked for weeks.
  `tests/actions.test.ts` now refuses the combination across every `+page.server.ts`.
- **D-48. A plain `.json` upload has no filename, and `openBundle` used to assume `starmap.json`** —
  so every bare-JSON upload was labelled a campaign. The kind comes from the DOCUMENT now
  (`detectKind`: `systems` = starmap, `nodes` = system). Rows already stored wrong come right with
  **Re-index**, not a re-upload.
- **D-53/D-54. Decoding a picture is the most expensive thing this Worker does.** Measured: 168 ms
  for a 4.9 MP PNG, 74 ms for 2.0 MP, against a free plan's **10 ms of CPU**. Going over is a 1102,
  not an error page. The owner chose to stay free — *"i dont wanna be on the hook for any runaway
  cost"* — so **the browser prepares the picture** and posts RAW RGB to `/api/cover/fit`. Raw, never
  a PNG: a PNG would have to be decoded at the far end, which is the cost being avoided.
  `cover_server_decode` (0033) gates the Worker's own decoder OFF and should stay off.
- **D-50. `mail_from` must be on the domain VERIFIED with Resend** — `starsystemx.com`, not the
  hostname the hub is served from. A verified domain does not carry its subdomains.
- **D-49. The password-reset test proves Supabase Auth's SMTP, not the hub's ability to send.** They
  are different paths and there are two test buttons for that reason.

---

## 4. What is live now that was not this morning

- **Mail (D-49, D-50, D-52).** The hub sends through Resend as `keeper@starsystemx.com`.
  `RESEND_API_KEY` is set. Live: the takedown **contact form** (offered beside the address, never
  instead — a broken form must not be the only way off that page), a **review-queue nudge** on the
  cron, and **comment digests** with their own clock (`comments_mailed_at`, 0032 — reading the page
  and being told about it are different questions). Sends are counted from the outbox against
  Resend's free plan on `/admin/stats`; **the daily 100 is the line that bites**.
- **Moderators (D-39).** `creator_role` gains `moderator`: tag review, review, comments, reports,
  explorers. Running the place stays admin. The line is whether it can be UNDONE, so deleting an
  account and handing out the role stay the owner's, inside a page a moderator otherwise reaches in
  full. Granted on an explorer's page. **Nobody holds it yet.**
- **The audit log (D-42)** at `/admin/log`, admin only — filter by who, by what, or "only what a
  moderator can do".
- **Custom tags (D-40).** A "+" on every group; proposals wait for review; `/admin/tags` shows fuzzy
  near-matches as one-click swaps. Accepting merges into the vocabulary at read time — no deploy.
- **Game system and Rules style** tag groups.
- **Creators can delete their own map (D-45)**, and there is one cover picker (D-44), two new
  letterforms (D-46), a crop slider (D-54), and the chrome work of D-38/D-43/D-51.
- **The DNS moved (D-41):** `explorers.starsystemx.com` is the address the hub gives out. The
  cutover cost one constant in `src/lib/addresses.ts`, which is still the only file holding an
  address. Keep it that way.

**Migrations 0001–0033 are ALL RUN.** Nothing pending.

---

## 5. Open, and whose

**The owner's:** the Discord bot (above). The three containment decisions in
`docs/containment-design.md`. Collections, still recommended and still awaiting a yes.

**The engine's:** **R-18** — `?open=` refuses a single system, so the hub hides the button for one;
`docs/prompt-for-sse-2026-09-06.md` is written and ready to hand over. Also R-07's surface and R-04,
parked on the hub's pairing endpoint.

**Yours:** the write-back is done (D-62) and binning is declined (D-64) - see section 2. Then: the first upload carrying a pasted clip, end to end
(R-14/R-16); search over descriptions when the library needs a text index.

**Ready for STREAM N N-1 and N-3** — both halves are in place and neither has been walked.

---

## 6. How the owner works, confirmed over a long day

Short, direct notes, often with a screenshot, and frequently two or three at once. **He wants a
recommendation before a question.** He will tell you when something is ugly or does not work, and he
is usually right about the cause even when he is describing a symptom — *"I think the add as cover
does not go there"* and *"it needs to be pinned there"* both pointed at the real problem.

**The most useful thing done all day was measuring before changing.** The 1102 looked like a bug in
the cover designer and was a CPU budget an order of magnitude out; the mail failures looked like
Discord and Resend and were one SvelteKit rule. Two of the day's tests were written to catch a fault
that had just been found, then caught a second nobody had noticed — the O and the 0 drawn identically
in both new alphabets, and my own test asserting the wrong crop axis. Write the test that would have
caught it; it tends to catch the next one too.
