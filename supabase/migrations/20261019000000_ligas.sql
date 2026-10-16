-- Online fantasy, step O5: private leagues among friends. A league belongs to
-- one official season; whoever has the invite code can join it, and only its
-- members see who is in it and the standings. Everything that writes goes
-- through the functions below, so the rules hold whatever the browser sends.

create table public.fantasy_leagues (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.fantasy_seasons (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 40),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Eight letters and digits, without the ones easy to mix up (0/O, 1/I).
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create index fantasy_leagues_owner on public.fantasy_leagues (owner_id, season_id);

create table public.fantasy_league_members (
  league_id bigint not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index fantasy_league_members_user on public.fantasy_league_members (user_id);

-- Whether the signed-in user is in the league. Security definer, so the
-- policies on the members table can ask without looking at themselves.
create function public.is_fantasy_league_member(league bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fantasy_league_members m
    where m.league_id = league and m.user_id = (select auth.uid())
  )
$$;

alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_league_members enable row level security;

create policy "fantasy leagues: members read" on public.fantasy_leagues
  for select to authenticated using (public.is_fantasy_league_member(id));
create policy "fantasy leagues: owner deletes" on public.fantasy_leagues
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "fantasy league members: members read" on public.fantasy_league_members
  for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "fantasy league members: leave" on public.fantasy_league_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- A fresh invite code. gen_random_uuid() is built in; its first six bytes and
-- two from the second half are random, and 256 splits evenly into 32 letters.
create function public.fantasy_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 32, 1), '' order by i
  )
  from (select uuid_send(gen_random_uuid()) as b) r,
    unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

-- Creates a league in the running season with its creator as the first
-- member; ten leagues per person and season at most. Errors carry a hint the app turns into a message for the player.
create function public.create_fantasy_league(league_name text)
returns table (league_id bigint, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  season bigint;
  code text;
  created bigint;
  cleaned text := btrim(league_name);
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'P0001', hint = 'conta';
  end if;
  if char_length(cleaned) not between 3 and 40 then
    raise exception 'bad league name' using errcode = 'P0001', hint = 'nome';
  end if;
  select s.id into season from public.fantasy_seasons s where s.status = 'em_andamento';
  if season is null then
    raise exception 'no running season' using errcode = 'P0001', hint = 'temporada';
  end if;
  if (select count(*) from public.fantasy_leagues l
      where l.owner_id = me and l.season_id = season)
     >= 10 then
    raise exception 'too many leagues' using errcode = 'P0001', hint = 'limite';
  end if;

  loop
    code := public.fantasy_invite_code();
    begin
      insert into public.fantasy_leagues (season_id, name, owner_id, invite_code)
        values (season, cleaned, me, code)
        returning id into created;
      exit;
    exception when unique_violation then
      -- Another league has the code already; draw again.
    end;
  end loop;

  insert into public.fantasy_league_members (league_id, user_id) values (created, me);
  return query select created, code;
end;
$$;

-- What the invite page shows before joining: the league's name, who made it
-- and how many are in it. Knowing the code is being invited.
create function public.fantasy_league_invite(code text)
returns table (league_id bigint, name text, owner_nickname text, members bigint, joined boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, p.nickname,
    (select count(*) from public.fantasy_league_members m where m.league_id = l.id),
    public.is_fantasy_league_member(l.id)
  from public.fantasy_leagues l
  left join public.profiles p on p.user_id = l.owner_id
  where l.invite_code = upper(btrim(code))
$$;

-- Joins the league with that invite code; joining twice changes nothing. A
-- league holds a hundred people at most.
create function public.join_fantasy_league(code text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  league bigint;
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'P0001', hint = 'conta';
  end if;
  select l.id into league from public.fantasy_leagues l
    where l.invite_code = upper(btrim(code))
    for update;
  if league is null then
    raise exception 'no such league' using errcode = 'P0001', hint = 'convite';
  end if;
  if public.is_fantasy_league_member(league) then
    return league;
  end if;
  if (select count(*) from public.fantasy_league_members m where m.league_id = league)
     >= 100 then
    raise exception 'league is full' using errcode = 'P0001', hint = 'cheia';
  end if;
  insert into public.fantasy_league_members (league_id, user_id) values (league, me);
  return league;
end;
$$;

-- The league's standings for its season: everyone's points over the rounds
-- played and in the last one. Only members may ask, since the points of each
-- team are otherwise private.
create function public.fantasy_league_standings(league bigint)
returns table (user_id uuid, nickname text, crest smallint, total numeric, last numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  season bigint;
  played integer;
begin
  if not public.is_fantasy_league_member(league) then
    raise exception 'not a member' using errcode = 'P0001', hint = 'membro';
  end if;
  select l.season_id, s.played into season, played
    from public.fantasy_leagues l join public.fantasy_seasons s on s.id = l.season_id
    where l.id = league;
  return query
    select m.user_id, p.nickname, p.crest,
      coalesce(sum(t.points), 0),
      coalesce(sum(t.points) filter (where t.round = played), 0)
    from public.fantasy_league_members m
    left join public.profiles p on p.user_id = m.user_id
    left join public.fantasy_lineups t
      on t.user_id = m.user_id and t.season_id = season and t.points is not null
    where m.league_id = league
    group by m.user_id, p.nickname, p.crest, m.joined_at
    order by 4 desc, m.joined_at;
end;
$$;

revoke execute on function
  public.is_fantasy_league_member(bigint),
  public.fantasy_invite_code(),
  public.create_fantasy_league(text),
  public.fantasy_league_invite(text),
  public.join_fantasy_league(text),
  public.fantasy_league_standings(bigint)
from public, anon;

grant execute on function
  public.is_fantasy_league_member(bigint),
  public.create_fantasy_league(text),
  public.fantasy_league_invite(text),
  public.join_fantasy_league(text),
  public.fantasy_league_standings(bigint)
to authenticated;
