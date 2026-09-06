-- A switch for the Discord posts (owner, 2026-09-06: "in testing can i have a switch under config
-- to disable posts to the discord"). Run after 0030. Safe to run twice.
--
-- WHY NOT JUST CLEAR THE WEBHOOK, which already stops the posting: because the webhook is a SECRET
-- and clearing it means finding it again to switch back on. A switch you are reluctant to use is a
-- switch you do not use - so testing goes out to a live channel instead, which is the thing this
-- exists to prevent.
--
-- Default TRUE, so nothing changes for anybody who never touches it.
insert into config (key, value, note)
values ('discord_share_enabled', 'true'::jsonb,
        'Post newly published and updated maps to the Discord sharing channel. Set false while testing: the webhook stays, and nothing is queued while it is off, so switching back on does not release a backlog.')
on conflict (key) do nothing;
