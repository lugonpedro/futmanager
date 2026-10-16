-- Online fantasy, step O6: the season pass. Playing and joining leagues stay
-- free; creating a private league needs the pass of the running season. Only
-- the stripe-webhook function writes passes, once Stripe confirms the payment.

create table public.fantasy_passes (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id bigint not null references public.fantasy_seasons (id) on delete cascade,
  -- Where it was paid and the payment's id there, to find it for a refund.
  provider text not null check (provider in ('stripe', 'cortesia')),
  payment_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz not null default now(),
  primary key (user_id, season_id),
  unique (provider, payment_id)
);

alter table public.fantasy_passes enable row level security;

create policy "own passes: read" on public.fantasy_passes
  for select to authenticated using (user_id = (select auth.uid()));

-- The same as in 20261019000000_ligas.sql, plus the pass.
create or replace function public.create_fantasy_league(league_name text)
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
  if not exists (
    select 1 from public.fantasy_passes p where p.user_id = me and p.season_id = season
  ) then
    raise exception 'no season pass' using errcode = 'P0001', hint = 'passe';
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
