-- Badge roles (owner, 2026-09-05; docs/decisions.md D-34). Run after 0024. Safe to run twice.
--
-- Hub badge id -> Discord role id, so a badge earned here becomes a role in the server, given and
-- taken with the badge through the bot (the role integration: discord_enabled, the bot token, the
-- bot in the server with Manage Roles). `discord_role_creator` keeps working for cartographer.
insert into config (key, value, note)
values ('discord_badge_roles', '{}'::jsonb,
        'Hub badge id to Discord role id, e.g. {"chronicler": "1234567890123"}. A badge earned here becomes that role in the server; lost, the role goes. Needs discord_enabled and the bot.')
on conflict (key) do nothing;
