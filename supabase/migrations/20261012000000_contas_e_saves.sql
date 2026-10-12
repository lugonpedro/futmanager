-- Phase 12: optional accounts with a profile and careers saved in the cloud.
-- Every row belongs to one auth user and is only visible to that user.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  crest smallint not null default 0 check (crest between 0 and 11),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile: create" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own profile: change" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- One row per career slot. The game itself is gzip-compressed JSON in base64,
-- so a career of several seasons stays around 200 KB.
create table public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  club_name text not null check (char_length(club_name) <= 80),
  year integer not null,
  round integer not null,
  today text,
  season_over boolean not null,
  -- When the career was saved on the device, in milliseconds; decides which copy is newer.
  updated_at bigint not null,
  version integer not null,
  data text not null check (octet_length(data) <= 4 * 1024 * 1024),
  primary key (user_id, id)
);

alter table public.saves enable row level security;

create policy "own saves: read" on public.saves
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own saves: delete" on public.saves
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "own saves: create" on public.saves
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own saves: change" on public.saves
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- How many careers an account keeps in the cloud: one for free, up to five for
-- paying players. Only the server (the future payment flow) writes here.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cloud_slots smallint not null check (cloud_slots between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

create policy "own entitlement: read" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

create function public.saves_limit() returns trigger
language plpgsql set search_path = '' as $$
declare
  slots integer := coalesce(
    (select e.cloud_slots from public.entitlements e where e.user_id = new.user_id), 1);
begin
  if (select count(*) from public.saves where user_id = new.user_id) >= slots then
    raise exception 'save limit reached' using errcode = 'P0001', hint = 'limite';
  end if;
  return new;
end;
$$;

create trigger saves_limit before insert on public.saves
  for each row execute function public.saves_limit();

-- Uploads a career only if the cloud copy is still the one this device last saw
-- (base_updated_at), or there is none yet when base_updated_at is null.
-- Returns false when another device saved it in between: nothing is written.
create function public.push_save(
  p_id text,
  p_club_name text,
  p_year integer,
  p_round integer,
  p_today text,
  p_season_over boolean,
  p_updated_at bigint,
  p_version integer,
  p_data text,
  p_base_updated_at bigint
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_updated_at bigint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select s.updated_at into current_updated_at
    from public.saves s where s.user_id = uid and s.id = p_id for update;
  if not found then
    if p_base_updated_at is not null then
      return false;
    end if;
    insert into public.saves
      (user_id, id, club_name, year, round, today, season_over, updated_at, version, data)
    values
      (uid, p_id, p_club_name, p_year, p_round, p_today, p_season_over, p_updated_at, p_version, p_data);
    return true;
  end if;
  if p_base_updated_at is distinct from current_updated_at then
    return false;
  end if;
  update public.saves set
    club_name = p_club_name, year = p_year, round = p_round, today = p_today,
    season_over = p_season_over, updated_at = p_updated_at, version = p_version, data = p_data
  where user_id = uid and id = p_id;
  return true;
end;
$$;

-- LGPD: the player deletes the account, which takes the profile and every save with it.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke execute on function public.push_save(text, text, integer, integer, text, boolean, bigint, integer, text, bigint) from public, anon;
grant execute on function public.push_save(text, text, integer, integer, text, boolean, bigint, integer, text, bigint) to authenticated;
