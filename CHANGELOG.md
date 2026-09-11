# Changelog

## 0.61.0 - 2026-09-11

### Maps that need a fix say so, and say how

When the hub reads a map and finds something wrong with the file - something that stops Star System
Explorer opening it, or leaves part of it broken - it now says so plainly, with steps to fix it.

- **On upload** you are told straight away, while you still have the app open.
- **On your manage page** each problem is listed with how to fix it. Publishing is still possible, but
  we advise against it until it is fixed, and the button asks you to confirm.
- **On the map's page and card** a `needs-a-fix` pill appears, with the same help, so anyone about to
  download it knows first.
- **For moderators and admins**, a new Issues tab lists every public map with problems, and they get
  an email when one is published or found.

Upload a fixed version and it all clears by itself.

Needs migration 0040 to keep what it finds; until then maps are checked on upload but nothing is stored.


## 0.60.0 - 2026-09-11

### Re-index one map from its page, and a Config button that shows its work

**Moderators and admins can re-index a single map** from the Moderator panel at the foot of its page.
It reads the stored file again, rebuilds the tree, the counts and a drawn cover, and says what it
found - so many bodies, so many constructs. Nothing the creator wrote changes.

**The Config page's re-index now works through every map, one at a time, and says which one it is
on.** The old button tried to do eight maps in one go, which is more than the hub's server allows in a
single request - it got two done and stopped without saying so. It also thought a map read earlier
the same day was up to date even when the hub had been improved since. It now counts a map as behind
if an older version of the hub read it, and tells you how many there are before you press.

**The Moderator panel's other buttons answer where you pressed them.** Putting a map on hold, taking
it off, and pushing it to Debug used to reload the page at the top, with the confirmation far below.


## 0.59.3 - 2026-09-11

### A map with two copies of one system keeps all its bodies

A starmap holding two copies of the same system - both of Star System Explorer's bundled Sols, say -
was published with every planet, moon and star missing, because the two copies share their object
ids and the hub could not store both. The upload even said it had worked. The second copy's objects
are now renamed on the way in, the way the app itself names a second copy, and copying from either
Sol gives you that Sol. If the hub ever cannot store a map's objects again, the upload says so
instead of pretending.

Maps already damaged this way come right when re-indexed.


## 0.59.2 - 2026-09-11

### Multi-star covers, stable addresses, and a Debug file that says what it is

**A binary's cover has its real stars on it.** The drawn cover used to put a sun in the middle of a
multi-star system that is not there, and could leave the actual stars out entirely - Alpha Centauri
lost both A and B. Now the heaviest star is in the middle and its companions orbit it, the way the
system is actually arranged. Sol's card also loses the orange "space station" it was drawing where
Pluto and Charon are. Covers already drawn update when a map is re-indexed.

**A map keeps its address when you upload a new version.** Renaming a map in the app and uploading it
again used to move its page, breaking every link already shared and the QR code on its cover. Two
maps with the same name still get their own addresses - the second is `-2`.

**Pushing a map into Debug names the file properly.** A map saved without pictures is plain JSON, and
it was arriving labelled as a zip. An entry pushed before this keeps the old name: delete it and push
again, or rename the download to `.json`.


## 0.59.1 - 2026-09-11

### Trust an explorer from the list

The explorers list has a Trusted column. Ticking it saves straight away - their pictures go out on
arrival, still appear in the review queue marked as pre-approved, and they get the roomier daily
allowance. Your own row is shown but cannot be ticked.

Fixed on the way: the Trust box on an explorer's own page always opened unticked, so saving that
form to add a note would have untrusted a trusted explorer. It now opens showing what is true.


## 0.59.0 - 2026-09-11

### Push a map into Debug from its own page

When a map looks broken, an admin can copy its stored file straight into the debug store from the
map page - the same place a one-shot link delivers to, reached from the other side. The copy is
frozen, so a new upload from the creator will not change what you are looking at.

Admin rather than moderator, because a debug upload is an unredacted campaign and the debug pages
are admin only for that reason - a moderator who could put a map there could not then read it.


## 0.58.0 - 2026-09-11

### Screenshots are a slideshow, and a stuck account can be unstuck

A map with six screenshots no longer makes its page six screens long. One picture at a time with a
strip of thumbnails underneath, the cover still first and still the one on the cards. Nothing is
hidden - it is a slideshow, not a "click to see more".

And an explorer waiting on a confirmation email now has controls on their admin page: send it again,
or confirm the address for them. Those are different acts and they are different buttons - the
second is a decision that you are satisfied they own that address, and it is recorded against your
name. They can already send themselves another from their own account page.


## 0.57.0 - 2026-09-11

### Trusted explorers, and maps that can be put on hold

**Trust** turns the wait around rather than removing it. A trusted explorer's pictures are approved
on arrival, so adding a screenshot and using it happen in one go - and they still appear in the
review queue, marked, in a section of their own, with Withdraw beside each one. Banning one still
takes it off every map at once, which is exactly what makes going in this order safe. They get the
roomier daily upload allowance too, which is a config row.

Granting it is a moderator's to do, unlike the staff role: it can be undone completely.

**On hold** is the state that was missing between "published" and "taken down". A map with a
suspected fault stays downloadable, with the moderator's note shown above the download *and written
into the file* - because most people who fetch a map never see its page. A file nobody can fetch is
a file nobody can diagnose, and the person best placed to say what is wrong with it is the person
trying to use it.

A moderator reading a map page has the hold controls right there, rather than having to go to the
admin pages to act on what is in front of them.

**Migration 0039 is the owner's to run.** Everything works before it does; the trust panel says so
if you try.


## 0.56.0 - 2026-09-11

### A map list Star System Explorer can show inside itself

`/api/maps` takes a `limit` now, so ten at a time works, plus a `kind` filter and a `discussed` sort
for most-commented. Every map comes back with absolute urls - its page, its download, its cover, and
a link that opens it in the app - so nothing has to assemble a URL and get the hostname wrong.

That last one is null for a single system on purpose: the app refuses to open one, and a link that
opens it to an error is worse than no link.

The interface is written up for the engine stream in `docs/prompt-for-sse-2026-09-11-map-list-api.md`.


## 0.55.0 - 2026-09-11

### Copying a system counts as a download, and comments show a role

A single system cannot be opened in Star System Explorer, so the hub offers Copy instead - which
means for those maps Copy *is* the download. Counting only the download button made the busiest
systems look like the least read. Opening in the app already counted, because that goes through the
download route. Copying one row out of a map still does not: borrowing a planet is not taking the
map, and the number has to keep meaning one thing.

Comments now carry the commenter's role where they have one, in the same two colours as the banner.


## 0.54.0 - 2026-09-10

### The review queue says who, what and what else

Every card now names **who uploaded it** and which map it is on - with their role and their account
state, because a picture from a suspended account is a different decision. An asset is bytes, and
the same bytes can arrive from four people on four maps, so a card can honestly name more than one.

**The file itself**: its name inside the bundle, the type it claims to be, its size, and what its
first bytes actually say. That last one is the only thing on the card that is not somebody's claim -
the name came out of a stranger's zip and the type came off that name. When the bytes contradict the
claim, the card says so; when they are simply unrecognised it stays quiet, because a warning that
cries wolf stops being read.

**And the rest of the queue is visible** as thumbnails underneath, each captioned with who uploaded
it and which map. Clicking one moves to it. Being able to see that the next eight are one person's
screenshots rather than eight unrelated uploads changes how you read the one in front of you.


## 0.53.0 - 2026-09-10

### Moderators can see the pictures they are meant to review

The one route that serves an unreviewed image asked for an admin. So the role created to review
pictures could open the review queue and see nothing in it - every card a broken image.

The check predated the moderator role and was never revisited. A test now scans for the same shape
of miss anywhere else.


## 0.52.1 - 2026-09-09

A debug link made before the hub started keeping tokens now says "not kept" rather than showing an
empty cell where the Copy button goes. There is genuinely nothing to hand back for those - only the
fingerprint was stored at the time - and a blank space reads as a broken button.


## 0.52.0 - 2026-09-09

### A debug link you can actually paste

It showed the bare token and a sentence explaining how to build a URL out of it. It shows the whole
link now, with a Copy button - and a Copy against every link in the list that is still live, so
losing it no longer means making another and leaving the first one lying around.

That needed the token stored rather than only its fingerprint. It is cleared the moment the link is
used, so a spent link never shows one; validation still goes through the hash, unchanged.

**Migration 0038 is the owner's to run.** Until it does, the page behaves exactly as before.


## 0.51.3 - 2026-09-08

The R-19 test clips named a hydrosphere field that does not exist - `liquid` where the engine reads
`composition`. Caught by the engine stream while testing against them. The fixtures are corrected
and clip 1 now has a checkable outcome rather than a vague one: the body's surface phase should come
out liquid, because its temperature sits between that liquid's melt and boil points.

Nothing in the hub itself changed, and nothing needed to: the hub never writes a hydrosphere. A clip
carries whatever the engine wrote.


## 0.51.2 - 2026-09-08

Seven test clips for the engine stream's R-19 work, in `docs/clips/`, with the expected outcome for
each. Generated by the hub's own builder from real nodes rather than typed by hand, and regenerated
by the test suite - so a committed fixture cannot drift from what the hub actually emits.


## 0.51.1 - 2026-09-08

The re-index button says whether anything is behind rather than printing a date and asking you to
work it out. The hub knows what today is.


## 0.51.0 - 2026-09-08

### Re-index from the Config page

There was a Re-index button on each map's own manage page and nowhere for the owner to say "the hub
learned to read something new - go over the library again". Now there is one beside the test
buttons: it re-reads the oldest few maps from the files the hub already holds, says what it did, and
tells you when the oldest reading on the hub is, so you know whether to press it again.

A few at a time on purpose - each map means fetching a bundle, unzipping it and parsing the
document, and a Worker has ten milliseconds of CPU.


## 0.50.0 - 2026-09-08

### A map that keeps its own time says so where the copying happens

A custom calendar is the one customisation a clip cannot carry, and for a good reason: it is the
campaign's clock rather than one of its rules, so adopting somebody else's would re-date everything
in the campaign it landed in. A map that keeps its own time now says so beside the copy controls,
naming the calendar - and says plainly that the full download does bring it, because it does.

Maps with a custom calendar were already tagged and filterable; the facet now records which
calendars rather than only how many, because a count cannot be spoken.


## 0.49.1 - 2026-09-08

The custom rules page returned a 500 until migration 0037 had been run - it named a column the
database did not have yet. It now reads tolerantly and says the library is empty, which is the
honest answer while the migration is pending.

A test scans every route for the same mistake: a young column in a select string, or worse, a filter
on one, which the tolerant reader cannot rescue.


## 0.49.0 - 2026-09-08

### A library of everybody's custom rules

`/rules` lists every custom liquid, gas, atmosphere mix, pigment, biosphere form, fuel, engine and
sensor that anybody has published a map with - one row per thing, whichever map it came from, with
a Copy that puts it on your clipboard for Star System Explorer.

It is the same clip a map page's Copy makes, carrying rules and no objects, so pasting one is the
same thing the app already does with a copied planet. Where two cartographers have different takes
on the same name, both are listed with the maps they came from - copying "ammonia" without saying
whose would be a choice made on somebody's behalf. You can read a definition before you paste it.

Linked from Browse and the footer.


## 0.48.0 - 2026-09-08

### A copied body brings the custom rules it needs

Custom liquids, gases, atmosphere mixes, pigments, biosphere forms, fuels, engines and sensors do
not live on the object - they live on the starmap. So copying a planet that used one gave you a
planet in a campaign that had never heard of it, and the lookup returned nothing *without
complaining*: the body pasted, and its phase, appearance and climate quietly fell back.

A clip now carries the map's custom rules with it, whole and unmodified. The engine narrows them to
what the pasted objects need and merges what is missing - that half is theirs, and a prompt is
going over. Older versions ignore the new key and behave exactly as they do today.

**Migration 0037 is the owner's to run.** Maps published before it come right with Re-index; nobody
needs to upload anything again.


## 0.47.0 - 2026-09-07

### Discord posts carry the whole write-up

They carried the one-line blurb, which is the right thing on a card in a grid of twenty and the
wrong thing in a channel where one map arrives at a time. The post now has the hook and then the
description under it, so somebody reading the channel can decide whether to download without
leaving Discord.

Discord refuses an embed whose description runs past 4096 characters - it would not have posted an
ugly announcement, it would have posted none at all, and the maps it silently dropped would have
been the ones with the most written about them. Long write-ups are cut at a paragraph, then a
sentence, then a word, in that order of preference. A blurb repeated as the first line of the
description is not printed twice.


## 0.46.0 - 2026-09-07

### The footer is a banner rather than a block

It was four stacked full-width rows on every page - heading, paragraph, button, note, links - which
is a lot of vertical space spent on something nobody came for. The pitch now sits beside its button
and the fan-work note beside the links: two rows instead of four, about a third less height, and not
a word lost. Both rows stack on a phone.


## 0.45.3 - 2026-09-07

Footer spacing: the fan-work line sat hard against the "Open Star System Explorer" button. The button
was an inline element, so its padding painted outside the line box and took up no room - it has a
real box now, and the note below it has somewhere to be.


## 0.45.2 - 2026-09-07

The explorers list tags moderators as well as admins - it only ever knew about admins, so the one
page you would look at to find out who holds the role showed a moderator as an ordinary explorer.
Both use the same two colours as the banner.

And an account waiting on its confirmation email is no longer painted the same red as a banned one.
It says "email not confirmed" beside the state, because "pending" on its own invites a guess.


## 0.45.1 - 2026-09-07

Emailed links - the sign-up confirmation and the password reset - are built from the hub's canonical
address rather than whichever hostname the request arrived on. workers.dev still answers, and a link
built from it is not on Supabase's allow-list, so it would have silently fallen back to the site root
and dropped the path. No change for anybody arriving at explorers.starsystemx.com.


## 0.45.0 - 2026-09-07

### Takedown claims are catalogued and kept

The takedown form only sent an email, so a copyright claim existed as a message in an inbox with no
state, no owner and no way to ask what happened to it. Claims are recorded now - before anything is
sent - and `/admin/takedowns` is the queue: open ones at the top with the claimant and what they
asked, and underneath, everything already dealt with and what was done about it.

Closing one asks what happened - taken down, rejected, or withdrawn - and requires a line saying
what you did, because that note is the whole point of keeping the record. Nothing is ever deleted;
resolving moves a claim out of the queue and no further. It shows in the moderation nav with the
number waiting, and every decision lands in the audit log.

A claim now survives the email failing. It used to be that no admin address meant the form refused
outright and sent a copyright holder away with nothing.

The page used to say "nothing is kept beyond the message itself", which stopped being true; it now
says plainly what is kept and who reads it.

**Migration 0036 is the owner's to run.**


## 0.44.1 - 2026-09-07

The explorers list shows the address each person signed up with, and marks the ones that have never
been confirmed. Admin only - the rest of that page is staff, but an email address is not content,
and a moderator needs to see what somebody posted rather than who they are.


## 0.44.0 - 2026-09-07

### Forgotten passwords

There was no way back in. `resetPasswordForEmail` existed in exactly one place - the admin test-mail
button - so the only person who could trigger a reset was the owner, on himself, from a page nobody
else can reach. Anyone who forgot a password was locked out for good.

`/reset` asks for a link and `/reset/new` sets the new password, and the link to it sits with the
sign-in failure where you would look for it, as well as under the form.

It also fixes a trap nobody had hit yet: the emailed link was being asked for in PKCE mode, which
needs a verifier held by whatever asked - and the hub asks from a Worker it then throws away, so the
link would have failed on opening with a message about a missing code verifier. Links are asked for
in implicit mode now, which the browser can finish on its own. The admin test button was pointing at
the sign-in page rather than anywhere that could set a password; it points at the right place.


## 0.43.0 - 2026-09-07

### An account waits for its email before it can contribute

A new account is `pending` until the confirmation link is clicked. Until then you can sign in, look
around and download anything - sharing a map, starring one and commenting all wait. It becomes
active on the first sign-in after the address is confirmed.

Every one of those refusals used to say "Sign in to share a map", which is nonsense to somebody who
is signed in and waiting on an email. They now say what is actually true and what to do about it,
from one sentence in one place. The account page carries a "send me another link" button, which is
why a pending account is allowed to sign in at all - a confirmation that goes astray must not leave
somebody with nowhere to go.

**Migration 0035 adds the state and is the owner's to run.** Nobody already here is affected.


## 0.42.0 - 2026-09-07

### People can join

There was no sign-up. An account existed only if somebody made the Supabase user by hand and
inserted the matching row by hand - which is why the sign-in page has a message for the half-state
where one exists without the other. `/join` asks for a name, an email and a password, sends a
confirmation through Supabase's own mail, and there is a Join link in the banner.

The name is held at sign-up rather than at first sign-in, so two people cannot both be told a handle
is free and the second one discover a week later that they are somebody-2. Handles are tidied before
they are judged - "The Star Keeper" and "Renee" both work - and the reasons for refusing one are
sentences rather than codes.

`signups_open` on the Config page closes the door without a deploy.

### The takedown address is keeper@starsystemx.com

It was a second copy of an address held as character codes, which is how it came to be wrong when
the hub's mail moved. It comes from `addresses.ts` now. It is still assembled rather than written,
and still never appears in the served HTML.


## 0.41.4 - 2026-09-07

The map's own page - where you tag it, fix a credit and pick a cover - is the last user-facing thing
that needed a phone pass. Tag pills and the "+" were 25px tall and are 39px; the crop slider is a
40px drag target rather than a 20px one; the credit fields fold to one column at the same width as
every other two-column block instead of 80px narrower.


## 0.41.3 - 2026-09-07

The tree's sort and expand controls really are bigger now. The override had been written above the
rule it was overriding, and a media query adds no specificity, so it lost silently - visible only by
measuring the live page after the change had shipped.


## 0.41.2 - 2026-09-07

Banner links and the tree's sort and expand controls are a proper size to tap. The banner links had
padding, which on an inline link paints outside the line box and leaves the target exactly as small
as it was - they get a real box now.


## 0.41.1 - 2026-09-07

The 16px floor for form fields now actually wins - a component's own rule outranked it, so the map
page's search box was still zooming iOS on focus. Fixed at its source too, and a test scans every
component for the next one: it immediately found a second, on the reports page a moderator would be
clearing from a phone.

The "Open in SSE" chip on a card and the footer links are big enough to tap.


## 0.41.0 - 2026-09-07

### A pass over the whole site on a phone

Measured at 375px rather than guessed at. Nothing overflowed sideways, which was the good news;
what was wrong was smaller and more annoying.

**Browse put the maps first.** The filter sidebar is 924 pixels tall with the library as small as it
is today, so on a phone you scrolled one and a half screens of tag pills before the first map - and
that block grows as the hub fills up. The maps now come first and the filters sit under them with a
heading. The search box stays at the top, where somebody arriving to look for a map by name needs it.

**Tapping a field no longer zooms the page.** iOS Safari zooms in on any field whose text is under
16px and does not zoom back out; the map page's search box was 14.4px.

**Things you tap are big enough to tap.** Filter chips, tag pills, row actions, sort links and the
banner links were between 22 and 27 pixels tall. The download button is full width.

**Row actions in the tree are visible on a touch screen.** They were dimmed until hovered, and a
touch screen never hovers - so the copy button that is the point of the row read as disabled.

Also: tables scroll themselves rather than stretching the page, long URLs wrap instead of pushing
the page sideways, and turning a phone to landscape no longer inflates the text.


## 0.40.2 - 2026-09-06

### A row that does not exist can no longer be saved successfully

Setting a config key with no row reported success. It said it had saved, wrote a `config.set` entry
to the audit log saying so, and changed nothing - because an UPDATE that matches no rows is not an
error in Postgres. The admin walks away believing the thing is set, and finds out when the feature
does not behave. Saving now checks what it changed and refuses when there was nothing to change,
naming the key and pointing at the migration that would create it.

Both places that wrote a config row had their own copy of that update; they now share one, and the
dead helper that had a third copy is gone.

### The three address rows no longer describe themselves backwards

Migration 0035. `open_in_sse_url`, `sse_manifest_url` and `mail_from` were each seeded with a note
saying that leaving them empty turns the feature off. That stopped being true when an empty address
row came to mean "nobody has said otherwise", so the code default stands - which is why all three
are empty today and everything works. The notes now say what empty really does, where the default
points, and how to actually turn one off: set it to something that is not a URL, such as "off".

## 0.40.1 - 2026-09-06

### No way to bin an uncredited picture, and the way out said out loud

There is deliberately no "remove this asset" button: the publish gate stands, and any one of who,
licence or where clears it. What was missing was the alternative for a picture nobody can credit,
so the blocked-publish notice now names it - take it off the object in Star System Explorer and
upload the new version, with a link straight there.

The credits panel used to say recording it in the app was *better*, "because the credit then travels
with the file". Since 0.40.0 it travels either way, so that sentence was false and has gone. The app
is still worth a minute, for the reason now given: it is what makes your own next export carry it.


## 0.40.0 - 2026-09-06

### A credit typed on the hub now reaches the file people download

Fixing a credit on the manage page satisfied the publish gate and printed on the map's page, and
the download still carried a picture with nobody's name on it. It goes into the save itself now -
every node that uses the asset - and into the `ATTRIBUTIONS.md` beside it, which is regenerated to
match and says plainly that some of it was filled in on the hub.

It is applied **on the way out**, not written into the stored bundle. The stored bytes stay as
uploaded, which is what the attestation was made about; the claims stay the single source of truth
the gate reads; and the download cannot drift, because it is rebuilt from both every time.

An empty box never blanks a credit the app already recorded. That direction would have been worse
than not running at all.


## 0.39.1 - 2026-09-06

"Nothing to link yet." The sentence after it explained which switches were off, which is a note to
whoever built them rather than an answer to the person reading the page.


## 0.39.0 - 2026-09-06

### Fan work says so, on every page and inside every file

People are going to build their favourite universe here, so the hub now states plainly what that
is. Every map page, every card and the footer of every page carry the notice; it is written into
the README of every download, so it travels with the file rather than living on a web page nobody
who received the zip has seen.

A creator can name the setting - on the upload form or later on the manage page, picked from a list
or typed - and the notice then names it too: *"an unofficial fan work based on Star Trek. It is not
made, endorsed or approved by the owners of Star Trek, and no ownership of Star Trek is claimed by
the person who made this map or by Star System Explorer."* Leaving it empty is a normal answer; the
blanket notice is unconditional either way.

The terms have a Fan work section, and the upload attestation now includes the sentence.

**Migration 0034 adds `systems.fan_setting` and is the owner's to run.** Everything works before it
does - the notice is shown, the field is simply not stored yet.

### The cover editor stops uploading while you drag

Sliding the crop was POSTing 2.27 MB of pixels for every position it passed through. The browser
now fits the picture locally on every change - which is free - and sends it once, when the cover is
saved. A new fit sweeps the crops that picture no longer uses.

### Re-opening the map editor shows your actual cover

A cover set to one of your own pictures drew the default card until you clicked a thumbnail again.
It now prepares the saved picture on arrival.

### Screenshots are scaled to what the hub can display

A 2048x2100 upload was stored at full resolution and shown at about 1200. Anything past 2048 on its
long edge is now scaled down in the browser before it is sent, keeping its format, and the page
says so. The 8 MB size cap was hard-coded in an `if` and is now a config row, alongside the new edge
limit - both changeable from the Config page.


## 0.38.0 — 2026-09-06

### Every credit on your map, in one place

The credit fields were only visible when an asset was blocking a publish, so a thin credit - a
licence and no name, a name and no source - had nowhere to be improved. There is a Credits panel
now listing everything the map carries, blocked ones first and marked with why. A model shows a
label rather than a broken thumbnail.

### The licence field suggests and still accepts anything

A list of the common ones - CC0, the CC BY variants, my own work, used with permission, bought -
that you can pick from or type straight past. It is a suggestion, never a validation, and the list
agrees with the gate: every CC-BY option needs a name and none of the others does, CC0 included.

## 0.37.0 — 2026-09-06

### A clip's `kind` and `roleHint` are a promise now, not an accident

The engine reads those two off a pasted node to decide whether a clip can land in empty space. They
survived because `snippetFor` spreads the node and deletes a few things - so a future refactor to a
whitelist would have taken them out and "Paste as a new system" would have stopped being offered
with no error at all.

Pinned by a test, with the reason written beside the code. No new field: the coordinator declined a
`rootKind` on the envelope because the app would have to verify it against the nodes anyway, and a
second answer to "what is this clip" is the fault, not the fix.

## 0.36.0 — 2026-09-06

### The cover preview is drawn in your browser

Picking a font on a picture-backed cover returned a 1102. It was not the decode this time - that is
cached - it was the PNG encode: 65ms for a card over a photograph against a free plan's 10ms of
CPU, where a drawn card is 14ms. A photograph does not compress, so deflate does real work.

The preview now runs the SAME renderer in the page. Not a second implementation - `src/lib/cover/`
is plain TypeScript and the card is deterministic, so the browser draws byte-for-byte what the hub
would have. Previews now cost the Worker nothing at all, and `/api/cover/preview` is deleted with
the change.

Saving a cover still renders once on the server, because a stored cover is auto-approved on the
grounds that the hub drew it.

## 0.35.0 — 2026-09-06

### "Copy for Star System Explorer" on a system

The engine opens a campaign from a link and refuses a single system - but it has taken a paste since
v3.0.292, and every row of a map page has offered a clip since 0.12. So where a starmap gets "Open
in Star System Explorer", a system now gets "Copy for Star System Explorer": the same clip, rooted
at the whole map, in white rather than blue - the same pair the cards already draw.

A system whose nodes form two separate trees copies the larger. The envelope carries one root, and
that is a contract with the engine rather than something to widen quietly.

## 0.34.1 — 2026-09-06

`docs/handover-2026-09-06-evening.md`: the day's work handed over, with the Discord bot as the next
job, the credit write-back as the most valuable half-done thing, and the five traps that cost real
time.

## 0.34.0 — 2026-09-06

### Credit a picture from the manage page, and be told why Publish is asleep

The Publish button was disabled and the reason sat at the top of a long page, which is nowhere at
all once you have scrolled past it. It now says why where it is, and links to the fix.

And the fix is on the same page: each blocked picture is shown with fields for who made it, the
licence, where it came from and what it is. Any one is enough; a CC-BY licence still needs a name.
The gate has not moved and the rules are the parser's own - a credit typed here and a credit read
from a save mean the same thing.

**Still missing:** a credit typed here does not yet reach the downloaded file, because that lives on
the node in the save. Recording it in Star System Explorer and uploading again is still better, and
the page says so. Writing back is next.

## 0.33.1 — 2026-09-06

The kind badge on a card is a matched pair: the same surround for both, and only the colour
differs - a system in ink, a starmap in the accent. The system's was drawn in the divider colour,
which disappears against a cover photograph, so one badge looked deliberate and the other looked
like an accident.

## 0.33.0 — 2026-09-06

### The browser prepares a cover picture, and you choose the crop

Decoding a screenshot on the Worker cost 168ms against a free plan's 10ms, so it moves to the one
machine with CPU to spare: the page fits the picture and posts the raw pixels, which the hub stores
and later draws over without decoding anything. No paid plan needed and no runaway cost.

And the crop is yours: a slider, on whichever axis the picture actually has slack - a tall one
slides up and down, a wide one side to side. The browser and the hub use the same crop maths, so
what you slide to is what gets stored.

The Worker's own decoder is still there but switched off (`cover_server_decode`, migration 0033).
It belongs off on a free plan.

## 0.32.0 — 2026-09-06

### Using a screenshot as a cover background no longer kills the Worker

Decoding a picture is by far the most expensive thing the hub does - measured at 168ms for a 4.9
megapixel PNG, against a free plan's 10ms of CPU - and the cover preview was doing it on every
change to the design. Cloudflare's answer to that is a 1102, not an error page.

The fitted pixels are now cached in R2 as raw RGB, so the decode happens once per picture rather
than once per keystroke. A file too big is refused from its header before anything is decoded, and
the picker greys it with "Too big to draw over" rather than letting a creator find out by taking the
Worker down. The old guard allowed forty megapixels, which was a limit for a machine that does not
exist here.

**On the free plan the FIRST decode can still exceed the CPU limit** - see D-53 for the two ways
out, one of which is a plan.

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
