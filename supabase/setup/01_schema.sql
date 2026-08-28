-- ===========================================================================
-- Gate Delivery — complete schema
--
-- Paste into the Supabase SQL Editor of a NEW project and run once.
-- Generated from supabase/migrations/.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000001_core_schema.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Gate Delivery — core schema
--
-- Mirrors the domain model in src/domain/types.ts. Money is stored in cents as
-- integers, never floats. Terminal positions are plain metres on a local plan,
-- not geographic coordinates — the terminal has its own grid.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
create type zone_id as enum (
  'landside', 'airside-schengen', 'airside-non-schengen', 'arrivals'
);

create type waypoint_kind as enum ('gate', 'merchant', 'dock', 'holding', 'seat');

create type order_state as enum (
  'DRAFT','VALIDATED','AUTHORIZED','SENT_TO_MERCHANT','ACCEPTED','PREPARING',
  'READY','ROBOT_ASSIGNED','AT_MERCHANT','LOADED','IN_TRANSIT','ARRIVED',
  'HANDED_OVER','COMPLETED','REJECTED','CANCELLED','ABORTED','NO_SHOW'
);

create type delivery_location_kind as enum ('seat', 'pin', 'waypoint');

create type merchant_kind as enum ('cafe','market','restaurant','bar','retail');

create type staff_role as enum ('owner','manager','staff');

create type fiscal_doc_kind as enum (
  'merchant-goods-receipt', 'platform-fee-receipt', 'commission-invoice', 'airport-share-invoice'
);

-- --------------------------------------------------------------- spatial ---
create table zones (
  id                    zone_id primary key,
  name                  text        not null,
  short_name            text        not null,
  speed_limit_mps       numeric(4,2) not null default 1.2,
  -- Minutes of headroom required before boarding. Larger where the passenger
  -- still has a border control between them and the aircraft.
  safety_margin_min     integer     not null default 15,
  orderable             boolean     not null default false,
  allows_age_restricted boolean     not null default false
);

create table waypoints (
  id           text primary key,
  zone         zone_id       not null references zones(id),
  kind         waypoint_kind not null,
  name         text          not null,
  landmark     text          not null default '',
  gate         text,
  x            numeric(8,2)  not null,
  y            numeric(8,2)  not null,
  -- False for points a unit may pause at but never be dispatched to.
  dispatchable boolean       not null default true,
  created_at   timestamptz   not null default now()
);
create index waypoints_zone_idx on waypoints(zone);
create index waypoints_kind_idx on waypoints(kind);

create table route_edges (
  from_waypoint text not null references waypoints(id) on delete cascade,
  to_waypoint   text not null references waypoints(id) on delete cascade,
  metres        numeric(8,2) not null check (metres >= 0),
  primary key (from_waypoint, to_waypoint)
);

-- Individual seats carrying a printed QR code. The most precise delivery
-- target available, because the position is surveyed rather than guessed.
create table seats (
  id              text primary key,             -- e.g. 'G07-R3-S12'
  zone            zone_id not null references zones(id),
  gate            text,
  row_label       text    not null,
  seat_label      text    not null,
  x               numeric(8,2) not null,
  y               numeric(8,2) not null,
  -- The nearest point a unit can actually reach, and how far the passenger
  -- then walks. A robot cannot drive between rows of fixed seating.
  nav_waypoint_id text    not null references waypoints(id),
  walk_metres     numeric(6,2) not null default 0,
  qr_token        text    not null unique default encode(gen_random_bytes(9), 'base64'),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index seats_gate_idx on seats(gate);
create index seats_nav_idx on seats(nav_waypoint_id);

-- ------------------------------------------------------------- catalogue ---
create table merchants (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  kind             merchant_kind not null,
  zone             zone_id not null references zones(id),
  waypoint_id      text not null references waypoints(id),
  blurb            text not null default '',
  colour           text not null default '#0E6E5C',
  logo_url         text,
  prep_minutes     integer not null default 5 check (prep_minutes between 1 and 60),
  commission_rate  numeric(5,4) not null default 0.15 check (commission_rate between 0 and 1),
  open             boolean not null default true,
  opens_at         time,
  closes_at        time,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Per-hour overrides. Peak prep at a busy cafe is nothing like its 06:00 time.
create table merchant_prep_overrides (
  merchant_id  uuid not null references merchants(id) on delete cascade,
  hour_of_day  integer not null check (hour_of_day between 0 and 23),
  prep_minutes integer not null check (prep_minutes between 1 and 60),
  primary key (merchant_id, hour_of_day)
);

create table merchant_staff (
  user_id     uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  role        staff_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (user_id, merchant_id)
);
create index merchant_staff_merchant_idx on merchant_staff(merchant_id);

create table product_categories (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0
);
create index product_categories_merchant_idx on product_categories(merchant_id);

create table products (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id) on delete cascade,
  category_id    uuid references product_categories(id) on delete set null,
  name           text not null,
  description    text not null default '',
  price_cents    integer not null check (price_cents >= 0),
  image_url      text,
  emoji          text not null default '🍽️',
  available      boolean not null default true,
  -- Age-restricted goods stay in the catalogue, marked collect-in-store: an
  -- unattended unit cannot verify age.
  age_restricted boolean not null default false,
  allergens      text[] not null default '{}',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index products_merchant_idx on products(merchant_id);
create index products_available_idx on products(merchant_id, available);

-- Modifier groups, e.g. "Milk" (choose one) or "Extras" (choose any).
create table product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,
  min_select  integer not null default 0,
  max_select  integer not null default 1,
  sort_order  integer not null default 0
);
create index option_groups_product_idx on product_option_groups(product_id);

create table product_options (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references product_option_groups(id) on delete cascade,
  name              text not null,
  price_delta_cents integer not null default 0,
  available         boolean not null default true,
  sort_order        integer not null default 0
);
create index options_group_idx on product_options(group_id);

-- ----------------------------------------------------------------- flights -
create table flights (
  id               text primary key,
  flight_number    text not null,
  carrier          text not null,
  destination      text not null,
  destination_code text not null,
  non_eu           boolean not null default false,
  gate             text,
  boarding_at      timestamptz not null,
  departs_at       timestamptz not null,
  status           text not null default 'on-time',
  updated_at       timestamptz not null default now()
);
create index flights_boarding_idx on flights(boarding_at);


-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000002_orders_and_fulfilment.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Orders, fulfilment, fleet and money
-- ============================================================================

-- ---------------------------------------------------------------- identity -
-- Customers are anonymous auth users. No sign-up, no password: the passenger
-- scans a code and orders. The JWT is what row-level security keys off.
create table customer_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale       text not null default 'en',
  created_at   timestamptz not null default now()
);

create table consents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer_profiles(id) on delete cascade,
  purpose     text not null,          -- 'location' | 'marketing' | 'analytics'
  granted     boolean not null,
  recorded_at timestamptz not null default now()
);
create index consents_customer_idx on consents(customer_id);

-- ------------------------------------------------------------------ orders -
create sequence order_ref_seq start 1000;

create table orders (
  id             uuid primary key default gen_random_uuid(),
  ref            text unique not null default ('ZAG-' || nextval('order_ref_seq')::text),
  customer_id    uuid references customer_profiles(id) on delete set null,
  merchant_id    uuid not null references merchants(id),
  state          order_state not null default 'DRAFT',

  flight_id      text references flights(id),
  passenger_name text not null default '',

  -- Delivery target. `kind` records how the passenger chose it; the resolved
  -- nav_waypoint_id is where a unit is actually dispatched, because a robot
  -- navigates to surveyed points, never to an arbitrary coordinate.
  location_kind    delivery_location_kind not null default 'waypoint',
  seat_id          text references seats(id),
  pin_x            numeric(8,2),
  pin_y            numeric(8,2),
  nav_waypoint_id  text not null references waypoints(id),
  walk_metres      numeric(6,2) not null default 0,
  location_note    text not null default '',
  zone             zone_id not null references zones(id),

  goods_cents      integer not null default 0 check (goods_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents      integer not null default 0 check (total_cents >= 0),
  commission_cents integer not null default 0 check (commission_cents >= 0),
  refunded_cents   integer not null default 0 check (refunded_cents >= 0),

  -- The quoted deadline AND the inputs it was computed from, so an SLA refund
  -- can be adjudicated later and the prep-time model improved.
  promise_deliver_by      timestamptz,
  promise_deadline        timestamptz,
  promise_inputs          jsonb not null default '{}'::jsonb,
  sla_missed              boolean not null default false,

  mission_id       uuid,
  robot_id         text,
  compartment_id   text,
  handover_code    text not null default lpad((floor(random()*10000))::int::text, 4, '0'),

  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_merchant_state_idx on orders(merchant_id, state);
create index orders_customer_idx on orders(customer_id, created_at desc);
create index orders_state_idx on orders(state) where state not in ('COMPLETED','REJECTED','CANCELLED','ABORTED');
create index orders_flight_idx on orders(flight_id);

create table order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  product_id     uuid references products(id),
  -- Snapshots. Never read a sold price back from the live catalogue.
  name           text not null,
  emoji          text not null default '',
  qty            integer not null check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  notes          text not null default ''
);
create index order_lines_order_idx on order_lines(order_id);

create table order_line_options (
  id            uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references order_lines(id) on delete cascade,
  option_id     uuid references product_options(id),
  name          text not null,
  price_delta_cents integer not null default 0
);
create index order_line_options_line_idx on order_line_options(order_line_id);

create table order_events (
  id         bigserial primary key,
  order_id   uuid not null references orders(id) on delete cascade,
  state      order_state not null,
  note       text,
  actor      text not null default 'system',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events(order_id, created_at);

-- ------------------------------------------------------------------- fleet -
create table robots (
  id            text primary key,
  name          text not null,
  zone          zone_id not null references zones(id),
  home_dock_id  text references waypoints(id),
  status        text not null default 'idle',
  battery_pct   numeric(5,2) not null default 100,
  charging      boolean not null default true,
  waypoint_id   text references waypoints(id),
  x             numeric(8,2) not null default 0,
  y             numeric(8,2) not null default 0,
  heading       numeric(6,2) not null default 0,
  -- Populated from the vendor interface once it exists. Until then the
  -- simulator drives these rows.
  vendor        text not null default 'simulated',
  vendor_ref    text,
  updated_at    timestamptz not null default now()
);

create table robot_compartments (
  robot_id   text not null references robots(id) on delete cascade,
  id         text not null,
  label      text not null,
  occupied   boolean not null default false,
  locked     boolean not null default true,
  order_id   uuid references orders(id) on delete set null,
  primary key (robot_id, id)
);

create table missions (
  id          uuid primary key default gen_random_uuid(),
  robot_id    text references robots(id),
  zone        zone_id not null references zones(id),
  status      text not null default 'active',
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table mission_stops (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid not null references missions(id) on delete cascade,
  seq           integer not null,
  waypoint_id   text not null references waypoints(id),
  kind          text not null check (kind in ('pickup','dropoff')),
  order_id      uuid references orders(id) on delete cascade,
  compartment_id text,
  done          boolean not null default false
);
create index mission_stops_mission_idx on mission_stops(mission_id, seq);

create table incidents (
  id         bigserial primary key,
  severity   text not null check (severity in ('info','warn','critical')),
  message    text not null,
  order_id   uuid references orders(id) on delete set null,
  robot_id   text references robots(id) on delete set null,
  created_at timestamptz not null default now()
);
create index incidents_created_idx on incidents(created_at desc);

-- ------------------------------------------------------------------- money -
create table payments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  provider       text not null default 'mock',
  provider_ref   text,
  amount_cents   integer not null check (amount_cents >= 0),
  status         text not null default 'authorized',
  authorized_at  timestamptz,
  captured_at    timestamptz,
  refunded_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index payments_order_idx on payments(order_id);

-- Three separate documents by design: the shop sells the goods, we sell the
-- delivery, we invoice commission. Splitting this later means redoing every
-- ledger entry under audit.
create table fiscal_documents (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  kind         fiscal_doc_kind not null,
  issued_by    text not null,
  issued_to    text not null,
  amount_cents integer not null,
  external_ref text,
  simulated    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index fiscal_order_idx on fiscal_documents(order_id);

-- ------------------------------------------------------------- housekeeping
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger merchants_touch  before update on merchants for each row execute function touch_updated_at();
create trigger products_touch   before update on products  for each row execute function touch_updated_at();
create trigger orders_touch     before update on orders    for each row execute function touch_updated_at();
create trigger robots_touch     before update on robots    for each row execute function touch_updated_at();
create trigger flights_touch    before update on flights   for each row execute function touch_updated_at();

-- Order history is written automatically, so no code path can forget it.
create or replace function log_order_state() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.state is distinct from old.state then
    insert into order_events(order_id, state, note) values (new.id, new.state, null);
  end if;
  return new;
end $$;

create trigger orders_log_state after insert or update of state on orders
  for each row execute function log_order_state();


-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000003_functions_and_rls.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000004_place_order.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000005_flight_board.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- source: 20260101000006_platform_admin.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Platform administration.
--
-- The existing roles (owner / manager / staff) scope a user to ONE shop via
-- merchant_staff. Nothing in the schema could see across the estate, so an
-- operator view needs a role of its own.
--
-- Admin policies are added as separate PERMISSIVE policies. Postgres ORs
-- permissive policies together, so these grant estate-wide access without
-- modifying or weakening any existing per-shop rule.
-- ============================================================================

create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text        not null default '',
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

comment on function is_platform_admin() is
  'True when the caller is a platform operator. Used by the admin policies below.';

-- An admin may see the admin roster; nobody else may.
create policy admin_reads_roster on platform_admins
  for select using (is_platform_admin());

-- Estate-wide access on every business table.
do $$
declare t text;
begin
  foreach t in array array[
    'zones','waypoints','route_edges','seats',
    'merchants','merchant_prep_overrides','merchant_staff',
    'product_categories','products','product_option_groups','product_options',
    'flights','customer_profiles','consents',
    'orders','order_lines','order_line_options','order_events',
    'missions','mission_stops','incidents',
    'robots','robot_compartments',
    'payments','fiscal_documents'
  ]
  loop
    execute format(
      'create policy admin_all_%1$s on %1$I for all
         using (is_platform_admin()) with check (is_platform_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- metrics --
-- One round trip for the overview, rather than a dozen counts from the client.
create or replace function admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'orders_today',      (select count(*) from orders where created_at >= date_trunc('day', now())),
    'orders_live',       (select count(*) from orders
                            where state not in ('COMPLETED','REJECTED','CANCELLED','ABORTED')),
    'orders_total',      (select count(*) from orders),
    'gross_cents_today', (select coalesce(sum(goods_cents),0) from orders
                            where state = 'COMPLETED' and created_at >= date_trunc('day', now())),
    'commission_cents_today', (select coalesce(sum(commission_cents),0) from orders
                            where state = 'COMPLETED' and created_at >= date_trunc('day', now())),
    'fees_cents_today',  (select coalesce(sum(delivery_fee_cents),0) from orders
                            where state = 'COMPLETED' and created_at >= date_trunc('day', now())),
    'sla_missed_today',  (select count(*) from orders
                            where sla_missed and created_at >= date_trunc('day', now())),
    'shops_total',       (select count(*) from merchants),
    'shops_open',        (select count(*) from merchants where open),
    'products_total',    (select count(*) from products),
    'products_unavailable', (select count(*) from products where not available),
    'robots_total',      (select count(*) from robots),
    'robots_available',  (select count(*) from robots where status in ('idle','charging')),
    'incidents_critical_24h', (select count(*) from incidents
                            where severity = 'critical' and created_at > now() - interval '24 hours'),
    'incidents_24h',     (select count(*) from incidents where created_at > now() - interval '24 hours'),
    'seats_active',      (select count(*) from seats where active),
    'flights_upcoming',  (select count(*) from flights where boarding_at > now())
  );
$$;

revoke all on function admin_overview() from public, anon;
grant execute on function admin_overview() to authenticated;
grant execute on function is_platform_admin() to authenticated, anon;

-- Per-shop performance, for the estate table.
create or replace function admin_shop_stats()
returns table (
  merchant_id uuid, slug text, name text, colour text, open boolean,
  commission_rate numeric, prep_minutes integer,
  products integer, live_orders integer, completed_today integer,
  gross_cents_today bigint, commission_cents_today bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.slug, m.name, m.colour, m.open, m.commission_rate, m.prep_minutes,
         (select count(*)::int from products p where p.merchant_id = m.id),
         (select count(*)::int from orders o where o.merchant_id = m.id
            and o.state not in ('COMPLETED','REJECTED','CANCELLED','ABORTED')),
         (select count(*)::int from orders o where o.merchant_id = m.id
            and o.state = 'COMPLETED' and o.created_at >= date_trunc('day', now())),
         (select coalesce(sum(o.goods_cents),0) from orders o where o.merchant_id = m.id
            and o.state = 'COMPLETED' and o.created_at >= date_trunc('day', now())),
         (select coalesce(sum(o.commission_cents),0) from orders o where o.merchant_id = m.id
            and o.state = 'COMPLETED' and o.created_at >= date_trunc('day', now()))
  from merchants m
  order by m.name;
$$;

revoke all on function admin_shop_stats() from public, anon;
grant execute on function admin_shop_stats() to authenticated;


