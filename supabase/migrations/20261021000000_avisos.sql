-- Online fantasy, step O7: notices through the app's push notifications, no
-- e-mail. Each browser that turns them on leaves its subscription here; the
-- fantasy-notify function sends the market warning and the round's result.

create table public.push_subscriptions (
  -- The push service's address for this browser; it is the subscription's id.
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The browser's keys, to encrypt each message for it alone.
  p256dh text not null,
  auth text not null,
  market boolean not null default true,
  rounds boolean not null default true,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions: read" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own push subscriptions: delete" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Which notices already went out, so a retry never sends one twice.
create table public.fantasy_notices (
  season_id bigint not null references public.fantasy_seasons (id) on delete cascade,
  round integer not null,
  kind text not null check (kind in ('mercado', 'rodada')),
  sent_at timestamptz not null default now(),
  primary key (season_id, round, kind)
);

alter table public.fantasy_notices enable row level security;
revoke all on public.fantasy_notices from anon, authenticated;

-- Saves this browser's subscription for the signed-in user, with the notices
-- they want. A browser shared by two accounts goes to whoever turned it on
-- last. Ten browsers per person at most.
create function public.save_push_subscription(
  sub_endpoint text, sub_p256dh text, sub_auth text, want_market boolean, want_rounds boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'P0001', hint = 'conta';
  end if;
  if sub_endpoint not like 'https://%' or char_length(sub_endpoint) > 1000
     or char_length(sub_p256dh) > 200 or char_length(sub_auth) > 100 then
    raise exception 'bad subscription' using errcode = 'P0001', hint = 'inscricao';
  end if;
  if not exists (
    select 1 from public.push_subscriptions s where s.endpoint = sub_endpoint and s.user_id = me
  ) and (select count(*) from public.push_subscriptions s where s.user_id = me) >= 10 then
    raise exception 'too many browsers' using errcode = 'P0001', hint = 'limite';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, market, rounds)
    values (sub_endpoint, me, sub_p256dh, sub_auth, want_market, want_rounds)
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        market = excluded.market, rounds = excluded.rounds;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text, boolean, boolean)
  to authenticated;

-- The market warning goes out at 19h30 in Brasília (22h30 UTC), an hour before
-- it closes; the round's result at 21h15, after fantasy-round has played it.
select cron.schedule(
  'fantasy-notify-mercado',
  '30 22 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fantasy-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := '{"kind": "mercado"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'fantasy-notify-rodada',
  '15 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fantasy-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'fantasy_cron_secret')
    ),
    body := '{"kind": "rodada"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
