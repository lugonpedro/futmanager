-- Online draft rooms, step D5 (pesquisa/13-draft-online.md): the market,
-- with no money. Claims for free players are kept here and settled by
-- room-round before each round, worst placed first. Trades are proposed
-- here and made by room-market the moment the other side accepts; releases
-- go through room-market too, since both change the room's state. Each
-- change goes on the room's feed.

-- The room's state, read and written by room-round and room-market: each
-- write checks the version it read, so the two never undo each other.
alter table public.room_states add column version integer not null default 0;

-- Who plays where, as the room's state has it, for the page to read: the
-- drafted and claimed players with their team, and the released ones with
-- no team and the first round they may be claimed in.
create table public.room_rosters (
  room_id bigint not null references public.rooms (id) on delete cascade,
  player_id text not null,
  slot smallint,
  claimable_from smallint,
  primary key (room_id, player_id),
  check ((slot is null) <> (claimable_from is null))
);

create index room_rosters_slot on public.room_rosters (room_id, slot);

-- Claims for free players, in the order each person wants them tried.
create table public.room_claims (
  room_id bigint not null references public.rooms (id) on delete cascade,
  slot smallint not null,
  player_id text not null,
  -- Who leaves in exchange; none while the squad has an open spot.
  release_id text,
  position smallint not null,
  created_at timestamptz not null default now(),
  primary key (room_id, slot, player_id),
  foreign key (room_id, slot) references public.room_teams (room_id, slot) on delete cascade
);

create table public.room_trades (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms (id) on delete cascade,
  from_slot smallint not null,
  to_slot smallint not null,
  give text[] not null,
  take text[] not null,
  status text not null default 'proposta'
    check (status in ('proposta', 'aceita', 'recusada', 'cancelada', 'vencida', 'invalida')),
  round smallint not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (room_id, from_slot) references public.room_teams (room_id, slot) on delete cascade,
  foreign key (room_id, to_slot) references public.room_teams (room_id, slot) on delete cascade
);

create index room_trades_room on public.room_trades (room_id, status);

-- What happened in the market, for everyone in the room to see.
create table public.room_feed (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms (id) on delete cascade,
  round smallint not null,
  kind text not null check (kind in ('troca', 'livre', 'dispensa')),
  slot smallint not null,
  -- The other team of a trade.
  other_slot smallint,
  -- Players who joined `slot`, and who left it.
  players_in text[] not null default '{}',
  players_out text[] not null default '{}',
  at timestamptz not null default now()
);

create index room_feed_room on public.room_feed (room_id, id desc);

alter table public.room_rosters enable row level security;
alter table public.room_claims enable row level security;
alter table public.room_trades enable row level security;
alter table public.room_feed enable row level security;

create policy "room rosters: members read" on public.room_rosters
  for select to authenticated using (public.is_room_member(room_id));
create policy "room feed: members read" on public.room_feed
  for select to authenticated using (public.is_room_member(room_id));
-- Nobody else sees whom you are after.
create policy "room claims: own read" on public.room_claims
  for select to authenticated using (
    exists (
      select 1 from public.room_teams t
      where t.room_id = room_claims.room_id and t.slot = room_claims.slot
        and t.user_id = (select auth.uid())
    )
  );
-- A proposal is seen by the two sides; the feed shows the ones made.
create policy "room trades: both sides read" on public.room_trades
  for select to authenticated using (
    exists (
      select 1 from public.room_teams t
      where t.room_id = room_trades.room_id and t.slot in (room_trades.from_slot, room_trades.to_slot)
        and t.user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.room_rosters, public.room_trades,
  public.room_feed;

-- Leagues already on: their squads are still the draft's.
insert into public.room_rosters (room_id, player_id, slot)
select p.room_id, p.player_id, p.slot
from public.room_picks p
join public.rooms r on r.id = p.room_id
where r.status in ('liga', 'encerrada');

-- Whether trades are open in the room's coming round, by its option: never,
-- the whole league, or up to two thirds of its rounds.
create function public.room_trades_open(found public.rooms) returns boolean
language sql immutable as $$
  select found.status = 'liga' and found.round_no is not null and case found.trades
    when 'desligadas' then false
    when 'temporada' then true
    else found.round_no <= ceil(found.legs * (found.teams - 1) * 2 / 3.0)
  end
$$;

-- Asks for a free player, giving one up in exchange or filling an open spot.
-- It is settled before the next round; room-round checks it again then.
create function public.room_claim(room bigint, player text, release text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
begin
  if not exists (select 1 from public.room_pool p where p.room_id = room and p.player_id = player)
     or exists (
       select 1 from public.room_rosters r
       where r.room_id = room and r.player_id = player and r.slot is not null
     ) then
    raise exception 'not free' using errcode = 'P0001', hint = 'livre';
  end if;
  if release is not null and not exists (
    select 1 from public.room_rosters r
    where r.room_id = room and r.player_id = release and r.slot = mine.slot
  ) then
    raise exception 'not yours' using errcode = 'P0001', hint = 'elenco';
  end if;
  if (select count(*) from public.room_claims c where c.room_id = room and c.slot = mine.slot)
     >= 10 then
    raise exception 'too many claims' using errcode = 'P0001', hint = 'pedidos';
  end if;
  insert into public.room_claims (room_id, slot, player_id, release_id, position)
  values (
    room, mine.slot, player, release,
    coalesce((select max(c.position) + 1 from public.room_claims c
              where c.room_id = room and c.slot = mine.slot), 0)
  )
  on conflict (room_id, slot, player_id) do update set release_id = excluded.release_id;
end;
$$;

create function public.room_unclaim(room bigint, player text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
begin
  delete from public.room_claims c
  where c.room_id = room and c.slot = mine.slot and c.player_id = player;
end;
$$;

-- Puts the signed-in user's claims in a new order, first tried first.
create function public.room_order_claims(room bigint, players text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
begin
  update public.room_claims c
  set position = o.n - 1
  from unnest(players) with ordinality as o (player_id, n)
  where c.room_id = room and c.slot = mine.slot and c.player_id = o.player_id;
end;
$$;

-- Offers a trade to another person in the room: one to three players each
-- way, the same number on both sides. room-market checks the rest when the
-- other side accepts.
create function public.room_propose_trade(
  room bigint, to_slot smallint, give text[], take text[]
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  mine public.room_teams := public.room_my_team(room);
  found public.rooms;
  created bigint;
begin
  select * into found from public.rooms r where r.id = room;
  if not public.room_trades_open(found) then
    raise exception 'trades closed' using errcode = 'P0001', hint = 'trocas';
  end if;
  if to_slot = mine.slot or not exists (
    select 1 from public.room_teams t
    where t.room_id = room and t.slot = to_slot and not t.robot and t.user_id is not null
  ) then
    raise exception 'bad partner' using errcode = 'P0001', hint = 'parceiro';
  end if;
  if coalesce(cardinality(give), 0) not between 1 and 3
     or cardinality(give) <> coalesce(cardinality(take), 0)
     or (select count(distinct g) from unnest(give || take) g) <> 2 * cardinality(give) then
    raise exception 'bad trade' using errcode = 'P0001', hint = 'troca';
  end if;
  if (select count(*) from public.room_rosters r
      where r.room_id = room and r.slot = mine.slot and r.player_id = any (give))
       <> cardinality(give)
     or (select count(*) from public.room_rosters r
         where r.room_id = room and r.slot = to_slot and r.player_id = any (take))
       <> cardinality(take) then
    raise exception 'not in squads' using errcode = 'P0001', hint = 'elenco';
  end if;
  if (select count(*) from public.room_trades t
      where t.room_id = room and t.from_slot = mine.slot and t.status = 'proposta') >= 5 then
    raise exception 'too many trades' using errcode = 'P0001', hint = 'propostas';
  end if;
  insert into public.room_trades (room_id, from_slot, to_slot, give, take, round)
  values (room, mine.slot, to_slot, give, take, found.round_no)
  returning id into created;
  return created;
end;
$$;

-- Withdraws an offer the user made, or turns down one made to them.
-- Accepting goes through room-market, which makes the trade.
create function public.room_drop_trade(trade bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  offer public.room_trades;
begin
  select * into offer from public.room_trades t where t.id = trade for update;
  if offer.id is null or offer.status <> 'proposta' then
    raise exception 'no such offer' using errcode = 'P0001', hint = 'proposta';
  end if;
  update public.room_trades t
  set status = case
        when exists (select 1 from public.room_teams x where x.room_id = offer.room_id
                     and x.slot = offer.from_slot and x.user_id = me) then 'cancelada'
        else 'recusada'
      end,
      decided_at = now()
  where t.id = trade
    and exists (
      select 1 from public.room_teams x
      where x.room_id = offer.room_id and x.slot in (offer.from_slot, offer.to_slot)
        and x.user_id = me
    );
  if not found then
    raise exception 'not yours' using errcode = 'P0001', hint = 'membro';
  end if;
end;
$$;

-- The user's team in a room whose league is on, for room-market; none otherwise.
create function public.room_market_slot(room bigint) returns smallint
language sql stable security definer set search_path = '' as $$
  select t.slot from public.room_teams t
  join public.rooms r on r.id = t.room_id
  where t.room_id = room and r.status = 'liga'
    and t.user_id = (select auth.uid()) and not t.robot
$$;

-- After room-round plays a round (or starts the league, with 0): opens the
-- next one, or closes the room when the league is over. Offers nobody
-- answered lapse with the round.
create or replace function public.room_open_round(room bigint, played smallint, over boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms
  set status = case when over then 'encerrada' else 'liga' end,
      round_no = case when over then null else played + 1 end,
      round_opened_at = now(),
      round_called_at = null
  where id = room;
  delete from public.room_lineups l where l.room_id = room and l.round <= played;
  update public.room_trades t set status = 'vencida', decided_at = now()
  where t.room_id = room and t.status = 'proposta';
end;
$$;

revoke execute on function
  public.room_claim(bigint, text, text),
  public.room_unclaim(bigint, text),
  public.room_order_claims(bigint, text[]),
  public.room_propose_trade(bigint, smallint, text[], text[]),
  public.room_drop_trade(bigint),
  public.room_market_slot(bigint)
from public, anon;
grant execute on function
  public.room_claim(bigint, text, text),
  public.room_unclaim(bigint, text),
  public.room_order_claims(bigint, text[]),
  public.room_propose_trade(bigint, smallint, text[], text[]),
  public.room_drop_trade(bigint),
  public.room_market_slot(bigint)
to authenticated;
