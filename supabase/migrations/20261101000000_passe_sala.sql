-- Online draft rooms, step D7 (pesquisa/13-draft-online.md): creating a room
-- takes a running 30-day pass. The check sits on the rooms table, so it
-- covers both ways a room is made (create_room and the rematch) while
-- joining one stays free. A room made while the pass ran goes on to the end
-- after it lapses. The pass is bought through the `pass` function and
-- granted by mercadopago-webhook (step P).

-- Whether this user has a pass running now.
create function public.pass_running(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.passes p
    where p.user_id = target and p.starts_at <= now() and p.ends_at > now()
  )
$$;

revoke execute on function public.pass_running(uuid) from public, anon, authenticated;

create function public.room_needs_pass() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pass_running(new.owner_id) then
    raise exception 'no pass' using errcode = 'P0001', hint = 'passe';
  end if;
  return new;
end;
$$;

revoke execute on function public.room_needs_pass() from public, anon, authenticated;

create trigger room_needs_pass before insert on public.rooms
  for each row execute function public.room_needs_pass();

grant execute on function public.has_pass() to authenticated;
