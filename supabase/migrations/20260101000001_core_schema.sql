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
