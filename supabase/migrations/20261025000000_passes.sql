-- The season pass becomes a 30-day pass for the online draft rooms
-- (pesquisa/13-draft-online.md). fantasy_passes is renamed to passes and keeps
-- one row per payment, now with the stretch of time it pays for instead of a
-- season. Buying again while a pass is running adds the days after its end, so
-- the rows of one person never overlap. A lifetime pass is a row that ends at
-- 'infinity'.

alter table public.fantasy_passes rename to passes;

alter table public.passes drop constraint fantasy_passes_pkey;
alter table public.passes drop constraint fantasy_passes_provider_payment_id_key;
alter table public.passes add primary key (provider, payment_id);
alter table public.passes rename constraint fantasy_passes_provider_check to passes_provider_check;
alter table public.passes rename constraint fantasy_passes_user_id_fkey to passes_user_id_fkey;
alter table public.passes rename constraint fantasy_passes_amount_cents_check to passes_amount_cents_check;

alter table public.passes add column starts_at timestamptz;
alter table public.passes add column ends_at timestamptz;
-- Nobody has paid yet; whatever row exists (tests, courtesy) gets 30 days from now.
update public.passes set starts_at = now(), ends_at = now() + interval '30 days';
alter table public.passes alter column starts_at set not null;
alter table public.passes alter column ends_at set not null;
alter table public.passes add constraint passes_period_check check (ends_at >= starts_at);
alter table public.passes drop column season_id;

create index passes_user_ends_idx on public.passes (user_id, ends_at desc);

-- The read policy "own passes: read" moved with the table.

-- Grants a pass of `days` days to a user, starting now or when the pass they
-- already have ends. Granting the same payment twice changes nothing, since
-- Mercado Pago may notify a payment more than once. Returns when the user's
-- pass ends. Only the mercadopago-webhook function (service role) calls it.
create function public.grant_pass(
  target uuid,
  pass_provider text,
  pass_payment_id text,
  pass_amount_cents integer,
  days integer
)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  start timestamptz;
begin
  if days is null or days < 1 then
    raise exception 'bad pass length' using errcode = 'P0001';
  end if;
  -- Two payments of the same person landing together must not both start now.
  perform pg_advisory_xact_lock(hashtext('pass:' || target::text));

  if not exists (
    select 1 from public.passes p
    where p.provider = pass_provider and p.payment_id = pass_payment_id
  ) then
    select greatest(now(), coalesce(max(p.ends_at), now())) into start
    from public.passes p where p.user_id = target;
    insert into public.passes (user_id, provider, payment_id, amount_cents, starts_at, ends_at)
      values (target, pass_provider, pass_payment_id, pass_amount_cents, start,
              start + make_interval(days => days));
  end if;

  return (select max(p.ends_at) from public.passes p where p.user_id = target);
end;
$$;

revoke execute on function public.grant_pass(uuid, text, text, integer, integer)
  from public, anon, authenticated;

-- Whether the signed-in user has a running pass. Creating a room will check it.
create function public.has_pass()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.passes p
    where p.user_id = (select auth.uid()) and p.starts_at <= now() and p.ends_at > now()
  );
$$;

revoke execute on function public.has_pass() from public, anon;
