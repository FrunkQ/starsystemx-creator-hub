# Changelog

## 0.31.0 — 2026-09-06

### Mail is counted against the free plan

Two meters on the usage page: mail today against Resend's 100 a day, and this month against 3,000.
The daily line is the one that bites - a queue nudge, a comment digest and a takedown report can
land on the same afternoon. Counted from the outbox, so it is what was actually sent rather than
what was queued.

### Comment notices by mail

The account page has listed new comments since D-33; they now arrive by mail too, from the same
query. Mail keeps its own clock (migration 0032) because reading the page and being told about it
are different things: somebody who reads the page first is not mailed about what they have seen,
and somebody who never opens it is still told. At most one a day per creator.

## 0.30.1 — 2026-09-06

The hub writes as `keeper@starsystemx.com` - the owner's choice, and the site's own word for the
person running the place. Sending only: nothing arrives at it, which is fine, because a notice to
an admin needs no reply and the takedown form sets reply-to to whoever wrote it.

## 0.30.0 — 2026-09-06

### A switch for the Discord posts

`discord_share_enabled` (migration 0031, default true). Off while testing: the webhook stays where
it is - clearing it works too, but it is a secret, and a switch you need a secret to reverse is one
nobody uses.

Checked when a post is queued rather than only when it is delivered, so turning it back on does not
release a week of test publishes into a live channel at once. The test button still posts, because
that is an explicit press.

## 0.29.1 — 2026-09-06

### The hub knows who you are

"Set mail_admin first" was a fair thing to be annoyed by: the hub already reads your sign-in
address to send the Supabase test. An empty `mail_admin` now means every admin's own address, and
`mail_from` defaults to the verified domain - so `RESEND_API_KEY` is the only thing that has to be
set by hand.

The Gates page has a Mail panel that says who it would write as and to, where that address came
from, and offers one button to pin it into the row so it is explicit and editable.

## 0.29.0 — 2026-09-06

### The hub can send its own mail

The password-reset test proved the Resend credentials and the domain - but that was Supabase Auth
sending one of its own templates, which gives the hub no way to send anything. It now calls
Resend's API directly: one POST, inert until `RESEND_API_KEY` is set as a Worker secret and the
`mail_from` and `mail_admin` rows are filled (migration 0030). With any of the three missing,
nothing is sent, every surface says so, and a queued message waits rather than failing.

### A contact form on the takedown page

The one D-16 refused to build, because the hub could not send mail and "a form that silently fails
is worse than an address". Only that first half changed, so the form is offered **as well as** the
address, never instead. It goes through the outbox, so a claim that does not send first time is
retried rather than lost, and it carries the reporter's address as reply-to - the notice comes from
the hub's own domain and pressing reply reaches them.

### A nudge when something is waiting

Pictures to review, tags to look at, reports still open - mailed to `mail_admin`. Only when
something is genuinely waiting, at most one every six hours, and nothing under half an hour old
counts, because a picture uploaded a minute ago is not a backlog. It rides the existing cron.

The Gates page now has two mail tests, because the two paths break independently: one asks Supabase
to send an auth template, the other is the hub writing a message itself.

## 0.28.0 — 2026-09-06

### A single system is no longer called a campaign

Every plain `.json` upload was labelled a starmap. Star System Explorer exports one system as a
bare `.json`, and the reader takes the kind from the document's filename inside a zip - so with no
filename to read, it assumed `starmap.json`. That one default set the card's label, the tree's
opening depth, and whether the map was offered the "Open in SSE" button the engine refuses for a
single system.

The kind now comes from the document, which was never ambiguous: a campaign has `systems`, a
system has `nodes`. A stripped save is also written under the right name now, instead of a single
system being rebuilt into a `starmap.json`.

**A map already stored wrong comes right with Re-index on its manage page** - no re-upload.

## 0.27.1 — 2026-09-06

### Every button on the Gates page works again

SvelteKit refuses a page that has a default form action beside named ones - "When using named
actions, the default action cannot be used" - and it refuses it as a 500 on the POST, with no
build error, no type error and no warning. The Gates page grew its first named action in 0.18.0,
and from that moment every button on it threw: both test buttons, the engine-manifest refresh, and
the Set that had worked until then. The default action is now named `set`.

So: "Send me a test email" has never actually been pressable, and SMTP is still unproven. A test
now reads every page's actions and refuses the combination.

## 0.27.0 — 2026-09-06

### You can delete your own map

Unpublishing hid a map; the only way to remove one was to delete your whole account. There is now a
delete on the manage page, with the title typed back to confirm: the page, the file, the
screenshots nothing else uses and the stars and comments all go. A banned picture stays banned and
the audit record stays. If you only want it off the site, taking it down is still there and keeps
everything.

### One place chooses the cover

The designer opens with a row of pictures - the card, then every screenshot you have added - and
what you pick is what the preview shows and what gets stored. The separate "Use as cover" button on
each screenshot is gone: two controls did one job, and the preview showed the design either way, so
a working press looked like a broken one. A picture that cannot be used is shown greyed with the
reason rather than left out.

### Two more alphabets

"Round" is geometric - diamond bowls, cut corners, a pointed A. "Narrow" is a three-column alphabet
of its own, not the base squeezed, and fits a title half again as long. The four old choices were
one typeface with three treatments on it, which is why picking one changed so little.

### The upload target is the size of the job

The save-file field was the browser's default "Choose File", small and grey on a page whose whole
purpose is to receive that file. It is now a drop zone you can click or drag onto, and it says
which file it is holding.

## 0.26.0 — 2026-09-06

### The cover editor, on the owner's notes

**Outlined is outlined.** It painted its halo in the background colour, on the background, so it
did nothing visible at all; now the letters are hollow - the ring in the text colour, the body in
the colour behind it.

**The domain sits under what is in it**, left-aligned, so the two read as one block instead of
sitting at opposite ends of the card. The QR keeps its corner, and is now drawn first so a long
counts line is set smaller rather than running under it.

**The QR is on by default** - a card without one is a picture; a card with one is a way back to the
map. A creator who turned it off keeps it off.

**Green screen is one colour now.** The palette reached the words and left the map's blues and
oranges alone. Every element colour goes through the phosphor: luminance onto a green ramp, so a
gas giant still reads differently from a moon and both are green. The QR keeps its white, because
it has to scan.

### The number circle clears

Clearing the review queue left the (1) sitting in the banner. The review page decides by fetch
rather than a form, so nothing re-ran the count; it now invalidates just that one load - the badge
refreshes without re-fetching the queue.

## 0.25.0 — 2026-09-06

### The log

`/admin/log` - every action a person with a role has taken, newest first, admin only. Nothing new
is recorded: `audit.record` has been called on every staff action since the first migration, and
this is somewhere to read it. Filter by who, by what (moderation, tags, accounts, running the
place), or by "only what a moderator can do". An action whose actor has since been deleted shows as
"a deleted account" - what was done outlives whoever did it.

### The Gates page says what Supabase needs

The "Send me a test email" button now shows the exact URL its link comes back to, so it can be
copied into Supabase's redirect allow-list rather than retyped.

## 0.24.0 — 2026-09-06

### The hub answers to its own name

`explorers.starsystemx.com` serves the hub, so that is the address it gives out: Open Graph tags,
the QR code on a generated cover, every "Open in SSE" download URL, the sitemap and the feed. The
cutover was one constant in `src/lib/addresses.ts` - the return on keeping every address in one
file - and needed nothing from the engine, because both hosts were already on its allow-list. The
workers.dev origin still answers and is still trusted, so links already posted keep working.
`cover_label` has printed this domain since migration 0015 and is now true.

Owed, and both in other people's dashboards: the Discord OAuth redirect for the new hostname
(`/api/link/discord/callback` is built from the request origin, so it is per hostname), and
Supabase Auth's redirect allow-list for `/login`. Sign-in is email and password through the API
and is unaffected.

### Row level security on tag_proposals

An oversight, caught by the owner when Supabase asked at migration time: 0003 states the rule and
every table-creating migration since has followed it. The Worker uses the service role and bypasses
RLS, but the same database carries an anon key. Enabled with no policies at all - a pending
proposal is un-moderated text with a person and a map attached, and nothing but the Worker ever
reads it. Both statements are idempotent: re-run 0029.

## 0.23.1 — 2026-09-06

Browse reads the vocabulary the same way the tag picker does, so an accepted custom tag is
filterable and not only pickable. "A tag for everyone to use" has to mean both.

## 0.23.0 — 2026-09-06

### Moderators

`creator_role` gains `moderator` (migration 0028). A moderator gets tag review, picture review,
comments, reports and the explorers page; running the place - config, usage, backups, debug - stays
with the owner. The line is whether it can be undone, so the two irreversible things on a page a
moderator otherwise reaches in full stay the owner's: deleting an account, and handing out the role
itself. The role is granted on an explorer's own page, by an admin, never on yourself.

"Gates" is now "Config", Debug is its own group between Moderation and Running the place in its own
red, and the strip shows a moderator only what they can reach.

### Game systems, and a "+" on every tag group

Two new groups: Game system (opening with system-agnostic, any-system and homebrew-rules, then two
dozen named ones) and Rules style (osr, pbta, forged-in-the-dark, rules-light, crunchy and the
rest). Every group now has a "+" that asks for a word the list is missing.

It is a request, not a free text box: a proposed tag waits for review rather than appearing on a
public page, and Tag review shows each one beside the tags that already nearly mean it. Swapping is
one click and puts the existing tag on the asking map - accepting a genuinely new word is the
deliberate second option, and it makes the tag available to everyone on the next request, no deploy
(migration 0029). A merged or rejected word is remembered, so the second person to ask gets the
first person's answer.

### Debug reads a crash log

It used to answer "neither a zip nor JSON", which is true and useless: when the app falls over the
console is what a person has to hand. A text upload is now read as a log - the build, the browser,
the first error with the frames under it, and each distinct error once. A file starting with `[`
now has to parse before it counts as JSON, because that is what a console log's first line looks
like.

## 0.22.1 — 2026-09-06

The number circle an ordinary Explorer needed: new comments on your own maps, on your own name in
the banner. It was already on the account page - which is the one place you do not go to find out
whether you need to - and looking there still clears it. One head count for a signed-in page view,
none for an anonymous one.

## 0.22.0 — 2026-09-06

### The banner is a banner again

"Open Star System Explorer" is gone from the top of every page (owner: "we have it at the bottom
and on every map"). A general link to the app was competing with the specific one beside every
download and on every card, which opens THAT map rather than the app.

### The staff areas are grouped, coloured, and say what is waiting

The eight admin links are out of the banner, which now carries one "Admin" entry with the work
waiting on it as a number circle - pictures to review plus reports still open. The areas
themselves are a strip on the admin pages, grouped by capability: Moderation (review, reports,
comments, explorers) and Running the place (usage, backups, gates, debug), each area coloured by
the lowest tier that could reach it. Review, Reports and Debug carry their own counts.

A count that cannot be taken shows no badge rather than a confident zero, and the debug uploads
are deliberately kept out of the banner number: they are stored files, not a queue, and a badge
that never reaches zero teaches people to stop reading badges.

**There is no moderator role yet** - `creator_role` is `user | admin`. The colour key shows what a
moderator would reach, drawn so the decision can be made by looking at it (`src/lib/adminNav.ts`).

### Every address really is in one file now

The footer's link to the app, the map page's "opens directly in", and the takedown page's fallback
all take it from `src/lib/addresses.ts` instead of writing it out, which is what D-37 said and what
the code did not yet do.

## 0.21.2 — 2026-09-06

Two claims in the hub's half of the contract corrected against what is actually true: the test
count, and a `git show` naming a tag this repo does not have.

## 0.21.1 — 2026-09-06

The hub's half of the contract records what was seen rather than what was expected: the "Open in
Star System Explorer" round trip walked live at 0.21.0 against engine beta - the link on the map
page and the card, the engine's cross-origin fetch, the question before a campaign is replaced,
and the parameter off the address bar afterwards. What was not seen is named too, and is Stream
N's: the no-campaign path, a refused host, and the opened map's provenance.

## 0.21.0 — 2026-09-06

### Every address in one file, and the open button turns on

`src/lib/addresses.ts` holds where the hub answers, the name it will answer to one day, and the
engine's two origins - the owner's "have it a base config item so it's easy to change later". Both
engine URLs default from it: `open_in_sse_url` is `https://beta.starsystemx.com/?open=` and
`sse_manifest_url` the manifest beside it, so **"Open in Star System Explorer" is now on** without
a row being set. An empty address row means "nobody has said otherwise" and the default stands; a
row reading `off` (anything that is not an http(s) URL) is the off switch. Beta only, under the
prod rule: production has neither feature until the owner makes the read-tree release.

With `site_url` unset the hub now says it lives at the workers.dev origin rather than at whatever
host the request arrived on - right for a link the hub embeds and somebody else fetches later, and
one row (or one constant) to change when the DNS moves.

### The seam has a protocol

D-37. `docs/sse-requirements.md` is the hub's half of the contract with the engine and now carries
a HUB-SIDE STATUS under each shipped R-number - what the hub has SET, CONSUMED and VERIFIED, and
what it has not. The engine's SEAM REPORT blocks for R-13 and R-17 are pasted whole; R-18's goes
back the other way. Ready for STREAM N N-1 and N-3.

## 0.20.0 — 2026-09-06

### What Star System Explorer ships is read from the engine, not copied out of it

The hub kept hand-copied lists of the calendars and tag categories the app ships, so it could tell
app content from a creator's own. They had gone stale twice - most recently saying nine tag
categories where the engine ships thirteen, which would have credited a map using one of the newer
four with custom categories it did not have (no map on the hub does yet; the four real saves to
hand are unaffected). The engine's generated `shipped-content.json` (R-13) replaces them: fetched, cached in R2,
and used for the app-artwork paths as well. A baseline that cannot be fetched is treated as
unknown, and the facet that needs it says nothing rather than something false. The Gates page has
an "Ask the engine what it ships" button and shows what the hub currently believes.
`sse_manifest_url` is the row (migration 0027); it moves to the production host with
`open_in_sse_url`, not before.

### "Open in SSE" is not offered where the engine will refuse it

The engine's `?open=` takes a campaign; a single system is refused with a message telling the
reader to download it instead. The button is therefore hidden for a single system rather than
opening the app to explain itself. R-18 asks for the single-system door; the button returns for
every map the day it ships.

Also: R-13 and R-17 are marked shipped in `docs/sse-requirements.md`, with the two things that
document got wrong - the download is a `.sse.zip` only when the map carried assets, and
`explorers.starsystemx.com` does not reach the hub (404 from Vercel, measured 2026-09-06), so
`site_url` stays unset until it does.

## 0.19.2 — 2026-09-05

The Worker keeps its own clock: Cloudflare Cron Triggers drain the outbox every fifteen minutes
and take a backup every Monday at 03:00 UTC, through a small wrapper around the adapter's worker.
Nothing to set up and no secret needed; an outside scheduler with the cron key still works.

## 0.19.1 — 2026-09-05

The tag groups on a map page are a closed concertina by default, opened by hand or when a tag is
picked from a row. A starmap opens with its stars minimised; a single system opens to planet
level. The cover on a map page and every card's picture carry the one-click open into the app,
both appearing once the engine prefix is set.

## 0.19.0 — 2026-09-05

### Inspect a debug upload

A debug upload can be read as evidence without being trusted: zip or JSON, whether the zip carries
its own index, what is inside, whether the document parses and where it stops if not, the
versions, the objects complete and incomplete, orphans and duplicate ids, GM material, and every
asset the document names against what the zip holds. At `/admin/debug/<id>/inspect`.

### Open in Star System Explorer

The hub side of a one-click open from a map page: a button beside the download, shown once the
engine can receive a URL (R-17 in `docs/sse-requirements.md`; migration 0026 adds the gate). The
Gates page is in the admin nav.

## 0.18.0 — 2026-09-05

Any hub badge can be a Discord role: `discord_badge_roles` maps badge ids to role ids, given and
taken with the badge through the bot (migration 0025). The config page refuses a channel link
where a webhook URL is wanted and says where to get one, and has two test buttons: a post to the
sharing channel, and an email to your own address through Supabase's SMTP (D-34).

## 0.17.1 — 2026-09-05

The in-map tag chips show every tag, grouped by namespace, so a biosignature on one world is as
findable as a lock on sixty. Row pills are off by default: a row shows its tags when the filter
matched it, or for every row with "Show tags" on. The page uses the screen, and on a wide one the
description sits beside the cover.

## 0.17.0 — 2026-09-05

### The map page, tidied: filter the map, find more maps below

The map's own pills move below the data, prefaced "Find more maps with:", without the counted
roles. Above the tree, a filter over what is in the map: a word, a role with its count, the map's
own tags most common first, and whether an object is described, pictured or modelled. Matches are
shown with the path down to them; everything else is hidden. Megastructures are a counted role
(a browse filter), not a creator tag. Browse sorts by "most written up" (D-31).

### Discord sharing

A published map is posted to the Discord sharing channel through an incoming webhook, via the
outbox, within seconds; a re-publish is "Updated"; a publish-unpublish-publish dance is one post.
Set `discord_share_webhook` at `/admin/config` (D-32).

### Reports close the loop, and the rest

Report a single comment; the reports page takes a map down, removes a comment or dismisses. New
comments on your maps since you last looked, on the account page. A sitemap, an Atom feed and
robots.txt. Backups of every table to R2, on a button or a schedule, at `/admin/backup`. Migration
0024 (D-33).

## 0.16.0 — 2026-09-05

### Information density

How much of a map is written about, 0 to 5, with 5 the best on the hub: a weighted mean of how
many objects have a description and how long it is (moons half, belts half, rings a quarter,
small objects and barycentres not at all). Shown as an "i" with a ring of five on every card, in
the map page's facts, and on the manage page as a nudge saying what would lift it. Measured on
upload and re-index; existing maps are measured once on their next view. Migration 0023 (D-30).

Two more badges: Chronicler, for writing up most of a map; Keeper, for running the place.

## 0.15.2 — 2026-09-05

The card's kind label is a little smaller than the cover's own title, so it reads as a tag.

## 0.15.1 — 2026-09-05

The card's kind label moves to the top-right of the picture: a generated cover letters its title
top-left in the same pixels, and the two read as one line.

## 0.15.0 — 2026-09-05

### People can be moderated, and can leave

An admin page per explorer: suspend, ban or reinstate with a reason the person reads on their
account page; remove every comment they have written at once; take a map down (a 404 to everyone,
the reason on its manage page, no republish) or restore it; delete the account with the handle
typed back. Everything audited. Anyone can delete their own account from the account page, and
choose whether their comments go too or stay as "a former explorer's". Migration 0022 (D-28).

### Badges, in pixels

Thirteen earned badges with twelve-by-twelve pixel art: cartographer, constellation, prolific,
featured, popular, legend, wellspring, crew, artist, modeller, worldbuilder, voice, pioneer. The
account page shows the whole set with how to earn each; a cartographer's badges follow the byline
on their map pages. The wordmark and the card labels are set in the cover cards' bitmap font, and
the error page has learned to say "not on any chart" (D-29).

## 0.14.0 — 2026-09-05

### Comments

Registered explorers can comment on a map. Comments are counted and accumulated like stars:
beside the star button, on cards, on the account page (per map and in total) and on the usage
page (total, weekly, per map, per cartographer). A comment can be removed by its author, by the
map's cartographer, or by an admin; it is kept and marked, never deleted, and an admin can restore
it. `/admin/comments` lists the latest comments across the hub with one-click Remove. Migration
0021 (D-27).

Reads that name a column the database does not have yet now drop that column and read again, the
way writes already did, so the card lists survive a deploy that runs ahead of a migration.

## 0.13.0 — 2026-09-05

### Re-index from the stored file, and the tree finally sorts by distance

The tree's Distance order and the constellation cover both read null for every map uploaded
before the position columns existed, so the sort fell back to size and TRAPPIST-1 sat next to Sol.
Rather than ask for a re-upload, the hub now rebuilds every derived row - tree, distances,
positions, small objects, counts, pills, credits, a generated cover - from the bundle it already
holds: once, in the background, on the first view of such a map; on demand from a "Re-index"
button on the manage page. Migration 0020 records when.

### Stars, not hearts

A map of stars is starred. The map page has a star button with the count; cards, the account page
and the usage page say stars.

### The cover designer grows up

One of your own screenshots can be the base (approved PNG or JPEG, decoded and fitted on the
Worker, the words drawn over it with a halo); four faces for the lettering (pixel, bold, outlined,
wide); a green-screen palette. A renamed map gets its card redrawn, a changed display name redraws
every card that carries it, and you can set that display name on the account page.

## 0.12.1 — 2026-09-04

### Upload a new version from the website

Until now a map could only be updated from inside Star System Explorer. The manage page has
"Upload a new version": the same upload page, told which map it is replacing, so the address stays
the same, a chosen cover or designed card is kept, and an older file than the published copy is
stopped with both revision numbers and a deliberate "replace anyway".

## 0.12.0 — 2026-09-04

### Credit points at the object, follows a copy of a copy, and runs both ways

A clip's source link now names the object itself - `/s/<slug>#node=<id>` - and the map page opens
that branch, scrolls to it and lights it. Every tree row has a "copy link" control. When the
copied object had itself been pasted in from somewhere, the clip carries the chain back to the
original, deepest first, so a copy of a copy still names the true source; the page shows "from
Alpha by alice (via Beta by bob)" and lists every cartographer whose hands the content passed
through. And the original map's page lists "Used in", because the hub can see which public maps
credit it. Migration 0019.

## 0.11.0 — 2026-09-04

### Small objects

A planet or moon under 1e20 kg (or under 250 km when the mass is missing) now counts as a small
object - an asteroid modelled on its own, a moonlet, a sub-moon - so a belt built in detail reads
as "412 small objects" rather than "412 planets". Vesta and Ceres stay what they were. One rule
drives the stored role, the counts, the pills, the tree and the cover. Takes effect on re-upload.

### Credit follows content

A clip now carries the cartographer's name beside the map's title and link, and the hub reads
`contentCredits` back out of a save and shows "Includes work from X by Y" with a link. The
engine's half - recording the credit on paste and printing it in the attributions file - is R-16.
Migration 0018.

## 0.10.1 — 2026-09-04

### Map pages locked up

Since 0.8.0 the tree restored its remembered state inside a Svelte effect that did `epoch++`.
Reading `epoch` made the effect depend on the value it then wrote, so it re-ran on its own write
until Svelte stopped it at the update-depth limit - a quarter of a million console errors and a
frozen page, on every map. The restore now runs once on mount and tracks nothing.

## 0.10.0 — 2026-09-04

### Pages are data transfer, and bytes in are counted too

With clips, most of what leaves the hub may leave through a page rather than the download button.
Server-rendered pages are now buffered in the hook to be measured, counted under their own kind
and shown in the same total; uploads count as bytes in. The usage page gains a chart of bytes out
stacked by kind with bytes in below the axis, and the day table shows both. Migration 0017.

### A copied object keeps what still works elsewhere

The clip used to strip every picture and model. Now it strips only what the bundle carried - those
would be broken links on arrival - and keeps app-shipped references and remote urls, so a station
built on the ISS starter model is still on the ISS when pasted into another campaign. Takes effect
on re-upload.

## 0.9.0 — 2026-09-04

### Where it starts to cost

The usage page now counts requests and bytes served, by day and by kind, and draws each free
allowance as a red line: Workers requests per day, R2 storage, R2 reads and writes projected to
month end, and the database's size. Bandwidth is free on Cloudflare and has no line; the
Supabase-to-Worker traffic cannot be measured from the hub and says so. Counting is batched inside
the Worker so it costs a fraction of what it measures. Migration 0016.

## 0.8.0 — 2026-09-04

### Design your cover

The card the hub drew for maps with no picture is now something a creator can design: a
constellation for a starmap (every system at its real map position, the origin star named) or an
orbital diagram for a system (real orbit spacing, bodies sized and coloured from their real mass,
radius and oceans), with the title, byline, counts, the site's domain and a QR code to the page
each switchable, in three palettes. Live preview on the manage page; "Use this cover" stores it.
Choices are kept and the card is redrawn on re-upload; a chosen screenshot survives re-upload too.
Free for everyone now; a config row makes it Pro later.

### Distance, not "orbit order"

At the top of a starmap the tree now orders systems by distance from the origin star; inside a
system, by orbit. One sort, called Distance. Row summaries list planets, moons, rings, belts, then
the built things, each with its symbol. The tree remembers what you opened, per map.

### Finding one Earth among forty

Starmap cards carry a second edge and a kind badge. The creator's own tags show on cards first and
filter the browse page, which also filters by kind and offers a "narrow it down" strip of the tags
that best split a crowded result. The vocabulary grew to eight groups: when, what-if, physics,
universe and more.

Migration 0015 adds the distance columns and the cover choices. Everything tolerates it not having
been run yet.

## 0.7.2 — 2026-09-03

### The build says which version it is

Verifying a deploy meant guessing from behaviour, and the guess was wrong once today: the client
chunk names change on every build regardless of content, so they cannot tell 0.7.1 from 0.7.0. Now
the footer shows the version and every response carries an `x-hub-version` header, both read from
`package.json` at build time. "Is the fix live?" is one curl.

## 0.7.1 — 2026-09-03

### The generated cover showed once, then vanished

Found by looking at the live page twice. The backfill upserted the cover's `system_assets` row on a
conflict target of `(system_id, sha256)`; the table's primary key is `(system_id, bundle_path)`, so
PostgREST refused the row, supabase-js reported it in `error` rather than throwing, and the link
never landed. On the first view the cover was approved by construction; on every view after, the
page looked up approval through the link table, found nothing, and showed no picture - and no
Open Graph image, which is the one that matters. Fixed at both ends: the right conflict target, and
the page now asks the ledger about the cover hash directly. `tests/schema.test.ts` pins the upsert
key to the migration text so it cannot drift again.

## 0.7.0 — 2026-09-03

### A map with no picture gets one drawn from itself

Most saves carry no picture the hub can host, so their pages - and every Discord embed of them -
had no image. Now, when the creator chose no cover and the bundle carries nothing to guess from,
the hub draws a card: the primary star, its planets and belts on tilted orbits with their moons,
the title, the counts, and the byline. Drawn deterministically from the map's own rows, so the
same map yields the same bytes and a re-upload reuses the asset.

Built with no dependencies a Worker cannot satisfy: a small rasteriser, a 5x7 bitmap font and a
PNG encoder over `fflate` (`src/lib/cover/`). It enters the ledger already approved - a deliberate
exception, recorded as D-21, because it is not user content. Any real picture always wins.

## 0.6.0 — 2026-09-03

### The engine's stream F, mirrored - including the bug that blocked a creator's own screenshot

SSE v3.0.243-264 shipped everything `docs/sse-requirements.md` asked for except R-13 and R-14. The
hub had integrated the format stamp and the fixtures, and nothing else. Now:

- **`capturedInApp`** - a screenshot the app took of the map no longer counts as "missing
  provenance" (C-07). Without this the hub refused to publish a map whose cover was the creator's
  own beauty shot, after the app had told them it was fine.
- **`coverAssetId`** - the cover the creator chose in the app is used first; the guess is the fallback.
- **`revision`** - stored, and an update carrying a LOWER revision than the published copy is
  refused with `stale-revision` and both numbers, unless `confirmStale=on`. Single-system saves
  carry no counter and are never checked.
- **`exportMode`** - stored and shown as a label; never a gate.
- `/m/<slug>` redirects to `/s/<slug>`, because the engine's config still says `/m/`.
- The upload accepts the file under `file` as well as `bundle`, which is what the engine posts.

### A usage dashboard at /admin/stats

Growth per week, downloads and distinct visitors, most downloaded maps and cartographers, storage
against the R2 free allowance, refused uploads by reason, the review queue and open reports. One SQL
function, no chart library. Downloads are now EVENTS with a week-scoped visitor hash and no address
(D-20); refusals are events carrying their code.

### Migration 0014 - and the code runs ahead of it on purpose

A write that names a column the database does not have yet drops that column and lands anyway
(`src/lib/server/tolerant.ts`), so uploads keep working between the deploy and the owner running
the migration. The stats page says plainly when its function is missing.

## 0.5.0 — 2026-09-03

### One tree, with copying on every row

The map page's contents were a 161-row alphabetical table with a second 172-block list of JSON
snippets under it. Both are gone. What is in a map is now a tree - a star, its planets, their moons -
collapsed by default and summarised where it is collapsed ("12 planets, 30 moons"), with a flat icon
for what each thing is, orbit order or A to Z, and expand/collapse all.

Every row has a copy control. Copying a branch copies it and everything beneath it as a **clip**
(`src/lib/bundle/clip.ts`): a versioned envelope, the source page, the nodes parents-first with the
root unparented. A leaf opens to its own JSON. The old snippet list and `SnippetBlock` are deleted.

### The paste side does not exist

Copying has led nowhere since it shipped: nothing in Star System Explorer reads a node from the
clipboard, on main or the hub branch. Written up as R-14 in `docs/sse-requirements.md`, to be built
on the engine's G64 reparent work. Until it lands, a clip is text the app does not recognise.

### Since 0.4.0, unrecorded here until now

- Node tags were silently empty: the engine's tags are `{key, value}` objects and the reader kept
  only strings. Fixed; takes effect on re-upload.
- Device-code pairing (`/api/device/*`, `/link`), app tokens on `/account`, direct save/load for SSE.
- Admin one-shot debug upload links (`/admin/debug`).
- CORS on the public reads, applied at the hook by cloning the response.
- The bundle format gate opened on the real fixtures: `KNOWN_BUNDLE_FORMATS = [1]`.
- Site name and url as config rows; `og:image` made absolute.

## 0.4.0 — 2026-08-28

### A rule-driven facet system, so it can grow without a deploy

The owner: *"we want a flexible categorised tag (and a tag can carry a value) ... if players add
their own custom gases, engines, fuels then those are added to the starmap file - so we know things
like Custom Gases: 3, Custom Liquids: 4."*

That removes the need for a separate artefact library entirely. The hub does not need a "fuels"
section; it needs the map to carry its own custom fuels, and it counts them.

Facets are now DECLARED, not coded - `{id, label, category, countKeysAt|countItemsAt|tagPattern,
baseline, minCount, enabled}` - and the rule list is a config row. Custom calendars, tag categories
and POI packs already ride in a save and are counted today. Gases, liquids, fuels, engines and
reactions ship as DISABLED rules naming the keys the hub will look for, so enabling them is an edit
rather than a release. Value-carrying tags are surfaced properly: weather comes back as
"sulfuric-acid virga, constant lightning" rather than a bare count.

### The bug that proves why `baseline` exists

The calendar rule first listed only 'Earth Gregorian' as shipped - and every real starmap carries
four, so it reported "3 custom calendars" for maps that had none. Caught by running the rules
against real engine files, not by reading the code.

A facet that is universally true is worse than no facet: it teaches people the pills cannot be
trusted, which devalues every other pill beside it. The baseline is now read from the engine's own
`static/temporal/calendars.json`, and there is a regression test for the full shipped set.

Written up for the engine as R-11, including the cheaper fix: a `custom: true` flag per entry would
remove the baseline maintenance altogether.

### Checks

84 tests. svelte-check clean. Build clean.

## 0.3.0 — 2026-08-28

### The GM/player choice is now read from the file, not asked

The owner pointed out the choice is already made in the app at export time, so asking the uploader
to restate it was asking them to get it wrong - and the wrong answer publishes somebody's campaign
secrets. The radio buttons are gone.

Detection is ASYMMETRIC and that is the design. GM notes, player-hidden objects, secret tags,
anomaly overrides, a hidden description with its text still attached, or an undo history all mean
CERTAINLY a GM tree, because computePlayerSnapshot removes every one of them. None of them means a
player export OR a GM export of a campaign with no secrets - indistinguishable, and harmless,
because a GM tree with nothing hidden in it has nothing to leak.

So the hub stopped asking which mode a file was exported in and started asking whether there is
anything in it the creator would not want published. The warning is consequently rare, specific
("GM notes on 12 objects; 3 objects hidden from players") and worth reading, instead of a choice
everyone had to make before they understood it. `published_gm_tree` now records a detected fact.

Requested from the engine as R-10: an `exportMode` stamp, for the LABEL only - a stamp rides inside
a stranger's file and is a claim, so detection stays the control.

### The integration spec

`docs/sse-integration-spec.md` - the SSE-to-hub system rather than a list of asks: what a saved file
should carry, the one-click link, uploads, updates, and downloads (which need NO credentials, ever -
one click is the whole point).

THE RULE IT IS BUILT AROUND: metadata makes a LABEL certain, it never becomes a GATE. Every field
arrives inside a file a stranger uploaded, so it is a claim - exactly like ATTRIBUTIONS.md and a
model's path hash. `exportMode: "player"` on a file full of GM notes loses to the detector. Invert
that and a one-line JSON edit walks past every gate the hub has.

The hub now reads an optional `meta` block (title, summary, description, tags) so a creator can
write their pitch in the app where they are already working, rather than only in a web form
afterwards. It PREFILLS; hub edits then win. Absent is the normal case for every save that exists
today and is not an error.

### Checks

45 tests. svelte-check clean. Build clean.

## 0.2.0 — 2026-08-28

The owner answered the two open gate questions and added three requirements: creator write-ups with
screenshots, an honesty attestation, and hooks for Patreon and Discord.

### Answers, now built

- **Legacy saves are accepted and base-stamped.** Unstamped bundles no longer refused; they are
  stamped as format 1 and the row is flagged, so the assumption stays visible in the database.
- **Two versions, two jobs.** `bundle_format` is the contract number and an unknown value is a
  refusal; `created_with` is the engine's `appVersion` build stamp, a CAPABILITY MARKER that is
  never a parse gate. Conflating them would start refusing perfectly readable maps.
- **An incomplete attribution blocks publishing.** CC-BY with no credit now blocks alongside
  provenance that is missing entirely, and the gate is re-checked server-side at the moment of
  publishing rather than only at upload.

### Creators can sell their own maps

- Write-up page: title, one-liner, description, tags, publish and unpublish.
- Screenshots, uploaded by the creator, **through the ordinary hash ledger** - same dedup, same
  review queue, no second moderation path. Any screenshot can be made the cover.
- The publish blocker names the assets still needing a credit, rather than just saying no.

### The attestation

Asked plainly at upload and recorded append-only WITH THE EXACT TEXT SHOWN, not just a version
number - so an old record still says what was actually agreed to after the wording changes. One
source for that text, shared by the form and the record, or the two drift on the first tweak.

### Patreon and Discord hooks - built, switched off

- Entitlements are a grant LEDGER, not a tier column: it can answer why someone has Pro, when it
  lapses, and what happens when a cancellation meets a gift. Patreon grants carry the paid-through
  date as an expiry, so a missed webhook lapses instead of becoming free Pro forever.
- Linked identities, unique per provider, so one pledge cannot buy Pro for a dozen accounts.
- Badges are DERIVED from what the hub knows - published a map, earned hearts - which is the one leg
  neither Patreon nor Discord can do. Lost when the thing that earned them goes away.
- An idempotent outbox for outbound Discord calls, because a fire-and-forget role assignment fails
  silently and nobody notices for a month.
- Webhook signature verified against the RAW body, constant-time, failing closed.
- What Pro is worth is config rows, not a branch in code.

### Fixed

- **The creator could not see their own pending screenshot.** The privileged image route was
  admin-only. Now ONE route with two branches - admin, or the creator who owns a map using those
  bytes - rather than a second route, which would have made the "unreviewed is never served" rule
  uncheckable by reading one file.

### Docs

`docs/sse-requirements.md` (hand to an SSE agent), `docs/integrations.md`, `docs/deployment.md`.

### Analytics

Cloudflare Web Analytics, off unless `PUBLIC_CF_BEACON_TOKEN` is set - no token means no third-party
script tag at all. The hub only runs on one host so there is no provider switching here; the engine
has that problem for real during the migration window and it is written up as R-09.

### Checks

35 tests. svelte-check clean. Build clean.

## 0.1.0 — 2026-08-28

First build. Phase 2 of `creator-hub-design.md` — the funnel — with the moderation gates from day
one rather than after, because a public upload path without them is a liability from its first hour
and the hash ledger has to exist from the first asset or the queue starts life with a backlog.

### The funnel

- Front page and system pages, server-rendered. Download is the primary action: one click, above the
  fold, above the description, no account.
- Cover image is the only picture. No 3D, no rendered preview, no engine on the hub.
- Copy-paste JSON snippets per body and construct, collapsed so they never compete with the
  download.
- OG tags for link previews, which is the whole reason the cover image matters.
- **No service worker.** Deliberate — see `docs/decisions.md` D-02.

### Reading a bundle

- Constants mirrored from the engine rather than imported, so the two repos stay on their own
  release cadences.
- **Uploads are closed until the engine ships a `bundleFormat` stamp and a canonical fixture.** The
  format gate refuses everything politely and says why. This is the shipped behaviour, not a stub.
- Zip reader mirrored from the engine's central-directory walker, then hardened for hostile input:
  path traversal, member count, declared-size and compression-ratio caps, no `.svg`.
- Provenance recomputed from the document. `ATTRIBUTIONS.md` is treated as the creator's *claim* and
  never as the gate — it is a file inside a stranger's zip.

### Moderation

- Hash ledger: a verdict is per-sha256, not per-upload. Approved hashes never re-enter the queue;
  banned hashes are refused before anything reaches R2. Exact-byte, not perceptual — said plainly
  in the UI and the docs.
- **The hub computes every hash from the bytes.** A path-supplied hash is a claim and is verified;
  trusting one would let a crafted bundle inherit another asset's approval.
- An upload is never blocked; an unreviewed asset is never served — **including from the download**,
  which is reassembled from approved assets only.
- Private R2 bucket, every object served through a ledger check. No quarantine bucket, no copy on
  approval; revoking something already public is a row update.
- Keyboard-driven review tool with undo, showing each image beside the licence its uploader claimed.
- Reports and hearts. Gates as config rows, editable without a deploy, including the JSON-only kill
  switch.
- Every admin action recorded — who, what, when, why.

### Schema

- 12 tables with the design's invariants encoded: verdicts outlive the accounts that uploaded them,
  shared hashes are refcounted, one heart per person per map, one report per person per target.
- RLS on every table, deny by default, as defence in depth behind the anon key.

### Checks

30 tests. `svelte-check` clean. Build clean.

### Known gaps

- Phase 3 (hearts UI, search, discovery) not built; API and schema are ready.
- Account deletion not built; the refcount it needs exists.
- `/terms`, `/acceptable-use` and `/takedown` are linked but do not exist — **they must be real
  before uploads open.** See `docs/decisions.md` Q-04.
