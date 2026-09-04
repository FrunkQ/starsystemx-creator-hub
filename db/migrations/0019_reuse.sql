-- "Used in": the other direction of credit. Run after 0018. Safe to run twice; tolerated unrun.
--
-- A map's content credits (0018) point at the hub maps its pasted objects came from. Kept here as
-- a plain array of slugs so the ORIGINAL map's page can ask "which public maps credit me?" with
-- one indexed containment query, and its cartographer can see where their work went.
alter table systems add column if not exists content_credit_slugs text[] not null default '{}';
create index if not exists systems_credit_slugs_idx on systems using gin (content_credit_slugs);
