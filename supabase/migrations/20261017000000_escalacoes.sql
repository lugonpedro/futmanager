-- Online fantasy, step O3: each player's team for each round. Teams are sent
-- through the fantasy-team function, which checks the formation, the budget
-- and that the market is still open; the browser never writes here.

create table public.fantasy_lineups (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id bigint not null references public.fantasy_seasons (id) on delete cascade,
  -- The round the team is for.
  round integer not null check (round >= 1),
  formation text not null,
  player_ids text[] not null check (cardinality(player_ids) = 11),
  captain_id text not null,
  -- Filled in by the server once the round is played.
  points numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id, round)
);

create index fantasy_lineups_round on public.fantasy_lineups (season_id, round);

alter table public.fantasy_lineups enable row level security;

create policy "own lineups: read" on public.fantasy_lineups
  for select to authenticated using (user_id = (select auth.uid()));
