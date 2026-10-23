-- The server's clock, for the room's pages to count the draft's clock and the
-- live round by it rather than by the device's, which may be seconds off.
create function public.server_now() returns timestamptz
language sql stable set search_path = '' as $$
  select clock_timestamp()
$$;

revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
