-- "Acelerar" on a round shown live: each person in the room asks for it, and
-- once everyone has, the round runs faster from that moment on for the whole
-- room. Robots, and teams whose person's account is gone, need not ask.

create table public.room_speedups (
  room_id bigint not null,
  round integer not null,
  slot smallint not null,
  asked_at timestamptz not null default now(),
  primary key (room_id, round, slot),
  foreign key (room_id, round) references public.room_rounds (room_id, round) on delete cascade,
  foreign key (room_id, slot) references public.room_teams (room_id, slot) on delete cascade
);

alter table public.room_speedups enable row level security;

create policy "room speedups: members read" on public.room_speedups
  for select to authenticated using (public.is_room_member(room_id));

-- When everyone asked for it; the round runs faster from then on.
alter table public.room_rounds add column sped_at timestamptz;

alter publication supabase_realtime add table public.room_speedups;

-- Asks for the round to go faster; true once everyone has asked, which
-- speeds it up for the whole room.
create function public.room_speed_up(room bigint, round integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  mine smallint;
begin
  select t.slot into mine from public.room_teams t
    where t.room_id = room and t.user_id = me and me is not null;
  if mine is null then
    raise exception 'not in room' using errcode = 'P0001', hint = 'membro';
  end if;
  if not exists (
    select 1 from public.room_rounds x where x.room_id = room and x.round = room_speed_up.round
  ) then
    raise exception 'no such round' using errcode = 'P0001', hint = 'rodada';
  end if;
  insert into public.room_speedups (room_id, round, slot)
    values (room, room_speed_up.round, mine)
    on conflict do nothing;
  if exists (
    select 1 from public.room_teams t
    where t.room_id = room and not t.robot and t.user_id is not null
      and not exists (
        select 1 from public.room_speedups s
        where s.room_id = room and s.round = room_speed_up.round and s.slot = t.slot
      )
  ) then
    return false;
  end if;
  update public.room_rounds x set sped_at = now()
    where x.room_id = room and x.round = room_speed_up.round and x.sped_at is null;
  return true;
end;
$$;

revoke execute on function public.room_speed_up(bigint, integer) from public, anon;
grant execute on function public.room_speed_up(bigint, integer) to authenticated;
