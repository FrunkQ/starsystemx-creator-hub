-- The three ADDRESS rows describe themselves wrongly: "empty" stopped meaning "off". Run after 0034.
-- Safe to run twice. NOTES ONLY - no value and no behaviour is touched by this migration.
--
-- WHAT CHANGED UNDER THEM. These rows were seeded by 0026, 0027 and 0030, each with a note saying
-- that leaving it empty turns the feature off. That was true when they were written. It stopped
-- being true when `ADDRESS_GATES` landed in `src/lib/server/config.ts`: for these three keys an
-- empty row now means "nobody has said otherwise", so `loadGates` falls back to the code default in
-- `src/lib/addresses.ts`. The owner asked for a variable he could change rather than a row he had to
-- set - so empty is the NORMAL, WORKING state, and all three are empty today.
--
-- WHY THIS IS WORTH A MIGRATION RATHER THAN A SHRUG. The note is the only explanation an admin reads
-- while deciding what to type, and the page shows it beside an input. A note reading "Empty = no
-- button" next to an empty row that demonstrably HAS a button invites someone to fix a problem that
-- does not exist - or to conclude the page is lying and stop trusting the rest of it. Found when the
-- owner went looking for `sse_manifest_url` to change it and had to be told the blank was correct.
--
-- THE OFF SWITCH IS STILL REAL, and is now stated in the place it is needed: set the row to anything
-- that is not an http(s) URL - `"off"` says it best - and the feature that needs an address is off,
-- because nothing will build a link out of it (`isHttpUrl`, and `openLink` refuses such a prefix).

update config set note = 'Engine URL the encoded download URL is appended to for the Open in Star System Explorer button. EMPTY IS NORMAL and means the code default stands (currently https://beta.starsystemx.com/?open= - beta is the only build carrying R-17). To turn the button OFF, set this to something that is not an http(s) URL, such as "off". Moves to the production host together with sse_manifest_url, once the read-tree release is made.'
where key = 'open_in_sse_url';

update config set note = 'Where the engine serves shipped-content.json (R-13); the hub reads what SSE ships from here instead of hardcoding it. EMPTY IS NORMAL and means the code default stands (currently https://beta.starsystemx.com/shipped-content.json - production 404s that path until the read-tree release). Set it to something that is not a reachable manifest, such as "off", and the baselines are unknown, so the custom-content facets are SKIPPED rather than computed against nothing. Moves to the production host together with open_in_sse_url.'
where key = 'sse_manifest_url';

update config set note = 'The address the hub sends AS. Must be on the verified Resend domain. EMPTY IS NORMAL and means the code default stands (currently keeper@starsystemx.com). Sending also needs RESEND_API_KEY as a Worker secret - without it the hub sends nothing whatever this row says.'
where key = 'mail_from';
