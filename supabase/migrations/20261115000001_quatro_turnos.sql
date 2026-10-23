-- A room's league can now be played over up to four legs: more legs, less
-- luck in who ends up champion. The engine repeats the first two legs, home
-- and away as they were (startLeague in src/engine/room/league.ts).
alter table public.rooms drop constraint rooms_legs_check;
alter table public.rooms add constraint rooms_legs_check check (legs between 1 and 4);
