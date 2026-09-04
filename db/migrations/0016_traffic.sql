-- Traffic, so the usage page can say how close the hub is to the free tiers - and when it
-- starts to cost (owner, 2026-09-04). Run after 0015. Safe to run twice.
--
-- What is counted and why is in src/lib/server/traffic.ts. Short version: Workers bill requests
-- per day, R2 bills storage and operations, Supabase bills database size and egress. Bandwidth
-- out of Cloudflare is free, but bytes are counted because they predict everything else.

create table if not exists traffic_daily (
  day       date   not null,
  category  text   not null,   -- page | api | asset | download | other
  requests  bigint not null default 0,
  bytes     bigint not null default 0,
  primary key (day, category)
);
alter table traffic_daily enable row level security;

-- One call carries a batch of buckets from a Worker isolate; each is ADDED to its day and category.
create or replace function bump_traffic(p_rows jsonb) returns void language plpgsql as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into traffic_daily (day, category, requests, bytes)
    values ((r->>'day')::date, r->>'category', coalesce((r->>'requests')::bigint, 0), coalesce((r->>'bytes')::bigint, 0))
    on conflict (day, category) do update
      set requests = traffic_daily.requests + excluded.requests,
          bytes    = traffic_daily.bytes    + excluded.bytes;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- hub_stats, again, with the limits panel: the last 31 days of traffic, this month's totals,
-- the database's own size, and this month's R2 writes (novel assets + bundles stored).
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
                        where d.created_at >= w.wk and d.created_at < w.wk + interval '1 week')
      ) order by w.wk), '[]'::jsonb)
      from weeks w
    ),
    'top_maps', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select s.slug, s.title, s.download_count, s.hearts_count, c.handle,
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
