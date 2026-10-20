-- Online draft rooms, step D2: the waiting room (pesquisa/13-draft-online.md).
-- Someone creates a room with its options and the time of the draft, friends
-- join with the invite code, and each one names their team and picks its
-- colours. Robots fill the teams nobody took when the draft starts (D3).
-- Everything that writes goes through the functions below, so the rules hold
-- whatever the browser sends.

create table public.rooms (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 3 and 40),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pack text not null default 'brasileirao-2026' check (pack in ('brasileirao-2026')),
  status text not null default 'espera'
    check (status in ('espera', 'draft', 'liga', 'encerrada')),
  -- Eight letters and digits, without the ones easy to mix up (0/O, 1/I).
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  -- The options of RoomOptions in src/engine/room/types.ts, with its defaults.
  teams smallint not null default 8 check (teams between 2 and 12 and teams % 2 = 0),
  squad_size smallint not null default 18 check (squad_size in (16, 18, 20)),
  draft_order text not null default 'serpentina'
    check (draft_order in ('serpentina', 'terceira-invertida')),
  pick_seconds smallint not null default 45 check (pick_seconds in (30, 45, 60, 90)),
  auto_reserves boolean not null default false,
  legs smallint not null default 2 check (legs between 1 and 3),
  grace_hours smallint not null default 24 check (grace_hours in (6, 12, 24, 48)),
  injuries text not null default 'normais' check (injuries in ('normais', 'curtas', 'desligadas')),
  trades text not null default 'ate-dois-tercos'
    check (trades in ('ate-dois-tercos', 'temporada', 'desligadas')),
  draft_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- A waiting room lasts a week at most.
  constraint rooms_draft_within_week check (draft_at <= created_at + interval '7 days')
);

create index rooms_owner on public.rooms (owner_id);

create table public.room_members (
  room_id bigint not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  team_name text not null check (char_length(team_name) between 3 and 24),
  short_name text not null check (short_name ~ '^[A-Z0-9]{2,4}$'),
  color_primary text not null check (color_primary ~ '^#[0-9a-f]{6}$'),
  color_secondary text not null check (color_secondary ~ '^#[0-9a-f]{6}$'),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  -- Two teams with the same short name would be impossible to tell apart in the table.
  constraint room_members_short_name unique (room_id, short_name)
);

create unique index room_members_team_name on public.room_members (room_id, lower(team_name));
create index room_members_user on public.room_members (user_id);

-- Whether the signed-in user is in the room. Security definer, so the
-- policies on the members table can ask without looking at themselves.
create function public.is_room_member(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = room and m.user_id = (select auth.uid())
  )
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

create policy "rooms: members read" on public.rooms
  for select to authenticated using (public.is_room_member(id));
-- A room in the middle of its draft or league would vanish for everyone; only
-- a waiting room or a finished one can be deleted.
create policy "rooms: owner deletes" on public.rooms
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status in ('espera', 'encerrada'));

create policy "room members: members read" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));

-- A fresh invite code. gen_random_uuid() is built in; its first six bytes and
-- two from the second half are random, and 256 splits evenly into 32 letters.
create function public.room_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 32, 1), '' order by i
  )
  from (select uuid_send(gen_random_uuid()) as b) r,
    unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

-- Raises the hint for a team the room can't take: a name of 3 to 24
-- letters, a short name of 2 to 4 capitals or digits and two colours.
create function public.room_check_team(
  team_name text, short_name text, color_primary text, color_secondary text
) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if team_name is null or char_length(btrim(team_name)) not between 3 and 24 then
    raise exception 'bad team name' using errcode = 'P0001', hint = 'time';
  end if;
  if short_name is null or short_name !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'bad short name' using errcode = 'P0001', hint = 'sigla';
  end if;
  if color_primary is null or color_primary !~ '^#[0-9a-f]{6}$'
     or color_secondary is null or color_secondary !~ '^#[0-9a-f]{6}$' then
    raise exception 'bad colours' using errcode = 'P0001', hint = 'cores';
  end if;
end;
$$;

-- Raises the hint for a draft time the room can't take: from now to a week on.
create function public.room_check_draft_at(draft_at timestamptz, created timestamptz)
returns void
language plpgsql stable set search_path = '' as $$
begin
  if draft_at is null or draft_at < now() - interval '1 minute'
     or draft_at > created + interval '7 days' then
    raise exception 'bad draft time' using errcode = 'P0001', hint = 'data';
  end if;
end;
$$;

-- Raises the hint when the signed-in user is in ten rooms not yet over.
create function public.room_check_limit(me uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if (select count(*) from public.room_members m
      join public.rooms r on r.id = m.room_id
      where m.user_id = me and r.status <> 'encerrada') >= 10 then
    raise exception 'too many rooms' using errcode = 'P0001', hint = 'limite';
  end if;
end;
$$;

-- Creates a room with its creator's team as the first one. `options` has the
-- keys of RoomOptions; a missing key keeps the default. Errors carry a hint the
-- app turns into a message for the player.
create function public.create_room(
  room_name text,
  options jsonb,
  draft_at timestamptz,
  team_name text,
  short_name text,
  color_primary text,
  color_secondary text
)
returns table (room_id bigint, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cleaned text := btrim(room_name);
  code text;
  created bigint;
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'P0001', hint = 'conta';
  end if;
  if char_length(cleaned) not between 3 and 40 then
    raise exception 'bad room name' using errcode = 'P0001', hint = 'nome';
  end if;
  perform public.room_check_team(team_name, short_name, color_primary, color_secondary);
  perform public.room_check_draft_at(draft_at, now());
  perform public.room_check_limit(me);

  loop
    code := public.room_invite_code();
    begin
      insert into public.rooms (
        name, owner_id, invite_code, teams, squad_size, draft_order, pick_seconds,
        auto_reserves, legs, grace_hours, injuries, trades, draft_at
      ) values (
        cleaned, me, code,
        coalesce((options->>'teams')::smallint, 8),
        coalesce((options->>'squadSize')::smallint, 18),
        coalesce(options->>'draftOrder', 'serpentina'),
        coalesce((options->>'pickSeconds')::smallint, 45),
        coalesce((options->>'autoReserves')::boolean, false),
        coalesce((options->>'legs')::smallint, 2),
        coalesce((options->>'graceHours')::smallint, 24),
        coalesce(options->>'injuries', 'normais'),
        coalesce(options->>'trades', 'ate-dois-tercos'),
        draft_at
      )
      returning id into created;
      exit;
    exception
      when unique_violation then
        -- Another room has the code already; draw again.
      when check_violation or invalid_text_representation or numeric_value_out_of_range then
        raise exception 'bad room options' using errcode = 'P0001', hint = 'opcoes';
    end;
  end loop;

  insert into public.room_members (
    room_id, user_id, team_name, short_name, color_primary, color_secondary
  ) values (created, me, btrim(team_name), short_name, color_primary, color_secondary);
  return query select created, code;
end;
$$;

-- Changes a waiting room's name, options and draft time. Only its owner may,
-- and never to fewer teams than people already in it.
create function public.update_room(
  room bigint, room_name text, options jsonb, draft_at timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cleaned text := btrim(room_name);
  found public.rooms;
begin
  select * into found from public.rooms r where r.id = room for update;
  if found.id is null or found.owner_id is distinct from me then
    raise exception 'not the owner' using errcode = 'P0001', hint = 'dono';
  end if;
  if found.status <> 'espera' then
    raise exception 'room has started' using errcode = 'P0001', hint = 'comecou';
  end if;
  if char_length(cleaned) not between 3 and 40 then
    raise exception 'bad room name' using errcode = 'P0001', hint = 'nome';
  end if;
  perform public.room_check_draft_at(draft_at, found.created_at);
  begin
    update public.rooms r set
      name = cleaned,
      teams = coalesce((options->>'teams')::smallint, r.teams),
      squad_size = coalesce((options->>'squadSize')::smallint, r.squad_size),
      draft_order = coalesce(options->>'draftOrder', r.draft_order),
      pick_seconds = coalesce((options->>'pickSeconds')::smallint, r.pick_seconds),
      auto_reserves = coalesce((options->>'autoReserves')::boolean, r.auto_reserves),
      legs = coalesce((options->>'legs')::smallint, r.legs),
      grace_hours = coalesce((options->>'graceHours')::smallint, r.grace_hours),
      injuries = coalesce(options->>'injuries', r.injuries),
      trades = coalesce(options->>'trades', r.trades),
      draft_at = update_room.draft_at
    where r.id = room;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'bad room options' using errcode = 'P0001', hint = 'opcoes';
  end;
  if (select r.teams from public.rooms r where r.id = room)
     < (select count(*) from public.room_members m where m.room_id = room) then
    raise exception 'fewer teams than people' using errcode = 'P0001', hint = 'poucos';
  end if;
end;
$$;

-- What the invite page shows before joining: the room's name, who made it,
-- how many are in it and whether it still takes people. Knowing the code is
-- being invited.
create function public.room_invite(code text)
returns table (
  room_id bigint, name text, owner_nickname text, members bigint, teams smallint,
  status text, draft_at timestamptz, joined boolean
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, p.nickname,
    (select count(*) from public.room_members m where m.room_id = r.id),
    r.teams, r.status, r.draft_at,
    public.is_room_member(r.id)
  from public.rooms r
  left join public.profiles p on p.user_id = r.owner_id
  where r.invite_code = upper(btrim(code))
$$;

-- Joins the room with that invite code, with the joiner's team; joining twice
-- changes nothing. Only a waiting room with a team still free takes people.
create function public.join_room(
  code text, team_name text, short_name text, color_primary text, color_secondary text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found public.rooms;
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'P0001', hint = 'conta';
  end if;
  select * into found from public.rooms r
    where r.invite_code = upper(btrim(code))
    for update;
  if found.id is null then
    raise exception 'no such room' using errcode = 'P0001', hint = 'convite';
  end if;
  if public.is_room_member(found.id) then
    return found.id;
  end if;
  if found.status <> 'espera' then
    raise exception 'room has started' using errcode = 'P0001', hint = 'comecou';
  end if;
  if (select count(*) from public.room_members m where m.room_id = found.id) >= found.teams then
    raise exception 'room is full' using errcode = 'P0001', hint = 'cheia';
  end if;
  perform public.room_check_team(team_name, short_name, color_primary, color_secondary);
  perform public.room_check_limit(me);
  begin
    insert into public.room_members (
      room_id, user_id, team_name, short_name, color_primary, color_secondary
    ) values (found.id, me, btrim(team_name), short_name, color_primary, color_secondary);
  exception when unique_violation then
    raise exception 'team taken' using errcode = 'P0001', hint = 'repetido';
  end;
  return found.id;
end;
$$;

-- Changes the signed-in user's team in a waiting room.
create function public.save_room_team(
  room bigint, team_name text, short_name text, color_primary text, color_secondary text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if (select r.status from public.rooms r where r.id = room) <> 'espera' then
    raise exception 'room has started' using errcode = 'P0001', hint = 'comecou';
  end if;
  perform public.room_check_team(team_name, short_name, color_primary, color_secondary);
  begin
    update public.room_members m set
      team_name = btrim(save_room_team.team_name),
      short_name = save_room_team.short_name,
      color_primary = save_room_team.color_primary,
      color_secondary = save_room_team.color_secondary
    where m.room_id = room and m.user_id = me;
  exception when unique_violation then
    raise exception 'team taken' using errcode = 'P0001', hint = 'repetido';
  end;
end;
$$;

-- Takes someone out of a waiting room: the signed-in user themselves, or
-- anyone if the owner asks. The owner can't leave; they delete the room.
create function public.leave_room(room bigint, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found public.rooms;
begin
  select * into found from public.rooms r where r.id = room for update;
  if found.id is null or not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  if member <> me and found.owner_id <> me then
    raise exception 'not the owner' using errcode = 'P0001', hint = 'dono';
  end if;
  if member = found.owner_id then
    raise exception 'owner cannot leave' using errcode = 'P0001', hint = 'dono-sai';
  end if;
  if found.status <> 'espera' then
    raise exception 'room has started' using errcode = 'P0001', hint = 'comecou';
  end if;
  delete from public.room_members m where m.room_id = room and m.user_id = member;
end;
$$;

-- The people of a room with their teams, in the order they joined. The
-- nickname comes from each one's profile, which only its owner reads.
create function public.room_lobby(room bigint)
returns table (
  user_id uuid, nickname text, team_name text, short_name text,
  color_primary text, color_secondary text, joined_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  return query
    select m.user_id, p.nickname, m.team_name, m.short_name,
      m.color_primary, m.color_secondary, m.joined_at
    from public.room_members m
    left join public.profiles p on p.user_id = m.user_id
    where m.room_id = room
    order by m.joined_at, m.user_id;
end;
$$;

revoke execute on function
  public.is_room_member(bigint),
  public.room_invite_code(),
  public.room_check_team(text, text, text, text),
  public.room_check_draft_at(timestamptz, timestamptz),
  public.room_check_limit(uuid),
  public.create_room(text, jsonb, timestamptz, text, text, text, text),
  public.update_room(bigint, text, jsonb, timestamptz),
  public.room_invite(text),
  public.join_room(text, text, text, text, text),
  public.save_room_team(bigint, text, text, text, text),
  public.leave_room(bigint, uuid),
  public.room_lobby(bigint)
from public, anon;

grant execute on function
  public.is_room_member(bigint),
  public.create_room(text, jsonb, timestamptz, text, text, text, text),
  public.update_room(bigint, text, jsonb, timestamptz),
  public.room_invite(text),
  public.join_room(text, text, text, text, text),
  public.save_room_team(bigint, text, text, text, text),
  public.leave_room(bigint, uuid),
  public.room_lobby(bigint)
to authenticated;

-- A waiting room whose draft never started goes away a day after the week it
-- had. Every day at 4h in Brasília (7h UTC).
select cron.schedule(
  'rooms-expire',
  '0 7 * * *',
  $$ delete from public.rooms where status = 'espera' and created_at < now() - interval '8 days' $$
);
