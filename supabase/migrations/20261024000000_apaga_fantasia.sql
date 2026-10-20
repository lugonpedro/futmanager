-- Drops what is left of the online fantasy game, turned off in
-- 20261023000000_desliga_fantasia.sql. Two things stay: fantasy_passes, the
-- record of who paid, which the room's pass will build on, and
-- push_subscriptions, for the room's notifications.

-- The passes outlive the seasons they were bought for; season_id stays as a plain number.
alter table public.fantasy_passes drop constraint if exists fantasy_passes_season_id_fkey;

-- The hand-made lifetime pass hangs on fantasy_seasons (pesquisa/05-online.md).
drop trigger if exists passe_vitalicio on public.fantasy_seasons;
drop function if exists public.passe_vitalicio();

drop function if exists public.create_fantasy_league(text);
drop function if exists public.join_fantasy_league(text);
drop function if exists public.fantasy_league_invite(text);
drop function if exists public.fantasy_league_standings(bigint);
drop function if exists public.fantasy_invite_code();

drop table if exists public.fantasy_league_members;
drop table if exists public.fantasy_leagues;
drop function if exists public.is_fantasy_league_member(bigint);

drop table if exists public.fantasy_notices;
drop table if exists public.fantasy_lineups;
drop table if exists public.fantasy_rounds;
drop table if exists public.fantasy_season_states;
drop table if exists public.fantasy_seasons;
