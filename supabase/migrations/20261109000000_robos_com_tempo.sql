-- Robots take a few seconds per pick instead of picking at once, so the room
-- sees their cards turn over like anyone else's: on a robot's turn its cards
-- are dealt and a short clock starts, and the pick comes from draft_tick when
-- that clock runs out. When the tick comes late (the cron job, with nobody's
-- page open), robots go back to picking at once, so an empty room does not
-- crawl one pick every 30 seconds.

-- Makes the picks of every team that picks on its own, until it is a
-- person's turn again or the draft is over. With `paced`, a robot's turn only
-- deals its cards and starts its clock.
create function public.room_advance(room bigint, paced boolean) returns void
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
        update public.rooms r set pick_deadline = now() + interval '5 seconds'
          where r.id = room;
      end if;
      exit;
    end if;
    perform public.room_record_pick(room, team.slot, public.room_auto_choice(room, team.slot), true);
  end loop;
end;
$$;

create or replace function public.room_advance(room bigint) returns void
language sql volatile set search_path = '' as $$
  select public.room_advance(room, true)
$$;

-- As before, and a tick more than 10 seconds late lets the robots that
-- follow pick at once.
create or replace function public.draft_tick(room bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  found public.rooms;
  team public.room_teams;
begin
  if (select auth.uid()) is not null and not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  select * into found from public.rooms r where r.id = room for update;
  if found.status is distinct from 'draft' or found.pick_order is null
     or found.pick_no >= found.teams * found.squad_size or found.pick_deadline > now() then
    return false;
  end if;
  select * into team from public.room_teams t
    where t.room_id = room
      and t.slot = public.room_slot_for_pick(found.pick_order, found.pick_no, found.draft_order);
  perform public.room_record_pick(room, team.slot, public.room_auto_choice(room, team.slot), true);
  if not team.robot then
    update public.room_teams t set misses = team.misses + 1
    where t.room_id = room and t.slot = team.slot;
  end if;
  perform public.room_advance(room, found.pick_deadline > now() - interval '10 seconds');
  return true;
end;
$$;

revoke execute on function public.room_advance(bigint, boolean) from public, anon, authenticated;
