-- ============================================================================
-- Flight board maintenance.
--
-- Until a live FIDS feed is connected, the seeded board is fixed in time and
-- drifts into the past. Rebasing shifts every flight by a single offset so the
-- relative spacing is preserved — including the deliberately tight departure
-- that exercises the refusal path in the acceptance engine.
-- ============================================================================

create or replace function rebase_flight_board(lead_minutes integer default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  earliest timestamptz;
  shift    interval;
  n        integer;
begin
  select min(boarding_at) into earliest from flights;
  if earliest is null then return 0; end if;

  shift := (now() + make_interval(mins => lead_minutes)) - earliest;

  update flights
     set boarding_at = boarding_at + shift,
         departs_at  = departs_at  + shift,
         status      = 'on-time',
         updated_at  = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function rebase_flight_board(integer) is
  'Shifts the whole seeded flight board forward so the earliest departure boards in lead_minutes. Replaced by a live FIDS feed in production.';

revoke all on function rebase_flight_board(integer) from public, anon;
grant execute on function rebase_flight_board(integer) to service_role;
