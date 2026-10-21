-- Rooms of up to 18 teams. The Brasileirão pack has 973 players (116 keepers),
-- enough for 18 squads of 20 with cards left in every position.
alter table public.rooms drop constraint rooms_teams_check;
alter table public.rooms add constraint rooms_teams_check
  check (teams between 2 and 18 and teams % 2 = 0);
