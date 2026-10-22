-- A robot no longer always takes the best card of its deal: most of the time
-- it does, but now and then it goes for the second or the third, so robot
-- squads differ and the draft is less predictable. Out of 10 picks, about 6
-- take the best card, 3 the second and 1 the third. A person whose clock ran
-- out still gets the best card picked for them.
create or replace function public.room_auto_choice(room bigint, team smallint)
returns text
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  deal public.room_deals;
  robot boolean;
  ranked text[];
  draw double precision := random();
  chosen text;
begin
  select * into found from public.rooms r where r.id = room;
  select t.robot into robot from public.room_teams t where t.room_id = room and t.slot = team;
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
  ranked := array(
    select p.player_id
    from public.room_pool p
    where p.room_id = room and p.player_id = any (deal.player_ids)
      and public.room_pick_problem(room, team, p.player_id) is null
    order by p.overall + case when p.player_id = deal.prime_id then deal.prime_boost else 0 end desc,
      p.rank
  );
  if cardinality(ranked) = 0 then
    raise exception 'nobody left to pick' using errcode = 'P0001';
  end if;
  chosen := ranked[case
    when not robot or draw < 0.6 then 1
    when draw < 0.9 then least(2, cardinality(ranked))
    else least(3, cardinality(ranked))
  end];
  return chosen;
end;
$$;
