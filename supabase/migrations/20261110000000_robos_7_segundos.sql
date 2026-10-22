-- A robot's clock goes from 5 to 7 seconds: the room now holds the last
-- pick's cards for 2 seconds, the chosen one raised, before the next cards
-- turn, and 5 seconds left too little time to see them.
create or replace function public.room_advance(room bigint, paced boolean) returns void
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  team public.room_teams;
  have integer;
begin
  loop
    select * into found from public.rooms r where r.id = room;
    exit when found.pick_order is null or found.pick_no >= found.teams * found.squad_size;
    select * into team from public.room_teams t
      where t.room_id = room
        and t.slot = public.room_slot_for_pick(found.pick_order, found.pick_no, found.draft_order);
    select count(*) into have from public.room_picks k
      where k.room_id = room and k.slot = team.slot;
    exit when not (team.robot or team.auto or (found.auto_reserves and have >= 11));
    if team.robot and paced then
      if not exists (
        select 1 from public.room_deals d where d.room_id = room and d.pick = found.pick_no
      ) then
        update public.room_teams t set formation =
            (array['4-4-2', '4-3-3', '4-2-3-1', '3-5-2'])[1 + floor(random() * 4)::integer]
          where t.room_id = room and t.slot = team.slot and t.formation is null;
        perform public.room_deal(room, team.slot, public.room_free_slot(room, team.slot));
        update public.rooms r set pick_deadline = now() + interval '7 seconds'
          where r.id = room;
      end if;
      exit;
    end if;
    perform public.room_record_pick(room, team.slot, public.room_auto_choice(room, team.slot), true);
  end loop;
end;
$$;
