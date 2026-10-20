-- Online draft rooms, step D3: the live draft (pesquisa/13-draft-online.md).
-- When the draft starts, the room-draft function lists the pack's players
-- (room_pool), turns the people and the robots into the room's teams
-- (room_teams) and draws the order. From then on every pick goes through the
-- functions below, which follow the rules of src/engine/room/draft.ts: snake
-- order, two keepers per squad, and the automatic pick (the first of the
-- queue still free, otherwise the best free player in the position the squad
-- lacks most). The unique player per room in room_picks is what stops two
-- teams from having the same player, even if two picks land together.

alter table public.rooms
  -- Places in the order of the first round; null until the draft is set up.
  add column pick_order smallint[],
  -- How many of each position the automatic picks aim for, as squadShape() gives it.
  add column squad_shape jsonb,
  -- Picks made so far, which is also the number of the next one, from 0.
  add column pick_no integer not null default 0,
  add column pick_deadline timestamptz;

create table public.room_teams (
  room_id bigint not null references public.rooms (id) on delete cascade,
  slot smallint not null check (slot between 0 and 11),
  -- Empty for a robot, and for a person whose account is gone.
  user_id uuid references auth.users (id) on delete set null,
  team_name text not null,
  short_name text not null,
  color_primary text not null,
  color_secondary text not null,
  robot boolean not null,
  -- Picks on its own: switched on, or after missing two picks in a row.
  auto boolean not null default false,
  misses smallint not null default 0,
  primary key (room_id, slot),
  unique (room_id, user_id)
);

create table public.room_pool (
  room_id bigint not null references public.rooms (id) on delete cascade,
  player_id text not null,
  name text not null,
  position text not null check (position in ('G', 'Z', 'L', 'M', 'A')),
  overall smallint not null,
  age smallint not null,
  origin text not null,
  -- 0 for the best: the order the automatic picks go by.
  rank integer not null,
  primary key (room_id, player_id),
  unique (room_id, rank)
);

create table public.room_picks (
  room_id bigint not null references public.rooms (id) on delete cascade,
  pick integer not null check (pick >= 0),
  slot smallint not null,
  player_id text not null,
  -- Made by the clock, the queue or a robot rather than by hand.
  auto boolean not null,
  picked_at timestamptz not null default now(),
  primary key (room_id, pick),
  unique (room_id, player_id),
  foreign key (room_id, player_id) references public.room_pool (room_id, player_id),
  foreign key (room_id, slot) references public.room_teams (room_id, slot)
);

create table public.room_queues (
  room_id bigint not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_ids text[] not null default '{}' check (cardinality(player_ids) <= 200),
  primary key (room_id, user_id)
);

-- The seed and the whole room as the engine has it, packed. Only the server reads it.
create table public.room_states (
  room_id bigint primary key references public.rooms (id) on delete cascade,
  seed bigint not null,
  data text
);

alter table public.room_teams enable row level security;
alter table public.room_pool enable row level security;
alter table public.room_picks enable row level security;
alter table public.room_queues enable row level security;
alter table public.room_states enable row level security;
revoke all on public.room_states from anon, authenticated;

create policy "room teams: members read" on public.room_teams
  for select to authenticated using (public.is_room_member(room_id));
create policy "room pool: members read" on public.room_pool
  for select to authenticated using (public.is_room_member(room_id));
create policy "room picks: members read" on public.room_picks
  for select to authenticated using (public.is_room_member(room_id));
-- Nobody else sees whom you are after.
create policy "room queues: own read" on public.room_queues
  for select to authenticated using (user_id = (select auth.uid()));

-- The draft screen follows picks, the room and the teams live.
alter publication supabase_realtime add table public.room_picks, public.rooms, public.room_teams;

-- The place whose pick it is, as teamForPick(): snake order, and with the
-- third round reversed it goes in the second round's order from there.
create function public.room_slot_for_pick(pick_order smallint[], pick integer, style text)
returns smallint
language sql immutable set search_path = '' as $$
  select case
    when ((pick / n) % 2 = 0) <> (style = 'terceira-invertida' and pick / n >= 2)
      then pick_order[pick % n + 1]
    else pick_order[n - pick % n]
  end
  from (select cardinality(pick_order) as n) s
$$;

-- Why a team can't take this player now, as checkPick() minus whose turn it
-- is: a hint, or null when it can.
create function public.room_pick_problem(room bigint, team smallint, player text)
returns text
language plpgsql stable set search_path = '' as $$
declare
  found public.rooms;
  pos text;
  have integer;
  keepers integer;
begin
  select * into found from public.rooms r where r.id = room;
  select p.position into pos from public.room_pool p
    where p.room_id = room and p.player_id = player;
  if pos is null then
    return 'jogador';
  end if;
  if exists (select 1 from public.room_picks k where k.room_id = room and k.player_id = player) then
    return 'escolhido';
  end if;
  select count(*), count(*) filter (where p.position = 'G') into have, keepers
    from public.room_picks k
    join public.room_pool p on p.room_id = k.room_id and p.player_id = k.player_id
    where k.room_id = room and k.slot = team;
  if 2 - keepers - (case when pos = 'G' then 1 else 0 end) > found.squad_size - have - 1 then
    return 'goleiros';
  end if;
  return null;
end;
$$;

-- The pick made for a team that isn't picking itself, as autoPick(): the
-- first of its queue still allowed, or else the best free player in the
-- position its squad lacks most (the biggest share of it still missing).
create function public.room_auto_choice(room bigint, team smallint)
returns text
language plpgsql stable set search_path = '' as $$
declare
  found public.rooms;
  person uuid;
  queued text;
  have integer;
  keepers integer;
  chosen text;
begin
  select * into found from public.rooms r where r.id = room;
  select t.user_id into person from public.room_teams t
    where t.room_id = room and t.slot = team and not t.robot;
  if person is not null then
    select q.id into queued
      from public.room_queues rq, unnest(rq.player_ids) with ordinality as q (id, n)
      where rq.room_id = room and rq.user_id = person
        and public.room_pick_problem(room, team, q.id) is null
      order by q.n
      limit 1;
    if queued is not null then
      return queued;
    end if;
  end if;

  select count(*), count(*) filter (where p.position = 'G') into have, keepers
    from public.room_picks k
    join public.room_pool p on p.room_id = k.room_id and p.player_id = k.player_id
    where k.room_id = room and k.slot = team;
  with mine as (
    select p.position, count(*) as n
    from public.room_picks k
    join public.room_pool p on p.room_id = k.room_id and p.player_id = k.player_id
    where k.room_id = room and k.slot = team
    group by p.position
  )
  select p.player_id into chosen
    from public.room_pool p
    left join public.room_picks k on k.room_id = p.room_id and k.player_id = p.player_id
    left join mine m on m.position = p.position
    where p.room_id = room and k.player_id is null
      and 2 - keepers - (case when p.position = 'G' then 1 else 0 end)
        <= found.squad_size - have - 1
    order by
      ((found.squad_shape->>p.position)::integer - coalesce(m.n, 0))::numeric
        / (found.squad_shape->>p.position)::integer desc,
      p.rank
    limit 1;
  if chosen is null then
    raise exception 'nobody left to pick' using errcode = 'P0001';
  end if;
  return chosen;
end;
$$;

-- Records the next pick and starts the clock of the one after it.
create function public.room_record_pick(room bigint, team smallint, player text, by_itself boolean)
returns void
language plpgsql volatile set search_path = '' as $$
declare
  found public.rooms;
  total integer;
begin
  select * into found from public.rooms r where r.id = room;
  total := found.teams * found.squad_size;
  insert into public.room_picks (room_id, pick, slot, player_id, auto)
    values (room, found.pick_no, team, player, by_itself);
  update public.rooms r set
    pick_no = found.pick_no + 1,
    pick_deadline = case
      when found.pick_no + 1 < total then now() + make_interval(secs => found.pick_seconds)
    end
  where r.id = room;
end;
$$;

-- Makes the picks of every team that picks on its own, until it is a
-- person's turn again or the draft is over, as advanceDraft(): robots, people
-- on automatic, and the reserves when the room has them on automatic.
create function public.room_advance(room bigint) returns void
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
    perform public.room_record_pick(room, team.slot, public.room_auto_choice(room, team.slot), true);
  end loop;
end;
$$;

-- The signed-in user's pick. Errors carry a hint the app turns into a message.
create function public.draft_pick(room bigint, player text) returns void
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
  problem := public.room_pick_problem(room, mine, player);
  if problem is not null then
    raise exception 'pick refused' using errcode = 'P0001', hint = problem;
  end if;
  perform public.room_record_pick(room, mine, player, false);
  update public.room_teams t set misses = 0 where t.room_id = room and t.slot = mine;
  perform public.room_advance(room);
end;
$$;

-- Makes the pick of the team whose clock ran out, then of everyone who picks
-- on its own. Every browser in the room calls it when its clock reaches zero,
-- and a cron job when nobody has the page open; it does nothing before the
-- deadline, so repeated calls never spoil anything. Missing two picks in a row
-- puts a person on automatic. Returns whether it made a pick.
create function public.draft_tick(room bigint) returns boolean
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
    update public.room_teams t set
      misses = team.misses + 1,
      auto = team.auto or team.misses + 1 >= 2
    where t.room_id = room and t.slot = team.slot;
  end if;
  perform public.room_advance(room);
  return true;
end;
$$;

-- The cron job's round of every draft whose clock ran out.
create function public.draft_tick_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  room bigint;
  ticked integer := 0;
begin
  for room in
    select r.id from public.rooms r
    where r.status = 'draft' and r.pick_deadline <= now()
  loop
    if public.draft_tick(room) then
      ticked := ticked + 1;
    end if;
  end loop;
  return ticked;
end;
$$;

-- Switches the signed-in user's team to automatic or back. Back from
-- automatic, the missed picks start again from zero.
create function public.draft_set_auto(room bigint, on_auto boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  perform 1 from public.rooms r where r.id = room for update;
  update public.room_teams t set
    auto = on_auto,
    misses = case when on_auto then t.misses else 0 end
  where t.room_id = room and t.user_id = me;
  if not found then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if on_auto then
    perform public.room_advance(room);
  end if;
end;
$$;

-- Saves the signed-in user's queue of favourites, in their order.
create function public.save_draft_queue(room bigint, player_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if cardinality(player_ids) > 200 then
    raise exception 'queue too long' using errcode = 'P0001', hint = 'fila';
  end if;
  insert into public.room_queues (room_id, user_id, player_ids)
    values (room, me, player_ids)
    on conflict on constraint room_queues_pkey do update set player_ids = excluded.player_ids;
end;
$$;

-- The first step of starting a draft, for the room-draft function: closes
-- the waiting room and says whether the draft still has to be set up, with
-- the people in the order they joined. A second call while the first is
-- setting up answers the same, and setting up again writes the same rows.
create function public.room_begin_draft(room bigint)
returns table (
  needs_setup boolean, user_id uuid, team_name text, short_name text,
  color_primary text, color_secondary text
)
language plpgsql security definer set search_path = '' as $$
declare
  found public.rooms;
begin
  select * into found from public.rooms r where r.id = room for update;
  if found.id is null or found.status not in ('espera', 'draft') then
    return;
  end if;
  if found.status = 'espera' then
    update public.rooms r set status = 'draft' where r.id = room;
  end if;
  return query
    select found.pick_order is null, m.user_id, m.team_name, m.short_name,
      m.color_primary, m.color_secondary
    from public.room_members m
    where m.room_id = room
    order by m.joined_at, m.user_id;
end;
$$;

-- The last step of starting a draft: the order and the squad shape, the
-- first clock, and the robots' picks if they go first. Only once.
create function public.room_open_draft(room bigint, pick_order smallint[], squad_shape jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms r set
    pick_order = room_open_draft.pick_order,
    squad_shape = room_open_draft.squad_shape,
    pick_no = 0,
    pick_deadline = now() + make_interval(secs => r.pick_seconds)
  where r.id = room and r.status = 'draft' and r.pick_order is null;
  if found then
    perform public.room_advance(room);
  end if;
end;
$$;

-- Whether the signed-in user may start this room's draft now: its owner,
-- while it waits.
create function public.can_start_draft(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = room and r.owner_id = (select auth.uid()) and r.status = 'espera'
  )
$$;

revoke execute on function
  public.room_slot_for_pick(smallint[], integer, text),
  public.room_pick_problem(bigint, smallint, text),
  public.room_auto_choice(bigint, smallint),
  public.room_record_pick(bigint, smallint, text, boolean),
  public.room_advance(bigint),
  public.draft_pick(bigint, text),
  public.draft_tick(bigint),
  public.draft_tick_all(),
  public.draft_set_auto(bigint, boolean),
  public.save_draft_queue(bigint, text[]),
  public.room_begin_draft(bigint),
  public.room_open_draft(bigint, smallint[], jsonb),
  public.can_start_draft(bigint)
from public, anon, authenticated;

grant execute on function
  public.draft_pick(bigint, text),
  public.draft_tick(bigint),
  public.draft_set_auto(bigint, boolean),
  public.save_draft_queue(bigint, text[]),
  public.can_start_draft(bigint)
to authenticated;

grant execute on function
  public.draft_tick_all(),
  public.room_begin_draft(bigint),
  public.room_open_draft(bigint, smallint[], jsonb)
to service_role;

-- Clocks that ran out with nobody's page open, every 30 seconds.
select cron.schedule('draft-tick', '30 seconds', $$ select public.draft_tick_all() $$);

-- Drafts whose time came: every minute the database calls room-draft for
-- each, and again for one whose setting up was cut short. The project URL
-- and the shared secret are the ones the fantasy used, in the Vault.
select cron.schedule(
  'room-draft',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/room-draft',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := jsonb_build_object('room', r.id),
    timeout_milliseconds := 60000
  )
  from public.rooms r
  where (r.status = 'espera' and r.draft_at <= now())
     or (r.status = 'draft' and r.pick_order is null);
  $$
);
