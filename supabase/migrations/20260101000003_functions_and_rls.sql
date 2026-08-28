-- ============================================================================
-- Helper functions, row-level security, realtime
-- ============================================================================

-- Nearest point a unit can actually be dispatched to. Used when a passenger
-- drops a pin: we keep their pin, but we drive to this.
create or replace function nearest_waypoint(p_zone zone_id, p_x numeric, p_y numeric)
returns table (waypoint_id text, metres numeric)
language sql stable as $$
  select w.id,
         round(sqrt(power(w.x - p_x, 2) + power(w.y - p_y, 2))::numeric, 2)
  from waypoints w
  where w.zone = p_zone and w.dispatchable
  order by power(w.x - p_x, 2) + power(w.y - p_y, 2)
  limit 1;
$$;

-- Resolves any of the three ways a passenger can specify where they are into
-- a single dispatchable target plus the distance they will walk.
create or replace function resolve_delivery_location(
  p_kind        delivery_location_kind,
  p_zone        zone_id,
  p_seat_id     text    default null,
  p_pin_x       numeric default null,
  p_pin_y       numeric default null,
  p_waypoint_id text    default null
) returns table (nav_waypoint_id text, walk_metres numeric, note text)
language plpgsql stable as $$
declare
  v_seat seats%rowtype;
  v_near record;
begin
  if p_kind = 'seat' then
    select * into v_seat from seats where id = p_seat_id and active;
    if not found then raise exception 'Unknown or inactive seat: %', p_seat_id; end if;
    return query select v_seat.nav_waypoint_id, v_seat.walk_metres,
                        format('Seat %s at gate %s', v_seat.seat_label, coalesce(v_seat.gate, '—'));
  elsif p_kind = 'pin' then
    select * into v_near from nearest_waypoint(p_zone, p_pin_x, p_pin_y);
    if v_near is null then raise exception 'No reachable point in zone %', p_zone; end if;
    return query select v_near.waypoint_id, v_near.metres, 'Pin dropped on the map'::text;
  else
    return query select w.id, 0::numeric, w.landmark from waypoints w where w.id = p_waypoint_id;
  end if;
end $$;

create or replace function is_merchant_staff(p_merchant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from merchant_staff
    where user_id = auth.uid() and merchant_id = p_merchant
  );
$$;

create or replace function my_merchant_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select merchant_id from merchant_staff where user_id = auth.uid();
$$;

-- ------------------------------------------------------------------- RLS ---
alter table zones                    enable row level security;
alter table waypoints                enable row level security;
alter table route_edges              enable row level security;
alter table seats                    enable row level security;
alter table flights                  enable row level security;
alter table merchants                enable row level security;
alter table merchant_prep_overrides  enable row level security;
alter table merchant_staff           enable row level security;
alter table product_categories       enable row level security;
alter table products                 enable row level security;
alter table product_option_groups    enable row level security;
alter table product_options          enable row level security;
alter table customer_profiles        enable row level security;
alter table consents                 enable row level security;
alter table orders                   enable row level security;
alter table order_lines              enable row level security;
alter table order_line_options       enable row level security;
alter table order_events             enable row level security;
alter table robots                   enable row level security;
alter table robot_compartments       enable row level security;
alter table missions                 enable row level security;
alter table mission_stops            enable row level security;
alter table incidents                enable row level security;
alter table payments                 enable row level security;
alter table fiscal_documents         enable row level security;

-- Terminal reference data and the public menu are readable by anyone. None of
-- it is sensitive and the ordering app needs it before a passenger signs in.
create policy read_zones      on zones       for select using (true);
create policy read_waypoints  on waypoints   for select using (true);
create policy read_edges      on route_edges for select using (true);
create policy read_seats      on seats       for select using (active);
create policy read_flights    on flights     for select using (true);
create policy read_merchants  on merchants   for select using (true);
create policy read_prep       on merchant_prep_overrides for select using (true);
create policy read_categories on product_categories for select using (true);
create policy read_products   on products    for select using (true);
create policy read_optgroups  on product_option_groups for select using (true);
create policy read_options    on product_options for select using (true);

-- Merchant staff manage their own shop, and nothing else.
create policy staff_read_own_link on merchant_staff for select
  using (user_id = auth.uid());

create policy staff_write_merchant on merchants for update
  using (is_merchant_staff(id)) with check (is_merchant_staff(id));

create policy staff_manage_categories on product_categories for all
  using (is_merchant_staff(merchant_id)) with check (is_merchant_staff(merchant_id));

create policy staff_manage_products on products for all
  using (is_merchant_staff(merchant_id)) with check (is_merchant_staff(merchant_id));

create policy staff_manage_optgroups on product_option_groups for all
  using (exists (select 1 from products p where p.id = product_id and is_merchant_staff(p.merchant_id)))
  with check (exists (select 1 from products p where p.id = product_id and is_merchant_staff(p.merchant_id)));

create policy staff_manage_options on product_options for all
  using (exists (select 1 from product_option_groups g join products p on p.id = g.product_id
                 where g.id = group_id and is_merchant_staff(p.merchant_id)))
  with check (exists (select 1 from product_option_groups g join products p on p.id = g.product_id
                 where g.id = group_id and is_merchant_staff(p.merchant_id)));

create policy staff_manage_prep on merchant_prep_overrides for all
  using (is_merchant_staff(merchant_id)) with check (is_merchant_staff(merchant_id));

-- Customers see only their own profile, consents and orders.
create policy own_profile on customer_profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create policy own_consents on consents for all
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy read_own_orders on orders for select
  using (customer_id = auth.uid() or is_merchant_staff(merchant_id));

-- A customer may cancel their own order, but may not move it through the
-- workflow; state transitions belong to the server.
create policy customer_cancel_order on orders for update
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid() and state in ('CANCELLED','DRAFT'));

create policy staff_update_orders on orders for update
  using (is_merchant_staff(merchant_id)) with check (is_merchant_staff(merchant_id));

create policy read_own_order_lines on order_lines for select
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or is_merchant_staff(o.merchant_id))));

create policy read_own_line_options on order_line_options for select
  using (exists (select 1 from order_lines l join orders o on o.id = l.order_id
                 where l.id = order_line_id
                 and (o.customer_id = auth.uid() or is_merchant_staff(o.merchant_id))));

create policy read_own_order_events on order_events for select
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or is_merchant_staff(o.merchant_id))));

create policy read_own_payments on payments for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));

create policy read_own_fiscal on fiscal_documents for select
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or is_merchant_staff(o.merchant_id))));

-- Fleet state is visible to any signed-in user so the tracking map and the
-- shop's screen can both show it. Writes are server-side only.
create policy read_robots       on robots             for select using (auth.role() = 'authenticated');
create policy read_compartments on robot_compartments for select using (auth.role() = 'authenticated');
create policy read_missions     on missions           for select using (auth.role() = 'authenticated');
create policy read_stops        on mission_stops      for select using (auth.role() = 'authenticated');
create policy read_incidents    on incidents          for select using (auth.role() = 'authenticated');

-- --------------------------------------------------------------- realtime --
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_events;
alter publication supabase_realtime add table robots;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table incidents;
