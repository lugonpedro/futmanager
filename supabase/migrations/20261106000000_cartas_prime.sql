-- Prime cards: about one deal in twelve turns one of its three weakest cards
-- into a prime, 8 to 12 overall higher (never above 89), for this room only.
-- The deal keeps which card and by how much; the pick keeps the boost, and
-- the league starts with that player boosted (primePlayer() in
-- src/engine/room/prime.ts, whose PRIME holds the same numbers). A prime not
-- taken goes back to the deck as the player he was.
alter table public.room_deals
  add column prime_id text,
  add column prime_boost smallint;
alter table public.room_picks add column prime_boost smallint;

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
    where ranked.position = pos
      or not exists (
        select 1 from public.room_pool p
        where p.room_id = room and p.position = pos
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

-- The automatic pick keeps the best card, the prime's boost counted.
create or replace function public.room_auto_choice(room bigint, team smallint)
returns text
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  deal public.room_deals;
  chosen text;
begin
  select * into found from public.rooms r where r.id = room;
  update public.room_teams t set formation =
      (array['4-4-2', '4-3-3', '4-2-3-1', '3-5-2'])[1 + floor(random() * 4)::integer]
    where t.room_id = room and t.slot = team and t.robot and t.formation is null;
  select * into deal from public.room_deals d
    where d.room_id = room and d.pick = found.pick_no;
  if deal.player_ids is null then
    perform public.room_deal(room, team, public.room_free_slot(room, team));
    select * into deal from public.room_deals d
      where d.room_id = room and d.pick = found.pick_no;
  end if;
  select p.player_id into chosen
    from public.room_pool p
    where p.room_id = room and p.player_id = any (deal.player_ids)
      and public.room_pick_problem(room, team, p.player_id) is null
    order by p.overall + case when p.player_id = deal.prime_id then deal.prime_boost else 0 end desc,
      p.rank
    limit 1;
  if chosen is null then
    raise exception 'nobody left to pick' using errcode = 'P0001';
  end if;
  return chosen;
end;
$$;

-- Records the next pick in the place its cards were dealt for, with the
-- boost when it is the deal's prime, and starts the next clock.
create or replace function public.room_record_pick(
  room bigint, team smallint, player text, by_itself boolean
)
returns void
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  deal public.room_deals;
  total integer;
begin
  select * into found from public.rooms r where r.id = room;
  select * into deal from public.room_deals d
    where d.room_id = room and d.pick = found.pick_no;
  total := found.teams * found.squad_size;
  insert into public.room_picks (room_id, pick, slot, player_id, auto, slot_index, prime_boost)
    values (
      room, found.pick_no, team, player, by_itself, deal.slot_index,
      case when deal.prime_id = player then deal.prime_boost end
    );
  update public.rooms r set
    pick_no = found.pick_no + 1,
    pick_deadline = case
      when found.pick_no + 1 < total then now() + make_interval(secs => found.pick_seconds)
    end
  where r.id = room;
end;
$$;
