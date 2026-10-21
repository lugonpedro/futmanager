-- The draft has no set time any more. Everyone in the waiting room marks
-- "Pronto"; with the room full and everyone ready, the draft starts (the
-- player's page calls room-draft, and the cron job does it too in case no
-- page did). The owner can still start it whenever they want, robots taking
-- the empty places. rooms.draft_at stays for the rooms that have it, unused.
alter table public.rooms alter column draft_at drop not null;
alter table public.rooms drop constraint rooms_draft_within_week;

-- create_room and update_room still take a time; there is none to check now.
create or replace function public.room_check_draft_at(draft_at timestamptz, created timestamptz)
returns void
language plpgsql stable set search_path = '' as $$
begin
end;
$$;

alter table public.room_members add column ready boolean not null default false;
alter publication supabase_realtime add table public.room_members;

-- Whether the room is full and everyone in it is ready.
create function public.room_wait_all_ready(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) = r.teams and bool_and(m.ready)
  from public.rooms r
  join public.room_members m on m.room_id = r.id
  where r.id = room
  group by r.teams
$$;

-- The signed-in user's "Pronto" in a waiting room; true when that made the
-- full room ready.
create function public.room_wait_ready(room bigint, on_ready boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.room_members m set ready = on_ready
    from public.rooms r
    where m.room_id = room and m.user_id = (select auth.uid())
      and r.id = m.room_id and r.status = 'espera';
  if not found then
    raise exception 'not waiting' using errcode = 'P0001', hint = 'membro';
  end if;
  return coalesce(public.room_wait_all_ready(room), false);
end;
$$;

-- The owner starts the draft whenever they want; anyone in the room once
-- it is full and everyone is ready.
create or replace function public.can_start_draft(room bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = room and r.status = 'espera'
      and (
        r.owner_id = (select auth.uid())
        or (public.is_room_member(r.id) and coalesce(public.room_wait_all_ready(r.id), false))
      )
  )
$$;

drop function public.room_lobby(bigint);
create function public.room_lobby(room bigint)
returns table (
  user_id uuid, nickname text, team_name text, short_name text,
  color_primary text, color_secondary text, joined_at timestamptz, ready boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_room_member(room) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  return query
    select m.user_id, p.nickname, m.team_name, m.short_name,
      m.color_primary, m.color_secondary, m.joined_at, m.ready
    from public.room_members m
    left join public.profiles p on p.user_id = m.user_id
    where m.room_id = room
    order by m.joined_at, m.user_id;
end;
$$;

revoke execute on function
  public.room_lobby(bigint),
  public.room_wait_all_ready(bigint),
  public.room_wait_ready(bigint, boolean)
from public, anon;
revoke execute on function public.room_wait_all_ready(bigint) from authenticated;
grant execute on function
  public.room_lobby(bigint),
  public.room_wait_ready(bigint, boolean)
to authenticated;

-- The cron job starts the rooms that are full and ready, and sets up again a
-- draft whose setting up was cut short; no draft time any more.
select cron.unschedule('room-draft');
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
  where (r.status = 'espera' and coalesce(public.room_wait_all_ready(r.id), false))
     or (r.status = 'draft' and r.pick_order is null);
  $$
);

-- No more "the draft starts in 15 minutes".
select cron.unschedule('room-notify-draft');
