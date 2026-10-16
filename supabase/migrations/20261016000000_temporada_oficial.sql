-- Online fantasy, step O2: the official season everyone shares. The server
-- plays one league round a day; everyone reads the rounds once they are played.

create table public.fantasy_seasons (
  id bigint generated always as identity primary key,
  year integer not null,
  status text not null check (status in ('em_andamento', 'encerrada')),
  -- FANTASY_VERSION of the rules the season is played by.
  rules_version integer not null,
  -- League rounds in the season, and how many have been played.
  rounds integer not null,
  played integer not null default 0 check (played between 0 and rounds),
  -- The top-division clubs: name, short name and colors, by club id.
  clubs jsonb not null,
  last_played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Only one season runs at a time.
create unique index fantasy_seasons_one_running on public.fantasy_seasons ((true))
  where status = 'em_andamento';

alter table public.fantasy_seasons enable row level security;

create policy "fantasy seasons: everyone reads" on public.fantasy_seasons
  for select to anon, authenticated using (true);

-- One row per played round; round 0 is the opening market.
create table public.fantasy_rounds (
  season_id bigint not null references public.fantasy_seasons (id) on delete cascade,
  round integer not null check (round >= 0),
  game_date text not null,
  -- The top-division matches, everyone's points, and the market for the next round.
  results jsonb not null,
  points jsonb not null,
  pool jsonb not null,
  played_at timestamptz not null default now(),
  primary key (season_id, round)
);

alter table public.fantasy_rounds enable row level security;

create policy "fantasy rounds: everyone reads" on public.fantasy_rounds
  for select to anon, authenticated using (true);

-- The world itself, with its seed: only the server reads it, or anyone could
-- play the rounds ahead. No policies, so only the service role gets through.
create table public.fantasy_season_states (
  season_id bigint primary key references public.fantasy_seasons (id) on delete cascade,
  seed bigint not null,
  -- The OfficialState as gzip-compressed JSON in base64.
  data text not null,
  updated_at timestamptz not null default now()
);

alter table public.fantasy_season_states enable row level security;
revoke all on public.fantasy_season_states from anon, authenticated;

-- Every day at 21h in Brasília (midnight UTC) the database calls the
-- fantasy-round function. The project URL and the shared secret live in the
-- Vault, set once per project (see docs/05-online.md).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fantasy-round',
  '0 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fantasy-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
