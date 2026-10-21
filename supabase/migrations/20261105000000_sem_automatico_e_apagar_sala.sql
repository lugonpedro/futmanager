-- The draft loses its "automatic" switch: a run-out clock still makes that
-- one pick, but never puts the person on automatic, since nothing would
-- switch it back. Teams already on automatic go back to picking.
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
  perform public.room_advance(room);
  return true;
end;
$$;

update public.room_teams set auto = false, misses = 0 where auto;

-- What nothing calls any more: the switch itself, and the queue of
-- favourites, which left the screen and which the FUT Draft's automatic pick
-- no longer reads. rooms.grace_hours stays, unused, since create_room,
-- update_room and room_rematch still write it.
drop function public.draft_set_auto(bigint, boolean);
drop function public.save_draft_queue(bigint, text[]);
drop table public.room_queues;

-- The owner can delete the room at any point, in the middle of the draft or
-- the league too; everything of it goes with it.
drop policy "rooms: owner deletes" on public.rooms;
create policy "rooms: owner deletes" on public.rooms
  for delete to authenticated using (owner_id = (select auth.uid()));
