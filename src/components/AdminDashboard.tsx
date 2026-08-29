"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, supabase, useLiveQuery, useNow, type DB } from "@/lib/hooks";
import { euros, mmss } from "@/lib/format";
import { STATE_COPY } from "@/domain/orders/machine";
import { TerminalMap } from "@/components/TerminalMap";
import {
  Button, Pill, Monogram, Notice, EmptyState, SkeletonList,
  IconOrders, IconStore, IconClock, IconAlert, IconRobot, IconPin,
  IconCheck, IconLock, IconPlane, IconSparkle,
} from "@/components/ui";

type Tab = "overview" | "orders" | "shops" | "ops" | "terminal";

interface Overview {
  orders_today: number; orders_live: number; orders_total: number;
  gross_cents_today: number; commission_cents_today: number; fees_cents_today: number;
  sla_missed_today: number; shops_total: number; shops_open: number;
  products_total: number; products_unavailable: number;
  robots_total: number; robots_available: number;
  incidents_24h: number; incidents_critical_24h: number;
  seats_active: number; flights_upcoming: number;
}
interface ShopStat {
  merchant_id: string; slug: string; name: string; colour: string; open: boolean;
  commission_rate: number; prep_minutes: number; products: number;
  live_orders: number; completed_today: number;
  gross_cents_today: number; commission_cents_today: number;
}
interface OrderRow {
  id: string; ref: string; state: string; passenger_name: string;
  merchant_name: string; total_cents: number; goods_cents: number; commission_cents: number;
  delivery_fee_cents: number; promise_deadline: string | null; sla_missed: boolean;
  nav_waypoint_name: string; robot_id: string | null; flight_number: string | null;
  flight_gate: string | null; created_at: string;
  lines: { name: string; qty: number }[];
}
interface Robot {
  id: string; name: string; zone: string; status: string;
  battery_pct: number; charging: boolean; waypoint_id: string | null; x: number; y: number;
}
interface Incident { id: number; severity: string; message: string; created_at: string; robot_id: string | null }
interface Flight { id: string; flight_number: string; carrier: string; destination: string; gate: string | null; boarding_at: string; status: string }

async function loadAll(db: DB) {
  const [overview, shops, orders, robots, incidents, flights, waypoints, edges, compartments] =
    await Promise.all([
      db.rpc("admin_overview"),
      db.rpc("admin_shop_stats"),
      db.from("order_details").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("robots").select("*").order("id"),
      db.from("incidents").select("*").order("created_at", { ascending: false }).limit(40),
      db.from("flights").select("*").order("boarding_at"),
      db.from("waypoints").select("*"),
      db.from("route_edges").select("*"),
      db.from("robot_compartments").select("*"),
    ]);
  return {
    overview: overview.data as unknown as Overview,
    shops: (shops.data ?? []) as unknown as ShopStat[],
    orders: (orders.data ?? []) as unknown as OrderRow[],
    robots: (robots.data ?? []) as unknown as Robot[],
    incidents: (incidents.data ?? []) as unknown as Incident[],
    flights: (flights.data ?? []) as unknown as Flight[],
    waypoints: (waypoints.data ?? []) as never[],
    edges: (edges.data ?? []) as never[],
    compartments: (compartments.data ?? []) as { robot_id: string; id: string; occupied: boolean }[],
  };
}

const LIVE_STATES = ["DRAFT","VALIDATED","AUTHORIZED","SENT_TO_MERCHANT","ACCEPTED","PREPARING",
  "READY","ROBOT_ASSIGNED","AT_MERCHANT","LOADED","IN_TRANSIT","ARRIVED","NO_SHOW"];

export function AdminDashboard({ name, fidsConfigured }: { name: string; fidsConfigured: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("overview");
  const { data, error, reload } = useLiveQuery(
    ["orders", "merchants", "products", "robots", "incidents", "flights", "missions"],
    loadAll, [],
  );

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  if (error) return <Shell name={name} onSignOut={signOut} tab={tab} setTab={setTab} live={0}>
    <EmptyState icon={<IconAlert size={26} />} title="Couldn't load the estate" body={error} />
  </Shell>;

  if (!data?.overview) return <Shell name={name} onSignOut={signOut} tab={tab} setTab={setTab} live={0}>
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-[var(--radius-lg)]" />)}
      </div>
      <div className="mt-8"><SkeletonList rows={4} /></div>
    </div>
  </Shell>;

  const { overview, shops, orders, robots, incidents, flights, waypoints, edges, compartments } = data;

  return (
    <Shell name={name} onSignOut={signOut} tab={tab} setTab={setTab} live={overview.orders_live}>
      {tab === "overview" && <OverviewTab o={overview} incidents={incidents} orders={orders} now={now} />}
      {tab === "orders" && <OrdersTab orders={orders} now={now} />}
      {tab === "shops" && <ShopsTab shops={shops} onDone={reload} />}
      {tab === "ops" && <OpsTab robots={robots} compartments={compartments} incidents={incidents}
        waypoints={waypoints} edges={edges} orders={orders} />}
      {tab === "terminal" && <TerminalTab o={overview} flights={flights} now={now} onDone={reload} fidsConfigured={fidsConfigured} />}
    </Shell>
  );
}

/* ---------------------------------------------------------------- shell -- */

function Shell({ children, name, onSignOut, tab, setTab, live }: {
  children: React.ReactNode; name: string; onSignOut: () => void;
  tab: Tab; setTab: (t: Tab) => void; live: number;
}) {
  const tabs = [
    ["overview", "Overview", <IconSparkle key="a" size={16} />],
    ["orders", "Orders", <IconOrders key="b" size={16} />],
    ["shops", "Shops", <IconStore key="c" size={16} />],
    ["ops", "Operations", <IconRobot key="d" size={16} />],
    ["terminal", "Terminal", <IconPin key="e" size={16} />],
  ] as const;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[var(--color-ink)] text-white">
              <IconLock size={19} />
            </span>
            <div>
              <h1 className="headline text-[19px] font-semibold leading-tight">Operations</h1>
              <p className="text-[12.5px] text-[var(--color-muted)]">{name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {live > 0 && <Pill tone="accent"><IconClock size={12} /> {live} live</Pill>}
            <button onClick={onSignOut}
              className="pressable-sm rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 no-bar">
          {tabs.map(([t, label, icon]) => {
            const on = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className="pressable-sm inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors"
                style={on ? { background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }
                          : { color: "var(--color-muted)" }}>
                {icon}{label}
              </button>
            );
          })}
        </nav>
      </header>
      {children}
    </main>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "accent" | "signal" | "alert";
}) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <p className="label">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tnum"
         style={{ color: tone ? `var(--color-${tone})` : "var(--color-ink)" }}>{value}</p>
      {sub && <p className="mt-1.5 text-[12.5px] text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="mt-8">
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

/* ------------------------------------------------------------- overview -- */

function OverviewTab({ o, incidents, orders, now }: {
  o: Overview; incidents: Incident[]; orders: OrderRow[]; now: number;
}) {
  const net = o.commission_cents_today + o.fees_cents_today;
  const recent = orders.slice(0, 6);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Orders today" value={String(o.orders_today)} sub={`${o.orders_live} in progress`} />
        <Tile label="Platform revenue today" value={euros(net)} tone="accent"
              sub={`${euros(o.commission_cents_today)} commission · ${euros(o.fees_cents_today)} fees`} />
        <Tile label="Shop sales today" value={euros(o.gross_cents_today)} sub="Goods, before commission" />
        <Tile label="Late deliveries" value={String(o.sla_missed_today)}
              tone={o.sla_missed_today > 0 ? "alert" : undefined} sub="Fee auto-refunded" />
        <Tile label="Shops open" value={`${o.shops_open}/${o.shops_total}`} />
        <Tile label="Units available" value={`${o.robots_available}/${o.robots_total}`}
              tone={o.robots_available === 0 ? "alert" : undefined} />
        <Tile label="Incidents, 24h" value={String(o.incidents_24h)}
              tone={o.incidents_critical_24h > 0 ? "alert" : undefined}
              sub={`${o.incidents_critical_24h} critical`} />
        <Tile label="Menu items off sale" value={String(o.products_unavailable)}
              tone={o.products_unavailable > 0 ? "signal" : undefined}
              sub={`of ${o.products_total} total`} />
      </div>

      <Section title="Latest orders">
        {recent.length === 0
          ? <Notice tone="accent" title="No orders yet today">They appear here the moment a passenger pays.</Notice>
          : <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
              {recent.map((r) => <OrderRowLine key={r.id} o={r} now={now} />)}
            </div>}
      </Section>

      <Section title="Recent incidents">
        {incidents.length === 0
          ? <Notice tone="accent" title="Nothing logged" icon={<IconCheck size={16} />}>
              No incidents in the last 24 hours.
            </Notice>
          : <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
              {incidents.slice(0, 6).map((i) => <IncidentLine key={i.id} i={i} />)}
            </div>}
      </Section>
    </div>
  );
}

/* --------------------------------------------------------------- orders -- */

function OrdersTab({ orders, now }: { orders: OrderRow[]; now: number }) {
  const [filter, setFilter] = useState<"live" | "all" | "late">("live");
  const shown = orders.filter((o) =>
    filter === "all" ? true :
    filter === "late" ? o.sla_missed :
    LIVE_STATES.includes(o.state));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-2">
        {([["live", "In progress"], ["late", "Late"], ["all", "All"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className="pressable-sm rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
            style={filter === k
              ? { background: "var(--color-ink)", color: "white" }
              : { background: "var(--color-surface-2)", color: "var(--color-ink-2)" }}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-[13px] text-[var(--color-muted)] tnum">{shown.length} orders</span>
      </div>

      {shown.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<IconOrders size={26} />} title="Nothing here"
            body={filter === "late" ? "No deliveries have missed their promise." : "No orders match this filter."} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
          {shown.map((o) => <OrderRowLine key={o.id} o={o} now={now} detailed />)}
        </div>
      )}
    </div>
  );
}

function OrderRowLine({ o, now, detailed }: { o: OrderRow; now: number; detailed?: boolean }) {
  const copy = STATE_COPY[o.state as keyof typeof STATE_COPY];
  const live = LIVE_STATES.includes(o.state);
  const left = o.promise_deadline
    ? Math.round((new Date(o.promise_deadline).getTime() - now) / 1000) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
      <span className="w-[86px] shrink-0 text-[13px] font-semibold tnum">{o.ref}</span>
      <span className="w-[130px] shrink-0 truncate text-[13.5px]">{o.merchant_name}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink-2)]">
        {o.lines?.map((l) => `${l.qty}× ${l.name}`).join(", ")}
      </span>
      {detailed && (
        <span className="w-[120px] shrink-0 truncate text-[12.5px] text-[var(--color-muted)]">
          {o.flight_number ? `${o.flight_number} · ${o.nav_waypoint_name}` : o.nav_waypoint_name}
        </span>
      )}
      {o.sla_missed && <Pill tone="alert">Late</Pill>}
      {live && left !== null && !o.sla_missed && (
        <span className="w-[62px] shrink-0 text-right text-[12.5px] font-medium tnum"
              style={{ color: left < 300 ? "var(--color-alert)" : "var(--color-muted)" }}>
          {left <= 0 ? "overdue" : mmss(left)}
        </span>
      )}
      <span className="w-[128px] shrink-0 text-right text-[12.5px] font-medium"
            style={{ color: live ? "var(--color-accent)" : "var(--color-muted)" }}>
        {copy?.label ?? o.state}
      </span>
      <span className="w-[70px] shrink-0 text-right text-[13px] font-semibold tnum">{euros(o.total_cents)}</span>
    </div>
  );
}

function IncidentLine({ i }: { i: Incident }) {
  const tone = i.severity === "critical" ? "alert" : i.severity === "warn" ? "signal" : "accent";
  return (
    <div className="flex items-start gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
      <span className="mt-0.5 shrink-0" style={{ color: `var(--color-${tone})` }}>
        {i.severity === "critical" ? <IconAlert size={15} /> : <IconClock size={15} />}
      </span>
      <p className="min-w-0 flex-1 text-[13.5px]">{i.message}</p>
      {i.robot_id && <span className="shrink-0 text-[12px] text-[var(--color-muted)]">{i.robot_id}</span>}
      <span className="shrink-0 text-[12px] text-[var(--color-muted)] tnum">
        {new Date(i.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- shops -- */

function ShopsTab({ shops, onDone }: { shops: ShopStat[]; onDone: () => void }) {
  const [editing, setEditing] = useState<ShopStat | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (s: ShopStat) => {
    setBusy(s.merchant_id); setErr(null);
    try { await api("/api/v1/admin", { action: "shop-open", merchantId: s.merchant_id, open: !s.open }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">{shops.length} shops</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {shops.filter((s) => s.open).length} open
        </span>
      </div>

      {err && <div className="mt-3"><Notice tone="alert" title="Couldn't apply that change" icon={<IconAlert size={16} />}>{err}</Notice></div>}

      <div className="mt-4 space-y-2.5">
        {shops.map((s) => (
          <div key={s.merchant_id} className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center gap-4">
              <Monogram name={s.name} colour={s.colour} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[15.5px] font-semibold">{s.name}</h3>
                  {!s.open && <Pill tone="signal">Closed</Pill>}
                  {s.live_orders > 0 && <Pill tone="accent">{s.live_orders} live</Pill>}
                </div>
                <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
                  {s.products} items · {Math.round(s.commission_rate * 1000) / 10}% commission · ~{s.prep_minutes} min prep
                </p>
              </div>

              <div className="flex items-center gap-6 text-right">
                <div>
                  <p className="label">Today</p>
                  <p className="text-[15px] font-semibold tnum">{s.completed_today}</p>
                </div>
                <div>
                  <p className="label">Sales</p>
                  <p className="text-[15px] font-semibold tnum">{euros(s.gross_cents_today)}</p>
                </div>
                <div>
                  <p className="label">Commission</p>
                  <p className="text-[15px] font-semibold tnum" style={{ color: "var(--color-accent)" }}>
                    {euros(s.commission_cents_today)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Terms</Button>
                <Button size="sm" variant={s.open ? "secondary" : "primary"}
                  loading={busy === s.merchant_id} onClick={() => toggle(s)}>
                  {s.open ? "Close" : "Open"}
                </Button>
                <Link href={`/merchant/${s.slug}`}
                  className="pressable inline-flex h-9 items-center rounded-[10px] px-3 text-[13px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]">
                  Console
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <TermsEditor shop={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onDone(); }} />}
    </div>
  );
}

function TermsEditor({ shop, onClose, onDone }: { shop: ShopStat; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState((shop.commission_rate * 100).toFixed(1));
  const [prep, setPrep] = useState(String(shop.prep_minutes));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/api/v1/admin", {
        action: "shop-terms", merchantId: shop.merchant_id,
        commissionRate: parseFloat(rate) / 100, prepMinutes: parseInt(prep, 10),
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  };

  const field = "mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-line)] bg-white px-3.5 py-2.5 text-[15px] tnum outline-none focus:border-[var(--color-accent)]";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <button aria-label="Cancel" onClick={onClose} className="fade-in absolute inset-0 bg-[rgba(16,20,19,0.42)] backdrop-blur-[2px]" />
      <div className="pop relative w-full max-w-sm rounded-[var(--radius-xl)] bg-white p-6 shadow-[var(--shadow-lg)]">
        <h2 className="headline text-[19px] font-semibold">{shop.name}</h2>
        <p className="mt-1 text-[13.5px] text-[var(--color-ink-2)]">Commercial terms for this outlet.</p>

        <label className="mt-5 block">
          <span className="label">Commission (%)</span>
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className={field} />
        </label>
        <label className="mt-3.5 block">
          <span className="label">Default prep time (minutes)</span>
          <input value={prep} onChange={(e) => setPrep(e.target.value)} inputMode="numeric" className={field} />
        </label>

        {err && <div className="mt-4"><Notice tone="alert" title="Not saved" icon={<IconAlert size={16} />}>{err}</Notice></div>}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ops -- */

function OpsTab({ robots, compartments, incidents, waypoints, edges, orders }: {
  robots: Robot[]; compartments: { robot_id: string; id: string; occupied: boolean }[];
  incidents: Incident[]; waypoints: never[]; edges: never[]; orders: OrderRow[];
}) {
  const active = orders.filter((o) => LIVE_STATES.includes(o.state) && o.robot_id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Notice tone="signal" title="Fleet control is not connected yet" icon={<IconRobot size={16} />}>
        These are the robot records in the database. Live dispatch, teleoperation and the emergency
        hold arrive with the vendor interface — everything above the fleet layer already works.
      </Notice>

      <Section title="Terminal">
        <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <TerminalMap waypoints={waypoints} edges={edges} zones={["airside-schengen"]} showLabels />
        </div>
      </Section>

      <Section title={`Units (${robots.length})`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {robots.map((r) => {
            const bays = compartments.filter((c) => c.robot_id === r.id);
            const low = Number(r.battery_pct) < 20;
            return (
              <div key={r.id} className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">{r.name}</span>
                  <Pill tone={r.status === "idle" || r.status === "charging" ? "accent" : "neutral"}>
                    {r.status}
                  </Pill>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div className="h-full rounded-full"
                      style={{ width: `${r.battery_pct}%`,
                               background: low ? "var(--color-alert)" : "var(--color-accent)" }} />
                  </div>
                  <span className="text-[12.5px] font-medium tnum"
                        style={{ color: low ? "var(--color-alert)" : "var(--color-muted)" }}>
                    {Math.round(Number(r.battery_pct))}%
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">
                  {r.zone} · at {r.waypoint_id ?? "unknown"}
                </p>
                <a href={`/robot/${r.id}`} target="_blank" rel="noreferrer"
                  className="pressable-sm mt-3 block rounded-[10px] py-2 text-center text-[12.5px] font-medium"
                  style={{ background: "var(--color-night-3)", color: "var(--color-night-ink)" }}>
                  Open this unit&rsquo;s screen
                </a>
                {bays.length > 0 && (
                  <div className="mt-3 flex gap-1">
                    {bays.map((c) => (
                      <span key={c.id} title={`${c.id}: ${c.occupied ? "loaded" : "empty"}`}
                        className="flex-1 rounded py-1 text-center text-[10px] font-medium"
                        style={{ background: c.occupied ? "var(--color-accent)" : "var(--color-surface-2)",
                                 color: c.occupied ? "white" : "var(--color-muted)" }}>
                        {c.id}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={`Assigned deliveries (${active.length})`}>
        {active.length === 0
          ? <Notice tone="accent" title="No deliveries assigned to a unit">
              Orders reaching the ready state will appear here.
            </Notice>
          : <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
              {active.map((o) => (
                <div key={o.id} className="flex items-center gap-4 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
                  <span className="text-[13px] font-semibold tnum">{o.ref}</span>
                  <span className="text-[13px] text-[var(--color-muted)]">{o.robot_id}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{o.nav_waypoint_name}</span>
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--color-accent)" }}>
                    {STATE_COPY[o.state as keyof typeof STATE_COPY]?.label ?? o.state}
                  </span>
                </div>
              ))}
            </div>}
      </Section>

      <Section title="Incident log">
        {incidents.length === 0
          ? <Notice tone="accent" title="Nothing logged" icon={<IconCheck size={16} />}>No incidents recorded.</Notice>
          : <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
              {incidents.map((i) => <IncidentLine key={i.id} i={i} />)}
            </div>}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------- terminal -- */

function TerminalTab({ o, flights, now, onDone, fidsConfigured }: {
  o: Overview; flights: Flight[]; now: number; onDone: () => void; fidsConfigured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const syncFids = async () => {
    setSyncing(true); setErr(null); setSyncNote(null);
    try {
      const res = await fetch("/api/v1/fids/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sync failed");
      setSyncNote(`${body.synced} departures pulled from ${body.airport}` +
        (body.removed ? `, ${body.removed} stale removed` : ""));
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally { setSyncing(false); }
  };
  const drifted = flights.length > 0 && new Date(flights[flights.length - 1].boarding_at).getTime() < now;

  const rebase = async () => {
    setBusy(true); setErr(null);
    try { await api("/api/v1/admin", { action: "rebase-flights", leadMinutes: 12 }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Delivery points" value={String(o.seats_active)} sub="QR-coded seats" />
        <Tile label="Upcoming departures" value={String(o.flights_upcoming)} />
        <Tile label="Units in fleet" value={String(o.robots_total)} />
      </div>

      <div className="mt-6 space-y-3">
        {fidsConfigured ? (
          <Notice tone="accent" title="Live flight data is connected" icon={<IconCheck size={16} />}>
            Departures are pulled from the Cirium FlightStats FIDS feed. Boarding times are derived
            from scheduled gate departure — that feed publishes departure, not boarding.
          </Notice>
        ) : (
          <Notice tone="signal" title="Using the seeded flight board" icon={<IconPlane size={16} />}>
            Add <span className="font-medium">FLIGHTSTATS_APP_ID</span> and{" "}
            <span className="font-medium">FLIGHTSTATS_APP_KEY</span> to <span className="font-medium">.env.local</span>{" "}
            to pull the real board, then restart the server.
          </Notice>
        )}
        {drifted && !fidsConfigured && (
          <Notice tone="signal" title="The board has drifted into the past" icon={<IconAlert size={16} />}>
            The seeded board is fixed in time. Rebasing shifts every departure forward, keeping the
            spacing between them.
          </Notice>
        )}
        {syncNote && <Notice tone="accent" title="Synced" icon={<IconCheck size={16} />}>{syncNote}</Notice>}
      </div>
      {err && <div className="mt-4"><Notice tone="alert" title="Couldn't rebase" icon={<IconAlert size={16} />}>{err}</Notice></div>}

      <Section title="Flight board" action={
        <div className="flex gap-2">
          {fidsConfigured && (
            <Button size="sm" loading={syncing} onClick={syncFids} icon={<IconPlane size={15} />}>
              Sync live board
            </Button>
          )}
          <Button size="sm" variant="secondary" loading={busy} onClick={rebase}>
            Rebase seeded
          </Button>
        </div>
      }>
        <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
          {flights.map((f) => {
            const mins = Math.round((new Date(f.boarding_at).getTime() - now) / 60000);
            const past = mins < 0;
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
                <span className="w-[80px] shrink-0 text-[13.5px] font-semibold tnum">{f.flight_number}</span>
                <span className="w-[150px] shrink-0 truncate text-[13.5px]">{f.destination}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-muted)]">{f.carrier}</span>
                <span className="w-[60px] shrink-0 text-[12.5px] text-[var(--color-muted)]">
                  {f.gate ? `Gate ${f.gate}` : "—"}
                </span>
                <span className="w-[86px] shrink-0 text-right text-[13px] font-medium tnum"
                      style={{ color: past ? "var(--color-alert)" : mins < 20 ? "var(--color-signal)" : "var(--color-accent)" }}>
                  {past ? `${Math.abs(mins)}m ago` : `in ${mins}m`}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
