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
