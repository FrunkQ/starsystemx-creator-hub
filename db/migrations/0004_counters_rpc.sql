-- Counters the read paths touch. Functions rather than direct updates so the Worker holds no
-- write logic it could get wrong under concurrency.

create or replace function increment_download(p_system_id uuid) returns void language sql as $$
  update systems set download_count = download_count + 1 where id = p_system_id;
$$;

-- Hearts are the ranking axis the front page needs (design 6.5), so the count is denormalised onto
-- `systems` and maintained by trigger. One heart per user per system is the hearts table's own
-- primary key, so this cannot double-count.
create or replace function bump_heart_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update systems set hearts_count = hearts_count + 1 where id = new.system_id;
  elsif tg_op = 'DELETE' then
    update systems set hearts_count = greatest(0, hearts_count - 1) where id = old.system_id;
  end if;
  return null;
end $$;

create trigger hearts_count after insert or delete on hearts
  for each row execute function bump_heart_count();
