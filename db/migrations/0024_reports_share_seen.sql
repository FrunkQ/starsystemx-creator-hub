-- Reports on comments, the Discord sharing channel, and "new comments since you last looked"
-- (owner, 2026-09-05; docs/decisions.md D-32, D-33).
--
-- Run after 0023. Safe to run twice.
--
-- NOTE for the SQL editor: `alter type ... add value` cannot run inside a transaction that also
-- USES the new value, and it is not used here - so the whole file runs as one batch. If the editor
-- still refuses, run the first statement on its own, then the rest.

-- 1. A REPORT CAN POINT AT ONE COMMENT. Map and picture reports already exist; this is the third
--    target. The comment id cascades: a comment deleted for real takes its reports with it.
alter type report_target add value if not exists 'comment';
alter table reports add column if not exists comment_id uuid references comments (id) on delete cascade;
create unique index if not exists reports_comment_once_idx on reports (reporter_id, comment_id) where comment_id is not null;

-- 2. THE SHARING CHANNEL. An incoming-webhook URL for the Discord channel new and updated maps are
--    posted to. Empty means off. The server itself is the owner's; its id goes in only if the row
--    is still blank, so nothing an admin has set is overwritten.
insert into config (key, value, note)
values ('discord_share_webhook', '""'::jsonb,
        'Discord incoming-webhook URL of the channel newly published and updated maps are posted to. Empty = off.')
on conflict (key) do nothing;
update config set value = '"1443167899933212744"'::jsonb
 where key = 'discord_guild_id' and value = '""'::jsonb;

-- 3. WHEN A CARTOGRAPHER LAST LOOKED at the comments on their maps, so the account page can say
--    how many are new. Null = never looked; everything is new.
alter table creators add column if not exists comments_seen_at timestamptz;
