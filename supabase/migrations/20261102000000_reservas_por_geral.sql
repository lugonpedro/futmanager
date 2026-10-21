-- From the 12th pick on, the automatic pick goes by overall, among the
-- positions the squad is still short of (the best free player of all once
-- none is short), as autoPick() in src/engine/room/draft.ts. The first eleven
-- still go to the position lacking most. The queue, when there is one, still
-- comes first.
create or replace function public.room_auto_choice(room bigint, team smallint)
returns text
language plpgsql stable set search_path = '' as $$
declare
  found public.rooms;
  person uuid;
  queued text;
  have integer;
  keepers integer;
  chosen text;
begin
  select * into found from public.rooms r where r.id = room;
  select t.user_id into person from public.room_teams t
    where t.room_id = room and t.slot = team and not t.robot;
  if person is not null then
    select q.id into queued
      from public.room_queues rq, unnest(rq.player_ids) with ordinality as q (id, n)
      where rq.room_id = room and rq.user_id = person
        and public.room_pick_problem(room, team, q.id) is null
      order by q.n
      limit 1;
    if queued is not null then
      return queued;
    end if;
  end if;

  select count(*), count(*) filter (where p.position = 'G') into have, keepers
    from public.room_picks k
    join public.room_pool p on p.room_id = k.room_id and p.player_id = k.player_id
    where k.room_id = room and k.slot = team;
  with mine as (
    select p.position, count(*) as n
    from public.room_picks k
    join public.room_pool p on p.room_id = k.room_id and p.player_id = k.player_id
    where k.room_id = room and k.slot = team
    group by p.position
  )
  select p.player_id into chosen
    from public.room_pool p
    left join public.room_picks k on k.room_id = p.room_id and k.player_id = p.player_id
    left join mine m on m.position = p.position
    where p.room_id = room and k.player_id is null
      and 2 - keepers - (case when p.position = 'G' then 1 else 0 end)
        <= found.squad_size - have - 1
    order by
      case when have >= 11 then
        (coalesce(m.n, 0) < (found.squad_shape->>p.position)::integer)::integer
      else
        ((found.squad_shape->>p.position)::integer - coalesce(m.n, 0))::numeric
          / (found.squad_shape->>p.position)::integer
      end desc,
      p.rank
    limit 1;
  if chosen is null then
    raise exception 'nobody left to pick' using errcode = 'P0001';
  end if;
  return chosen;
end;
$$;
