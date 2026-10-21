-- The draft becomes a FUT Draft (21/10/2026): each team picks a formation,
-- and on its turn chooses an empty place of it (the eleven, then the
-- reserves); five cards of that place's position are dealt from the players
-- still free, stronger ones more likely, and the team keeps one. The other
-- four go back to the pool. Everyone in the room sees the cards as they are
-- dealt. The automatic pick (clock, robots, reserves on automatic) deals the
-- first empty place and keeps the best card. The places are the same list as
-- teamSlots() in src/engine/room/slots.ts.

alter table public.room_teams add column formation text;
-- The place of the team the pick filled, counted from 0 as teamSlots() lists them.
alter table public.room_picks add column slot_index smallint;

-- The eleven places of each formation, from the keeper forwards.
create table public.room_formations (
  formation text primary key,
  slots text[] not null check (cardinality(slots) = 11)
);

insert into public.room_formations (formation, slots) values
  ('4-4-2', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'A', 'A']),
  ('4-3-3', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'A', 'A', 'A']),
  ('3-5-2', array['G', 'Z', 'Z', 'Z', 'M', 'M', 'M', 'M', 'M', 'A', 'A']),
  ('4-5-1', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'M', 'A']),
  ('5-3-2', array['G', 'L', 'Z', 'Z', 'Z', 'L', 'M', 'M', 'M', 'A', 'A']),
  ('3-4-3', array['G', 'Z', 'Z', 'Z', 'M', 'M', 'M', 'M', 'A', 'A', 'A']),
  ('4-2-4', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'A', 'A', 'A', 'A']),
  ('5-4-1', array['G', 'L', 'Z', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'A']),
  ('4-1-4-1', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'M', 'A']),
  ('4-2-3-1', array['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'M', 'A']);

alter table public.room_formations enable row level security;
create policy "room formations: read" on public.room_formations
  for select to authenticated using (true);

-- The cards dealt for a pick: one deal per pick, never dealt again.
create table public.room_deals (
  room_id bigint not null references public.rooms (id) on delete cascade,
  pick integer not null,
  slot smallint not null,
  slot_index smallint not null,
  player_ids text[] not null,
  dealt_at timestamptz not null default now(),
  primary key (room_id, pick),
  foreign key (room_id, slot) references public.room_teams (room_id, slot)
);

alter table public.room_deals enable row level security;
create policy "room deals: members read" on public.room_deals
  for select to authenticated using (public.is_room_member(room_id));
alter publication supabase_realtime add table public.room_deals;

-- A team's places: its formation's eleven, then the reserves for the squad size.
create function public.room_team_slots(room bigint, team smallint) returns text[]
language sql stable set search_path = '' as $$
  select f.slots || (array['G', 'Z', 'L', 'M', 'A', 'M', 'Z', 'A', 'L'])[1:r.squad_size - 11]
  from public.rooms r
  join public.room_teams t on t.room_id = r.id and t.slot = team
  join public.room_formations f on f.formation = coalesce(t.formation, '4-4-2')
  where r.id = room
$$;

-- The first place of the team that no pick has filled yet.
create function public.room_free_slot(room bigint, team smallint) returns smallint
language sql stable set search_path = '' as $$
  select (i - 1)::smallint
  from generate_subscripts(public.room_team_slots(room, team), 1) as i
  where not exists (
    select 1 from public.room_picks k
    where k.room_id = room and k.slot = team and k.slot_index = i - 1
  )
  order by i
  limit 1
$$;

-- Deals the cards of the pick under way for a place of the team on the
-- clock, if not dealt yet, and returns them. Five free players of the
-- place's position, drawn at random with the stronger ones more likely: the
-- weight falls by e for every 3 × teams places down the position's ranking
-- (Efraimidis-Spirakis sampling). A position with no one left free deals
-- from all positions.
create function public.room_deal(room bigint, team smallint, place smallint) returns text[]
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  pos text;
  dealt text[];
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
  insert into public.room_deals (room_id, pick, slot, slot_index, player_ids)
    values (room, found.pick_no, team, place, dealt);
  return dealt;
end;
$$;

-- The automatic pick: deals the team's first empty place if nothing was
-- dealt yet (a robot first takes one of the usual formations), and keeps the
-- best card.
create or replace function public.room_auto_choice(room bigint, team smallint)
returns text
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  dealt text[];
  chosen text;
begin
  select * into found from public.rooms r where r.id = room;
  update public.room_teams t set formation =
      (array['4-4-2', '4-3-3', '4-2-3-1', '3-5-2'])[1 + floor(random() * 4)::integer]
    where t.room_id = room and t.slot = team and t.robot and t.formation is null;
  select d.player_ids into dealt from public.room_deals d
    where d.room_id = room and d.pick = found.pick_no;
  if dealt is null then
    dealt := public.room_deal(room, team, public.room_free_slot(room, team));
  end if;
  select p.player_id into chosen
    from public.room_pool p
    where p.room_id = room and p.player_id = any (dealt)
      and public.room_pick_problem(room, team, p.player_id) is null
    order by p.rank
    limit 1;
  if chosen is null then
    raise exception 'nobody left to pick' using errcode = 'P0001';
  end if;
  return chosen;
end;
$$;

-- Records the next pick, in the place its cards were dealt for, and starts
-- the clock of the one after it.
create or replace function public.room_record_pick(
  room bigint, team smallint, player text, by_itself boolean
)
returns void
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  total integer;
begin
  select * into found from public.rooms r where r.id = room;
  total := found.teams * found.squad_size;
  insert into public.room_picks (room_id, pick, slot, player_id, auto, slot_index)
    values (room, found.pick_no, team, player, by_itself, (
      select d.slot_index from public.room_deals d
      where d.room_id = room and d.pick = found.pick_no
    ));
  update public.rooms r set
    pick_no = found.pick_no + 1,
    pick_deadline = case
      when found.pick_no + 1 < total then now() + make_interval(secs => found.pick_seconds)
    end
  where r.id = room;
end;
$$;

-- The signed-in user's formation, before the team's first card is dealt.
create function public.draft_set_formation(room bigint, chosen text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  mine smallint;
begin
  perform 1 from public.rooms r where r.id = room for update;
  select t.slot into mine from public.room_teams t where t.room_id = room and t.user_id = me;
  if mine is null then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if not exists (select 1 from public.room_formations f where f.formation = chosen) then
    raise exception 'bad formation' using errcode = 'P0001', hint = 'formacao';
  end if;
  if exists (select 1 from public.room_deals d where d.room_id = room and d.slot = mine) then
    raise exception 'already dealt' using errcode = 'P0001', hint = 'formacao-fixa';
  end if;
  update public.room_teams t set formation = chosen where t.room_id = room and t.slot = mine;
end;
$$;

-- On the signed-in user's turn: deals the cards for an empty place of their team.
create function public.draft_open_slot(room bigint, place smallint) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found public.rooms;
  mine smallint;
  places text[];
begin
  select * into found from public.rooms r where r.id = room for update;
  if found.id is null or not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if found.status <> 'draft' or found.pick_order is null
     or found.pick_no >= found.teams * found.squad_size then
    raise exception 'no draft running' using errcode = 'P0001', hint = 'sem-draft';
  end if;
  select t.slot into mine from public.room_teams t where t.room_id = room and t.user_id = me;
  if mine is null
     or mine <> public.room_slot_for_pick(found.pick_order, found.pick_no, found.draft_order) then
    raise exception 'not your turn' using errcode = 'P0001', hint = 'vez';
  end if;
  if exists (select 1 from public.room_deals d where d.room_id = room and d.pick = found.pick_no) then
    raise exception 'already dealt' using errcode = 'P0001', hint = 'ja-abriu';
  end if;
  places := public.room_team_slots(room, mine);
  if place is null or place < 0 or place >= cardinality(places) or exists (
    select 1 from public.room_picks k
    where k.room_id = room and k.slot = mine and k.slot_index = place
  ) then
    raise exception 'bad place' using errcode = 'P0001', hint = 'vaga';
  end if;
  return public.room_deal(room, mine, place);
end;
$$;

-- The signed-in user's pick: one of the cards dealt for this pick.
create or replace function public.draft_pick(room bigint, player text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found public.rooms;
  mine smallint;
  problem text;
begin
  select * into found from public.rooms r where r.id = room for update;
  if found.id is null or not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if found.status <> 'draft' or found.pick_order is null
     or found.pick_no >= found.teams * found.squad_size then
    raise exception 'no draft running' using errcode = 'P0001', hint = 'sem-draft';
  end if;
  select t.slot into mine from public.room_teams t where t.room_id = room and t.user_id = me;
  if mine is null
     or mine <> public.room_slot_for_pick(found.pick_order, found.pick_no, found.draft_order) then
    raise exception 'not your turn' using errcode = 'P0001', hint = 'vez';
  end if;
  if not exists (
    select 1 from public.room_deals d
    where d.room_id = room and d.pick = found.pick_no and player = any (d.player_ids)
  ) then
    raise exception 'not dealt' using errcode = 'P0001', hint = 'carta';
  end if;
  problem := public.room_pick_problem(room, mine, player);
  if problem is not null then
    raise exception 'pick refused' using errcode = 'P0001', hint = problem;
  end if;
  perform public.room_record_pick(room, mine, player, false);
  update public.room_teams t set misses = 0 where t.room_id = room and t.slot = mine;
  perform public.room_advance(room);
end;
$$;

revoke execute on function
  public.room_team_slots(bigint, smallint),
  public.room_free_slot(bigint, smallint),
  public.room_deal(bigint, smallint, smallint),
  public.draft_set_formation(bigint, text),
  public.draft_open_slot(bigint, smallint)
from public, anon, authenticated;

grant execute on function
  public.draft_set_formation(bigint, text),
  public.draft_open_slot(bigint, smallint)
to authenticated;
