-- Two things the engine now writes into a save, and the usage counts the owner asked for.
--
-- Run after 0013. Safe to run twice (every statement is `if not exists` or `create or replace`).
--
-- THE CODE THAT USES THESE COLUMNS IS ALREADY DEPLOYED and tolerates their absence
-- (src/lib/server/tolerant.ts): until this runs, uploads succeed minus the new facts, downloads are
-- counted but not logged as events, and /admin/stats reports that the function is missing.

-- ---------------------------------------------------------------------------------------------
-- What the engine stamps (docs/sse-requirements.md R-10 and R-12, shipped in SSE v3.0.247)
-- ---------------------------------------------------------------------------------------------
-- `revision` is the campaign's own save counter. It is what lets an update say "this file is older
-- than the copy already published" instead of silently overwriting the newer one with the older.
-- Single-system saves carry none; null means "no counter", never zero.
alter table systems add column if not exists revision integer;
-- `export_mode` is a LABEL the app wrote at export time ('gm' or 'player'). Recorded, shown, and
-- never used as a gate: the hub reads the file itself to decide what it contains.
alter table systems add column if not exists export_mode text;

-- ---------------------------------------------------------------------------------------------
-- Refusals are events too
-- ---------------------------------------------------------------------------------------------
-- upload_events was only ever written on success, so "how many uploads fail, and why" was
-- unanswerable. A refused upload now writes a row with outcome 'refused' and the refusal code as
-- reason. A refusal before sign-in has no creator, hence the dropped not-null.
alter table upload_events alter column creator_id drop not null;
alter table upload_events add column if not exists outcome text not null default 'ok';
alter table upload_events add column if not exists reason text;
create index if not exists upload_events_outcome_idx on upload_events (outcome, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Downloads as events, anonymously
-- ---------------------------------------------------------------------------------------------
-- `systems.download_count` stays as the counter the cards sort by. This table is the history behind
-- it: one row per download, with a visitor hash and nothing else. The hash is
-- sha256(iso-week + secret salt + ip + user-agent) - see src/lib/server/visitor.ts - so a visitor is
-- exactly one visitor within a week and unlinkable across weeks. No address is ever stored.
create table if not exists download_events (
  id           uuid primary key,
  system_id    uuid not null references systems (id) on delete cascade,
  visitor_hash char(64) not null,
  created_at   timestamptz not null default now()
);
create index if not exists download_events_time_idx   on download_events (created_at desc);
create index if not exists download_events_system_idx on download_events (system_id, created_at desc);
-- Deny-by-default, like every other table (0003). The Worker reads it with the service key.
alter table download_events enable row level security;

-- ---------------------------------------------------------------------------------------------
-- The dashboard, as ONE function
-- ---------------------------------------------------------------------------------------------
-- Aggregated here rather than in the Worker: Supabase is reached over HTTP, and pulling rows to
-- count them is the kind of thing that works at ten maps and times out at ten thousand. One call,
-- one JSON document, every panel.
--
-- Growth is twelve weeks of ISO weeks (Monday-start, matching the visitor hash's week).
create or replace function hub_stats(p_days integer default 30) returns jsonb language sql stable as $$
  with weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '11 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as wk
  ),
  since as (select now() - make_interval(days => p_days) as t)
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
      'bundle_count', (select count(*) from systems)
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
    )
  );
$$;
