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
