-- ============================================================================
-- Atomic order creation.
--
-- The server computes the quote and validates prices, then hands the whole
-- order to this function so the order, its lines, its options and the payment
-- record are written in one transaction — never a half-created order.
-- ============================================================================

create or replace function create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_line     jsonb;
  v_line_id  uuid;
  v_opt      jsonb;
begin
  insert into orders (
    customer_id, merchant_id, state, flight_id, passenger_name,
    location_kind, seat_id, pin_x, pin_y, nav_waypoint_id, walk_metres,
    location_note, zone,
    goods_cents, delivery_fee_cents, total_cents, commission_cents,
    promise_deliver_by, promise_deadline, promise_inputs
  ) values (
    nullif(payload->>'customer_id','')::uuid,
    (payload->>'merchant_id')::uuid,
    'DRAFT',
    nullif(payload->>'flight_id',''),
    coalesce(payload->>'passenger_name',''),
    (payload->>'location_kind')::delivery_location_kind,
    nullif(payload->>'seat_id',''),
    nullif(payload->>'pin_x','')::numeric,
    nullif(payload->>'pin_y','')::numeric,
    payload->>'nav_waypoint_id',
    coalesce((payload->>'walk_metres')::numeric, 0),
    coalesce(payload->>'location_note',''),
    (payload->>'zone')::zone_id,
    (payload->>'goods_cents')::int,
    (payload->>'delivery_fee_cents')::int,
    (payload->>'total_cents')::int,
    (payload->>'commission_cents')::int,
    (payload->>'promise_deliver_by')::timestamptz,
    (payload->>'promise_deadline')::timestamptz,
    coalesce(payload->'promise_inputs', '{}'::jsonb)
  ) returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into order_lines (order_id, product_id, name, emoji, qty, unit_price_cents, notes)
    values (
      v_order_id,
      nullif(v_line->>'product_id','')::uuid,
      v_line->>'name',
      coalesce(v_line->>'emoji',''),
      (v_line->>'qty')::int,
      (v_line->>'unit_price_cents')::int,
      coalesce(v_line->>'notes','')
    ) returning id into v_line_id;

    for v_opt in select * from jsonb_array_elements(coalesce(v_line->'options','[]'::jsonb)) loop
      insert into order_line_options (order_line_id, option_id, name, price_delta_cents)
      values (
        v_line_id,
        nullif(v_opt->>'option_id','')::uuid,
        v_opt->>'name',
        coalesce((v_opt->>'price_delta_cents')::int, 0)
      );
    end loop;
  end loop;

  insert into payments (order_id, provider, amount_cents, status, authorized_at)
  values (
    v_order_id,
    coalesce(payload->>'payment_provider','mock'),
    (payload->>'total_cents')::int,
    'authorized',
    now()
  );

  -- Straight through the opening states: the quote has already been validated
  -- server-side, so there is nothing left to decide before the shop sees it.
  update orders set state = 'VALIDATED'         where id = v_order_id;
  update orders set state = 'AUTHORIZED'        where id = v_order_id;
  update orders set state = 'SENT_TO_MERCHANT'  where id = v_order_id;

  return v_order_id;
end $$;

revoke all on function create_order(jsonb) from public, anon, authenticated;

-- Everything the shop's screen needs for one order, in a single round trip.
create or replace view order_details as
select
  o.*,
  m.name  as merchant_name,
  m.slug  as merchant_slug,
  m.colour as merchant_colour,
  w.name  as nav_waypoint_name,
  w.landmark as nav_waypoint_landmark,
  f.flight_number, f.carrier, f.destination, f.destination_code, f.gate as flight_gate,
  f.boarding_at,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', l.id, 'name', l.name, 'emoji', l.emoji, 'qty', l.qty,
       'unit_price_cents', l.unit_price_cents, 'notes', l.notes,
       'options', coalesce((select jsonb_agg(jsonb_build_object('name', lo.name, 'price_delta_cents', lo.price_delta_cents))
                            from order_line_options lo where lo.order_line_id = l.id), '[]'::jsonb)
     ) order by l.id)
     from order_lines l where l.order_id = o.id), '[]'::jsonb) as lines
from orders o
join merchants m on m.id = o.merchant_id
join waypoints w on w.id = o.nav_waypoint_id
left join flights f on f.id = o.flight_id;
