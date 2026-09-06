-- Where the engine says what it ships (engine R-13, shipped beta v3.0.315; docs/decisions.md D-36).
-- Run after 0026. Safe to run twice.
--
-- The hub used to keep hand-copied lists of the calendars and tag categories Star System Explorer
-- ships, so it could tell app content from a creator's own. Those lists went stale twice. This row
-- names the engine's generated manifest instead, which the hub fetches and caches.
--
-- IT MOVES WITH open_in_sse_url. Both name the engine host; they should name the same one. Beta is
-- the default because production does not serve the path yet - it 404s until the read-tree release.
insert into config (key, value, note)
values ('sse_manifest_url', '"https://beta.starsystemx.com/shipped-content.json"'::jsonb,
        'Where the engine serves shipped-content.json (R-13). The hub reads what SSE ships from here instead of hardcoding it. Move it to the production host with open_in_sse_url. Empty = the baselines are unknown and the custom-content facets are skipped.')
on conflict (key) do nothing;
