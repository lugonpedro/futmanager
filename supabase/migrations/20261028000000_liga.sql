-- Online draft rooms: a first league after the draft, so a room can be
-- played end to end before the full D4 (pesquisa/13-draft-online.md). The
-- room's owner starts the league and plays each round through the
-- room-round function; every team plays its best lineup. Each round keeps
-- what the room's page shows (table, results, scorers, next matches) and the
-- packed replays, for watching the matches later.

create table public.room_rounds (
  room_id bigint not null references public.rooms (id) on delete cascade,
  -- 0 for the start of the league, before any match.
  round integer not null check (round >= 0),
  played_at timestamptz not null default now(),
  summary jsonb not null,
  replays text,
  -- Two calls for the same round can't both play it.
  primary key (room_id, round)
);

alter table public.room_rounds enable row level security;

create policy "room rounds: members read" on public.room_rounds
  for select to authenticated using (public.is_room_member(room_id));

alter publication supabase_realtime add table public.room_rounds;

-- Whether the signed-in user may start the league or play the next round:
-- the room's owner, once the draft is over and until the league is.
create function public.can_play_round(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = room and r.owner_id = (select auth.uid())
      and (r.status = 'liga'
        or (r.status = 'draft' and r.pick_order is not null
          and r.pick_no >= r.teams * r.squad_size))
  )
$$;

revoke execute on function public.can_play_round(bigint) from public, anon;
grant execute on function public.can_play_round(bigint) to authenticated;
