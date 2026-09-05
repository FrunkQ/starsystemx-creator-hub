-- Comments on maps, counted and accumulated like stars (owner, 2026-09-05).
--
-- Run after 0020. Safe to run twice. Tolerated unrun: a map page whose database has no comments
-- table shows no comments section, and the card lists drop the count column until it exists
-- (src/lib/server/tolerant.ts).
--
-- REGISTERED USERS ONLY, for the same reason as stars and reports: an anonymous comment box is a
-- griefing tool. A comment is REMOVED rather than deleted - by its author, by the map's
-- cartographer (their page, their call), or by an admin - so the count stays honest and a removal
-- can be answered. Only deleting the creator or the map takes the rows away for real.

create table if not exists comments (
  id             uuid primary key,
  system_id      uuid not null references systems (id) on delete cascade,
  creator_id     uuid not null references creators (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 2000),
  created_at     timestamptz not null default now(),
  removed_at     timestamptz,
  removed_by     uuid references creators (id) on delete set null,
  removed_reason text                              -- author | cartographer | admin
);
create index if not exists comments_live_idx    on comments (system_id, created_at) where removed_at is null;
create index if not exists comments_creator_idx on comments (creator_id, created_at desc);
alter table comments enable row level security;

-- Live comments on public maps are readable by anyone; a row is written only as yourself. The
-- Worker uses the service role and is bound by neither; these are for any direct client.
drop policy if exists comments_public_read on comments;
create policy comments_public_read on comments for select
  using (removed_at is null and exists (
    select 1 from systems s where s.id = comments.system_id and s.state = 'public' and s.visibility = 'public'));
drop policy if exists comments_insert_own on comments;
create policy comments_insert_own on comments for insert with check (creator_id = auth.uid());

-- The count, denormalised onto systems like hearts_count (0001, 0004) and maintained by trigger.
-- RECOUNTED rather than nudged: a removal is an update, a restoration would be too, and a count
-- that is recounted cannot drift.
alter table systems add column if not exists comments_count integer not null default 0;

create or replace function recount_comments() returns trigger language plpgsql as $$
declare
  sid uuid;
begin
  if tg_op = 'DELETE' then sid := old.system_id; else sid := new.system_id; end if;
  update systems
     set comments_count = (select count(*) from comments where system_id = sid and removed_at is null)
   where id = sid;
  return null;
end $$;

drop trigger if exists comments_count on comments;
create trigger comments_count after insert or update of removed_at or delete on comments
  for each row execute function recount_comments();

-- ---------------------------------------------------------------------------------------------
-- hub_stats, again: comments alongside stars in the totals, the weekly growth, the top maps and
-- the cartographers. Everything else is as 0016 left it.
-- ---------------------------------------------------------------------------------------------
create or replace function hub_stats(p_days integer default 30) returns jsonb language sql stable as $$
  with weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '11 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as wk
  ),
  since as (select now() - make_interval(days => p_days) as t),
  month as (select date_trunc('month', now()) as t)
  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'totals', jsonb_build_object(
      'creators',         (select count(*) from creators),
      'maps_public',      (select count(*) from systems where state = 'public' and visibility = 'public'),
      'maps_all',         (select count(*) from systems),
      'downloads',        (select coalesce(sum(download_count), 0) from systems),
      'hearts',           (select count(*) from hearts),
      'comments',         (select count(*) from comments where removed_at is null),
      'downloads_period', (select count(*) from download_events, since where created_at >= since.t),
      'visitors_period',  (select count(distinct visitor_hash) from download_events, since where created_at >= since.t),
      'uploads_period',   (select count(*) from upload_events, since where outcome = 'ok' and created_at >= since.t),
      'refusals_period',  (select count(*) from upload_events, since where outcome <> 'ok' and created_at >= since.t)
    ),
    'growth', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week',      to_char(w.wk, 'YYYY-MM-DD'),
        'creators',  (select count(*) from creators c
                        where c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'),
        'maps',      (select count(*) from systems s
                        where s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'uploads',   (select count(*) from upload_events u
                        where u.outcome = 'ok' and u.created_at >= w.wk and u.created_at < w.wk + interval '1 week'),
        'refusals',  (select count(*) from upload_events u
                        where u.outcome <> 'ok' and u.created_at >= w.wk and u.created_at < w.wk + interval '1 week'),
        'downloads', (select count(*) from download_events d
                        where d.created_at >= w.wk and d.created_at < w.wk + interval '1 week'),
        'visitors',  (select count(distinct d.visitor_hash) from download_events d
                        where d.created_at >= w.wk and d.created_at < w.wk + interval '1 week'),
        'comments',  (select count(*) from comments m
                        where m.removed_at is null and m.created_at >= w.wk and m.created_at < w.wk + interval '1 week')
      ) order by w.wk), '[]'::jsonb)
      from weeks w
    ),
    'top_maps', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select s.slug, s.title, s.download_count, s.hearts_count, s.comments_count, c.handle,
               (select count(*) from download_events d, since
                  where d.system_id = s.id and d.created_at >= since.t) as downloads_period
        from systems s join creators c on c.id = s.creator_id
        where s.state = 'public'
        order by s.download_count desc, s.hearts_count desc
        limit 10
      ) t
    ),
    'top_creators', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select c.handle,
               count(s.id)                        as maps,
               coalesce(sum(s.download_count), 0) as downloads,
               coalesce(sum(s.hearts_count), 0)   as hearts,
               coalesce(sum(s.comments_count), 0) as comments,
               coalesce(sum(s.source_bytes), 0)   as bundle_bytes
        from creators c join systems s on s.creator_id = c.id
        group by c.id, c.handle
        order by downloads desc, hearts desc
        limit 10
      ) t
    ),
    'storage', jsonb_build_object(
      'asset_bytes',  (select coalesce(sum(byte_size), 0) from assets),
      'asset_count',  (select count(*) from assets),
      'bundle_bytes', (select coalesce(sum(source_bytes), 0) from systems),
      'bundle_count', (select count(*) from systems),
      'db_bytes',     (select pg_database_size(current_database()))
    ),
    'failures', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(reason, 'unknown') as reason, count(*) as n
        from upload_events, since
        where outcome <> 'ok' and created_at >= since.t
        group by reason
        order by n desc
      ) t
    ),
    'queue', jsonb_build_object(
      'pending',        (select count(*) from assets where review_state = 'novel'),
      'oldest_pending', (select min(first_seen_at) from assets where review_state = 'novel'),
      'flagged',        (select count(*) from assets where review_state = 'novel' and flagged),
      'open_reports',   (select count(*) from reports where state = 'open')
    ),
    'traffic', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb) from (
        select to_char(day, 'YYYY-MM-DD') as day, category, requests, bytes
        from traffic_daily where day >= current_date - 31
      ) t
    ),
    'month', jsonb_build_object(
      'requests',      (select coalesce(sum(requests), 0) from traffic_daily, month where day >= month.t::date),
      'bytes',         (select coalesce(sum(bytes), 0) from traffic_daily, month where day >= month.t::date),
      'reads',         (select coalesce(sum(requests), 0) from traffic_daily, month
                          where day >= month.t::date and category in ('asset', 'download')),
      'writes',        (select count(*) from assets, month where first_seen_at >= month.t)
                       + (select count(*) from upload_events, month where outcome = 'ok' and created_at >= month.t),
      'days_elapsed',  extract(day from now())::integer,
      'days_in_month', extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'))::integer
    )
  );
$$;
