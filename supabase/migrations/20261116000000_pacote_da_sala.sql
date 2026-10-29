-- The owner chooses the room's pack of players: the Brasileirão 2026 or the
-- Champions League 2026/27, the same built-in packs a career starts from
-- (BUILT_IN_PACKS in src/packs/index.ts). The draft lists the pack's players
-- (room-draft) and the league plays with the ones drafted, so a pack can be
-- changed only while the room waits. create_room and update_room read it
-- from `options`, next to the rules; a missing key keeps the Brasileirão, or
-- the pack the room already has.
alter table public.rooms drop constraint rooms_pack_check;
alter table public.rooms add constraint rooms_pack_check
  check (pack in ('brasileirao-2026', 'champions-2026'));

create or replace function public.create_room(
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
        name, owner_id, pack, invite_code, teams, squad_size, draft_order, pick_seconds,
        auto_reserves, legs, grace_hours, injuries, trades, draft_at
      ) values (
        cleaned, me,
        coalesce(options->>'pack', 'brasileirao-2026'),
        code,
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

create or replace function public.update_room(
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
      pack = coalesce(options->>'pack', r.pack),
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
