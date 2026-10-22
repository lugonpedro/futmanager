-- The lineup may name anyone in the team's squad now, as room_rosters has it
-- after trades and signings, and no longer only the players it drafted: a
-- player who came in a trade or from the free list made the save fail.
-- Before the first round writes the rosters, the squad is still the draft's.
create or replace function public.save_room_lineup(room bigint, lineup jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
  ids text[];
  rosters boolean := exists (select 1 from public.room_rosters r where r.room_id = room);
begin
  if jsonb_typeof(lineup->'starters') <> 'array' or jsonb_typeof(lineup->'bench') <> 'array'
     or jsonb_array_length(lineup->'starters') <> 11
     or jsonb_array_length(lineup->'bench') > 12
     or octet_length(lineup::text) > 4000 then
    raise exception 'bad lineup' using errcode = 'P0001', hint = 'escalacao';
  end if;
  ids := array(
    select s->>'playerId' from jsonb_array_elements(lineup->'starters') s
    union all
    select b #>> '{}' from jsonb_array_elements(lineup->'bench') b
  );
  if exists (select 1 from unnest(ids) i where i is null)
     or (select count(distinct i) from unnest(ids) i) <> cardinality(ids)
     or exists (
       select 1 from unnest(ids) i
       where case when rosters then not exists (
         select 1 from public.room_rosters r
         where r.room_id = room and r.slot = mine.slot and r.player_id = i
       ) else not exists (
         select 1 from public.room_picks p
         where p.room_id = room and p.slot = mine.slot and p.player_id = i
       ) end
     ) then
    raise exception 'bad lineup' using errcode = 'P0001', hint = 'escalacao';
  end if;
  insert into public.room_lineups (room_id, slot, round, lineup)
  select room, mine.slot, r.round_no, lineup from public.rooms r where r.id = room
  on conflict (room_id, slot) do update
    set round = excluded.round, lineup = excluded.lineup, saved_at = now();
end;
$$;
