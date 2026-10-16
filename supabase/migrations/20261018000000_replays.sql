-- Online fantasy, step O4: every match of a round can be watched again. Each
-- round keeps what it takes to replay its matches minute by minute (the line-ups,
-- the players and the match seed), as gzip-compressed JSON in base64.
--
-- A match seed gives away the world's seed of that moment, so the server gives
-- the world a fresh seed before each round; fantasy_season_states.seed is only
-- the seed the world was created with.

alter table public.fantasy_rounds add column replays text not null default '';
