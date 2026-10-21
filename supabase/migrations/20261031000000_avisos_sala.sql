-- Online draft rooms, step D6 (pesquisa/13-draft-online.md): push notices.
-- The database sees each moment worth a notice (the draft is about to start
-- or started, it is someone's pick, only one person is not ready, a round
-- was played, a trade was offered) and asks room-notify to send it, through
-- pg_net with the shared secret, as it calls room-round. The browsers'
-- subscriptions are the ones the fantasy used: "rounds" now means the
-- room's draft and rounds, "market" the trade offers.

-- Which notices already went out, so each goes out once.
create table public.room_notices (
  room_id bigint not null references public.rooms (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (room_id, key)
);

alter table public.room_notices enable row level security;
revoke all on public.room_notices from anon, authenticated;

-- Asks room-notify to send a notice of this kind to these teams' people (to
-- everyone in the room when `slots` is null), unless one with this key went
-- out already.
create function public.room_notify(
  room bigint, kind text, slots smallint[], data jsonb, key text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fresh integer;
begin
  insert into public.room_notices (room_id, key) values (room, key) on conflict do nothing;
  get diagnostics fresh = row_count;
  if fresh = 0 then
    return;
  end if;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/room-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := jsonb_build_object('room', room, 'kind', kind, 'slots', slots, 'data', data),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.room_notify(bigint, text, smallint[], jsonb, text)
  from public, anon, authenticated;

-- The draft started, whose pick it is, and a round played: all changes to
-- the room's row.
create function public.room_notice_on_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  on_clock smallint;
begin
  if old.pick_order is null and new.pick_order is not null then
    perform public.room_notify(new.id, 'comecou', null, '{}', 'comecou');
  end if;
  if new.status = 'draft' and new.pick_order is not null
     and new.pick_no < new.teams * new.squad_size
     and (new.pick_no is distinct from old.pick_no or old.pick_order is null) then
    on_clock := public.room_slot_for_pick(new.pick_order, new.pick_no, new.draft_order);
    -- Only a person who picks for themselves; robots and the automatic pick need no nudge.
    if exists (
      select 1 from public.room_teams t
      where t.room_id = new.id and t.slot = on_clock
        and not t.robot and not t.auto and t.user_id is not null
    ) then
      perform public.room_notify(
        new.id, 'vez', array[on_clock], jsonb_build_object('pick', new.pick_no),
        'vez-' || new.pick_no
      );
    end if;
  end if;
  if old.round_no is not null and new.round_no is distinct from old.round_no then
    perform public.room_notify(
      new.id, 'rodada', null,
      jsonb_build_object('round', old.round_no, 'over', new.status = 'encerrada'),
      'rodada-' || old.round_no
    );
  end if;
  return null;
end;
$$;

create trigger room_notices after update on public.rooms
  for each row execute function public.room_notice_on_room();

-- Someone marked "Pronto" and only one person is left: a nudge for them.
create function public.room_notice_on_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  found_room public.rooms;
  waiting smallint[];
begin
  if new.ready_round is null or new.ready_round is not distinct from old.ready_round then
    return null;
  end if;
  select * into found_room from public.rooms r where r.id = new.room_id;
  if found_room.status <> 'liga' or found_room.round_no is distinct from new.ready_round then
    return null;
  end if;
  waiting := array(
    select t.slot from public.room_teams t
    where t.room_id = new.room_id and not t.robot and t.user_id is not null
      and t.ready_round is distinct from found_room.round_no
  );
  if cardinality(waiting) = 1 then
    perform public.room_notify(
      new.room_id, 'falta', waiting, jsonb_build_object('round', found_room.round_no),
      'falta-' || found_room.round_no || '-' || waiting[1]
    );
  end if;
  return null;
end;
$$;

create trigger room_notices after update of ready_round on public.room_teams
  for each row execute function public.room_notice_on_ready();

create function public.room_notice_on_trade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.room_notify(
    new.room_id, 'troca', array[new.to_slot], jsonb_build_object('from', new.from_slot),
    'troca-' || new.id
  );
  return null;
end;
$$;

create trigger room_notices after insert on public.room_trades
  for each row execute function public.room_notice_on_trade();

revoke execute on function
  public.room_notice_on_room(),
  public.room_notice_on_ready(),
  public.room_notice_on_trade()
from public, anon, authenticated;

-- Drafts starting within 15 minutes, every minute; a draft moved to another
-- time gets its own warning.
select cron.schedule(
  'room-notify-draft',
  '* * * * *',
  $$
  select public.room_notify(
    r.id, 'breve', null, jsonb_build_object('at', r.draft_at),
    'breve-' || extract(epoch from r.draft_at)::bigint
  )
  from public.rooms r
  where r.status = 'espera' and r.draft_at > now() and r.draft_at <= now() + interval '15 minutes'
  $$
);
