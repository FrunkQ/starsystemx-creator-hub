-- Where "Add System to SSE" points (owner, 2026-09-11; engine R-18; D-92).
-- Run after 0040. Safe to run twice.
--
-- The engine's beta (v3.1.69) takes a single system through `?open=` and offers to place it on the
-- open campaign. The owner named the button: "instead of it saying 'Open Map in SSE' - it would be
-- 'Add System to SSE'". Production (v3.1.48) still refuses a single system, so the hub points
-- systems at the beta until the owner releases it - through this row, separately from
-- `open_in_sse_url`, which campaigns already use against production.
--
-- EMPTY IS NORMAL and means the code default stands: https://beta.starsystemx.com/?open=
-- WHEN PRODUCTION HAS R-18, set it to https://starsystemx.com/?open= - no deploy needed.
-- Set it to "off" (anything that is not an http address) and systems get no link at all.
insert into config (key, value, note)
values ('add_system_in_sse_url', '""'::jsonb,
        'Where "Add System to SSE" sends a single system (R-18). EMPTY IS NORMAL and means the code default stands (currently https://beta.starsystemx.com/?open= - production refuses a single system until the owner releases v3.1.69 or later). Set it to https://starsystemx.com/?open= once production has it. Set it to "off" and systems get no link; campaigns are unaffected and use open_in_sse_url.')
on conflict (key) do nothing;
