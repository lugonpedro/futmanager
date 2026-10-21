-- Rounds stop being asynchronous: a round is played once everyone is ready,
-- or whenever the owner plays it without waiting. The grace period
-- (rooms.grace_hours) no longer lets the owner, or anyone after twice as
-- long, play it; the column stays for the rooms that have it.
create or replace function public.can_play_round(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = room and public.is_room_member(r.id)
      and (
        (r.status = 'draft' and r.owner_id = (select auth.uid()) and r.pick_order is not null
          and r.pick_no >= r.teams * r.squad_size)
        or (r.status = 'liga' and (
          public.room_all_ready(r.id) or r.owner_id = (select auth.uid())
        ))
      )
  )
$$;
