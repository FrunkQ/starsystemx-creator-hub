-- Bytes IN as well as out, and pages counted as data transfer (owner, 2026-09-04: "we need to
-- count the data shown on screen ... bytes in/out charts together with downloads/uploads").
-- Run after 0016. Safe to run twice.

alter table traffic_daily add column if not exists bytes_in bigint not null default 0;

-- One call carries a batch of buckets from a Worker isolate; each is ADDED to its day and category.
create or replace function bump_traffic(p_rows jsonb) returns void language plpgsql as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into traffic_daily (day, category, requests, bytes, bytes_in)
    values (
      (r->>'day')::date, r->>'category',
      coalesce((r->>'requests')::bigint, 0), coalesce((r->>'bytes')::bigint, 0), coalesce((r->>'bytes_in')::bigint, 0)
    )
    on conflict (day, category) do update
      set requests = traffic_daily.requests + excluded.requests,
          bytes    = traffic_daily.bytes    + excluded.bytes,
          bytes_in = traffic_daily.bytes_in + excluded.bytes_in;
  end loop;
end $$;

-- The traffic panel's own function, so hub_stats need not be rewritten every time this grows.
-- (hub_stats still carries the 0016 `traffic` and `month` keys; the page prefers this.)
create or replace function hub_traffic() returns jsonb language sql stable as $$
  with month as (select date_trunc('month', now()) as t)
  select jsonb_build_object(
    'days', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb) from (
        select to_char(day, 'YYYY-MM-DD') as day, category, requests, bytes, bytes_in
        from traffic_daily where day >= current_date - 31
      ) t
    ),
    'month', jsonb_build_object(
      'requests',      (select coalesce(sum(requests), 0) from traffic_daily, month where day >= month.t::date),
      'bytes',         (select coalesce(sum(bytes), 0)    from traffic_daily, month where day >= month.t::date),
      'bytes_in',      (select coalesce(sum(bytes_in), 0) from traffic_daily, month where day >= month.t::date),
      'reads',         (select coalesce(sum(requests), 0) from traffic_daily, month
                          where day >= month.t::date and category in ('asset', 'download')),
      'writes',        (select count(*) from assets, month where first_seen_at >= month.t)
                       + (select count(*) from upload_events, month where outcome = 'ok' and created_at >= month.t),
      'days_elapsed',  extract(day from now())::integer,
      'days_in_month', extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'))::integer
    )
  );
$$;
