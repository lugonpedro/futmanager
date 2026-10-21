-- Online draft rooms, step D4 (pesquisa/13-draft-online.md): each person sets
-- their team and marks "Pronto", and the round is played as soon as everyone
-- is ready. If someone never marks it, the owner may play the round after the
-- room's grace period, and anyone may after twice that. When the league is
-- over, "Revanche" opens a new room with the same people and options.

-- The round people are setting their teams for, from 1, and when it opened.
alter table public.rooms
  add column round_no smallint,
  add column round_opened_at timestamptz,
  -- When the database last asked room-round to play, so the cron job only
  -- repeats a call that failed.
  add column round_called_at timestamptz,
  -- The room "Revanche" opened, once someone pressed it.
  add column rematch_id bigint references public.rooms (id) on delete set null;

-- Leagues already on start their coming round now.
update public.rooms r
set round_no = (select max(x.round) + 1 from public.room_rounds x where x.room_id = r.id),
    round_opened_at = now()
where r.status = 'liga';

-- The round the team's person marked "Pronto" for. Keeping the round instead
-- of a yes or no means nothing needs undoing when a round is played.
alter table public.room_teams add column ready_round smallint;

-- What each team needs to set its lineup for the next round (players,
-- energy, form, who is out and the lineup it plays if nothing changes), as
-- room-round writes it after each round. Everyone in the room may look.
create table public.room_squads (
  room_id bigint not null references public.rooms (id) on delete cascade,
  slot smallint not null,
  data jsonb not null,
  primary key (room_id, slot),
  foreign key (room_id, slot) references public.room_teams (room_id, slot) on delete cascade
);

-- The lineup a person saved for a round; only they see it before the round.
create table public.room_lineups (
  room_id bigint not null references public.rooms (id) on delete cascade,
  slot smallint not null,
  round smallint not null,
  lineup jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (room_id, slot),
  foreign key (room_id, slot) references public.room_teams (room_id, slot) on delete cascade
);

alter table public.room_squads enable row level security;
alter table public.room_lineups enable row level security;

create policy "room squads: members read" on public.room_squads
  for select to authenticated using (public.is_room_member(room_id));
create policy "room lineups: own read" on public.room_lineups
  for select to authenticated using (
    exists (
      select 1 from public.room_teams t
      where t.room_id = room_lineups.room_id and t.slot = room_lineups.slot
        and t.user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.room_squads;

-- The team the signed-in user plays in a room whose league is on, locked.
create function public.room_my_team(room bigint) returns public.room_teams
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found public.room_teams;
begin
  if not exists (select 1 from public.rooms r where r.id = room and r.status = 'liga') then
    raise exception 'league not on' using errcode = 'P0001', hint = 'liga';
  end if;
  select * into found from public.room_teams t
  where t.room_id = room and t.user_id = me and me is not null
  for update;
  if found.slot is null then
    raise exception 'not in room' using errcode = 'P0001', hint = 'membro';
  end if;
  return found;
end;
$$;

-- Saves the signed-in user's lineup for the coming round. The database checks
-- the shape and that every player is in the squad; room-round checks the
-- rest with the engine's rules and plays the last good lineup otherwise.
create function public.save_room_lineup(room bigint, lineup jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
  ids text[];
begin
  if jsonb_typeof(lineup->'starters') <> 'array' or jsonb_typeof(lineup->'bench') <> 'array'
     or jsonb_array_length(lineup->'starters') <> 11
     or jsonb_array_length(lineup->'bench') > 12
     or octet_length(lineup::text) > 4000 then
    raise exception 'bad lineup' using errcode = 'P0001', hint = 'escalacao';
  end if;
  ids := array(
    select s->>'playerId' from jsonb_array_elements(lineup->'starters') s
    union all
    select b #>> '{}' from jsonb_array_elements(lineup->'bench') b
  );
  if exists (select 1 from unnest(ids) i where i is null)
     or (select count(distinct i) from unnest(ids) i) <> cardinality(ids)
     or exists (
       select 1 from unnest(ids) i
       where not exists (
         select 1 from public.room_picks p
         where p.room_id = room and p.slot = mine.slot and p.player_id = i
       )
     ) then
    raise exception 'bad lineup' using errcode = 'P0001', hint = 'escalacao';
  end if;
  insert into public.room_lineups (room_id, slot, round, lineup)
  select room, mine.slot, r.round_no, lineup from public.rooms r where r.id = room
  on conflict (room_id, slot) do update
    set round = excluded.round, lineup = excluded.lineup, saved_at = now();
end;
$$;

-- Whether every person in the room marked "Pronto" for the coming round.
-- Robots are always ready, and so is a team whose person's account is gone.
create function public.room_all_ready(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select r.status = 'liga' and r.round_no is not null and not exists (
    select 1 from public.room_teams t
    where t.room_id = r.id and not t.robot and t.user_id is not null
      and t.ready_round is distinct from r.round_no
  )
  from public.rooms r where r.id = room
$$;

-- Asks room-round to play the room's round, through pg_net, as the cron jobs
-- call room-draft. The round goes along, so a late call never plays the next.
create function public.room_call_round(room bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  next smallint;
begin
  update public.rooms set round_called_at = now()
  where id = room
  returning round_no into next;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/room-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := jsonb_build_object('room', room, 'round', next),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Marks or unmarks the signed-in user as ready for the coming round. The last
-- one to mark it has the round played right away.
create function public.room_ready(room bigint, on_ready boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
begin
  update public.room_teams t
  set ready_round = case when on_ready then r.round_no end
  from public.rooms r
  where r.id = room and t.room_id = room and t.slot = mine.slot;
  if on_ready and public.room_all_ready(room) then
    perform public.room_call_round(room);
    return true;
  end if;
  return false;
end;
$$;

-- Whether the signed-in user may start the league or play the coming round:
-- the owner once the draft is over; then anyone once everyone is ready, the
-- owner after the grace period, and anyone after twice that.
create or replace function public.can_play_round(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = room and public.is_room_member(r.id)
      and (
        (r.status = 'draft' and r.owner_id = (select auth.uid()) and r.pick_order is not null
          and r.pick_no >= r.teams * r.squad_size)
        or (r.status = 'liga' and (
          public.room_all_ready(r.id)
          or (r.owner_id = (select auth.uid())
            and r.round_opened_at + make_interval(hours => r.grace_hours) <= now())
          or r.round_opened_at + make_interval(hours => 2 * r.grace_hours) <= now()
        ))
      )
  )
$$;

-- Whether room-round, called by the database, should play this round now.
create function public.room_round_due(room bigint, round smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select r.round_no = round and public.room_all_ready(r.id)
  from public.rooms r where r.id = room
$$;

-- After room-round plays a round (or starts the league, with 0): opens the
-- next one, or closes the room when the league is over.
create function public.room_open_round(room bigint, played smallint, over boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms
  set status = case when over then 'encerrada' else 'liga' end,
      round_no = case when over then null else played + 1 end,
      round_opened_at = now(),
      round_called_at = null
  where id = room;
  delete from public.room_lineups l where l.room_id = room and l.round <= played;
end;
$$;

-- "Revanche": a new waiting room with the same people, teams and options,
-- its draft a day later. The first to press it creates it and becomes its
-- owner; the others find it on the old room.
create function public.room_rematch(room bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  old public.rooms;
  code text;
  created bigint;
begin
  select * into old from public.rooms r where r.id = room for update;
  if old.id is null or not public.is_room_member(room) then
    raise exception 'not in room' using errcode = 'P0001', hint = 'membro';
  end if;
  if old.rematch_id is not null then
    return old.rematch_id;
  end if;
  if old.status <> 'encerrada' then
    raise exception 'league not over' using errcode = 'P0001', hint = 'nao-acabou';
  end if;
  perform public.room_check_limit(me);

  loop
    code := public.room_invite_code();
    begin
      insert into public.rooms (
        name, owner_id, pack, invite_code, teams, squad_size, draft_order, pick_seconds,
        auto_reserves, legs, grace_hours, injuries, trades, draft_at
      ) values (
        old.name, me, old.pack, code, old.teams, old.squad_size, old.draft_order,
        old.pick_seconds, old.auto_reserves, old.legs, old.grace_hours, old.injuries,
        old.trades, now() + interval '1 day'
      )
      returning id into created;
      exit;
    exception
      when unique_violation then
        -- Another room has the code already; draw again.
    end;
  end loop;

  insert into public.room_members (
    room_id, user_id, team_name, short_name, color_primary, color_secondary
  )
  select created, m.user_id, m.team_name, m.short_name, m.color_primary, m.color_secondary
  from public.room_members m where m.room_id = room;
  update public.rooms set rematch_id = created where id = room;
  return created;
end;
$$;

revoke execute on function
  public.room_my_team(bigint),
  public.save_room_lineup(bigint, jsonb),
  public.room_all_ready(bigint),
  public.room_call_round(bigint),
  public.room_ready(bigint, boolean),
  public.room_round_due(bigint, smallint),
  public.room_open_round(bigint, smallint, boolean),
  public.room_rematch(bigint)
from public, anon;
grant execute on function
  public.save_room_lineup(bigint, jsonb),
  public.room_ready(bigint, boolean),
  public.room_rematch(bigint)
to authenticated;
grant execute on function
  public.room_round_due(bigint, smallint),
  public.room_open_round(bigint, smallint, boolean)
to service_role;

-- A round everyone was ready for whose call failed: asked again every
-- minute, two minutes after the last try.
select cron.schedule(
  'room-round',
  '* * * * *',
  $$
  select public.room_call_round(r.id)
  from public.rooms r
  where r.status = 'liga'
    and (r.round_called_at is null or r.round_called_at < now() - interval '2 minutes')
    and public.room_all_ready(r.id)
  $$
);
