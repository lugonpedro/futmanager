-- The reserves' places no longer follow fixed positions that, with some
-- formations, left a squad short of full-backs or centre-backs. They are
-- now: the second keeper, then a defender, a midfielder and a forward, and
-- again, as the squad size allows (16: G D M A D; 18: and M A; 20: and D M).
-- A defender's place ("D") deals centre-backs and full-backs together. The
-- same list is RESERVE_PLACES in src/engine/room/slots.ts.

-- Whether a player of position `pos` may fill a place of `place`.
create function public.room_place_takes(place text, pos text) returns boolean
language sql immutable set search_path = '' as $$
  select pos = place or (place = 'D' and pos in ('Z', 'L'))
$$;

create or replace function public.room_team_slots(room bigint, team smallint) returns text[]
language sql stable set search_path = '' as $$
  select f.slots || (array['G', 'D', 'M', 'A', 'D', 'M', 'A', 'D', 'M'])[1:r.squad_size - 11]
  from public.rooms r
  join public.room_teams t on t.room_id = r.id and t.slot = team
  join public.room_formations f on f.formation = coalesce(t.formation, '4-4-2')
  where r.id = room
$$;

-- As before, with a defender's place dealing centre-backs and full-backs.
create or replace function public.room_deal(room bigint, team smallint, place smallint)
returns text[]
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  pos text;
  dealt text[];
  prime text;
  boost smallint;
begin
  select * into found from public.rooms r where r.id = room;
  select d.player_ids into dealt from public.room_deals d
    where d.room_id = room and d.pick = found.pick_no;
  if dealt is not null then
    return dealt;
  end if;
  update public.room_teams t set formation = coalesce(t.formation, '4-4-2')
    where t.room_id = room and t.slot = team;
  pos := (public.room_team_slots(room, team))[place + 1];
  dealt := array(
    select ranked.player_id from (
      select p.player_id, p.position,
        row_number() over (partition by p.position order by p.rank) - 1 as n
      from public.room_pool p
      where p.room_id = room
        and not exists (
          select 1 from public.room_picks k where k.room_id = room and k.player_id = p.player_id
        )
    ) ranked
    where public.room_place_takes(pos, ranked.position)
      or not exists (
        select 1 from public.room_pool p
        where p.room_id = room and public.room_place_takes(pos, p.position)
          and not exists (
            select 1 from public.room_picks k
            where k.room_id = room and k.player_id = p.player_id
          )
      )
    order by ln(random()) / exp(-ranked.n / (3.0 * found.teams)) desc
    limit 5
  );
  if random() * 12 < 1 then
    select w.player_id, least(8 + floor(random() * 5), 89 - w.overall)
      into prime, boost
      from (
        select p.player_id, p.overall from public.room_pool p
        where p.room_id = room and p.player_id = any (dealt)
        order by p.rank desc
        limit 3
      ) w
      order by random()
      limit 1;
    if boost is null or boost <= 0 then
      prime := null;
      boost := null;
    end if;
  end if;
  insert into public.room_deals (room_id, pick, slot, slot_index, player_ids, prime_id, prime_boost)
    values (room, found.pick_no, team, place, dealt, prime, boost);
  return dealt;
end;
$$;

revoke execute on function public.room_place_takes(text, text) from public, anon, authenticated;
