-- "Open in Star System Explorer" (owner, 2026-09-05; docs/decisions.md D-35; engine R-17).
-- Run after 0025. Safe to run twice.
--
-- The engine URL the hub appends the encoded download URL to, so a map page can open the map in
-- the app in one click - e.g. https://starsystemx.com/?open= - once the engine can receive it
-- (docs/sse-requirements.md R-17). Empty = the button is not shown.
insert into config (key, value, note)
values ('open_in_sse_url', '""'::jsonb,
        'Engine URL the encoded download URL is appended to for the Open in Star System Explorer button, e.g. https://starsystemx.com/?open= . Empty = no button. Needs engine R-17.')
on conflict (key) do nothing;
