"use client";

import { useEffect, useMemo, useState } from "react";
import { api, useNow, useSnapshot } from "@/lib/client";
import { euros, inMinutes, mmss } from "@/lib/format";
import { STATE_COPY, progressOf } from "@/domain/orders/machine";
import { TerminalMap } from "@/components/TerminalMap";
import type { Flight, Merchant, Order, Product, Waypoint } from "@/domain/types";

type Step = "flight" | "shops" | "menu" | "cart" | "orders" | "tracking";
type Cart = Record<string, number>;

interface Quote {
  verdict: "ACCEPT" | "WARN" | "REFUSE";
  reason: string;
  slackSeconds: number;
  goodsCents: number;
  deliveryFeeCents: number;
  blockedItems: string[];
  promise: { deliverBy: number };
}

interface Confirmation {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}

const LS_KEY = "gate-delivery-session";
const LIVE = ["DRAFT", "VALIDATED", "AUTHORIZED", "SENT_TO_MERCHANT", "ACCEPTED",
  "PREPARING", "READY", "ROBOT_ASSIGNED", "AT_MERCHANT", "LOADED", "IN_TRANSIT",
  "ARRIVED", "NO_SHOW"];

interface Session {
  orderIds?: string[];
  flightId?: string | null;
  waypointId?: string | null;
  activeOrderId?: string | null;
  step?: Step;
}

function readSession(): Session {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Session;
  } catch {
    return {};
  }
}

export function OrderApp({ initialWaypointId }: { initialWaypointId?: string }) {
  const { snap, connected } = useSnapshot();
  const now = useNow();

  // Hydrated from localStorage on first render so a refresh, a tab switch or a
  // dropped connection never loses an order the passenger has already paid for.
  const [session] = useState<Session>(readSession);
  const [step, setStep] = useState<Step>(() => {
    if (initialWaypointId && !session.orderIds?.length) return session.flightId ? "shops" : "flight";
    if (session.step && session.orderIds?.length) return session.step;
    if (session.orderIds?.length) return "orders";
    return session.flightId ? "shops" : "flight";
  });
  const [flightId, setFlightId] = useState<string | null>(session.flightId ?? null);
  const [waypointId, setWaypointId] = useState<string | null>(
    initialWaypointId ?? session.waypointId ?? null,
  );
  const [orderIds, setOrderIds] = useState<string[]>(session.orderIds ?? []);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(session.activeOrderId ?? null);

  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [quoteResult, setQuoteResult] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pickingPoint, setPickingPoint] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ orderIds, flightId, waypointId, activeOrderId, step } satisfies Session),
    );
  }, [orderIds, flightId, waypointId, activeOrderId, step]);

  const flight = useMemo(
    () => snap?.flights.find((f) => f.id === flightId) ?? null, [snap, flightId]);
  const waypoint = useMemo(
    () => snap?.waypoints.find((w) => w.id === waypointId) ?? null, [snap, waypointId]);
  const merchant = useMemo(
    () => snap?.merchants.find((m) => m.id === merchantId) ?? null, [snap, merchantId]);

  const myOrders = useMemo(() => {
    if (!snap) return [];
    return orderIds
      .map((id) => snap.orders.find((o) => o.id === id))
      .filter((o): o is Order => Boolean(o));
  }, [snap, orderIds]);

  const liveOrders = myOrders.filter((o) => LIVE.includes(o.state));
  const activeOrder = myOrders.find((o) => o.id === activeOrderId) ?? null;
  // Orders the phone remembers but the server no longer has — the scenario was
  // reset from the ops console. Surfaced, never a blank screen.
  const missingCount = orderIds.length - myOrders.length;

  /* the gate on the boarding pass pre-fills the delivery point */
  const derivedWaypointId = useMemo(() => {
    if (waypointId) return waypointId;
    if (!snap || !flight) return null;
    return snap.waypoints.find((w) => w.kind === "gate" && w.gate === flight.gate)?.id ?? null;
  }, [snap, flight, waypointId]);
  const effectiveWaypoint = waypoint
    ?? snap?.waypoints.find((w) => w.id === derivedWaypointId)
    ?? null;

  const canQuote = Boolean(
    merchantId && flightId && derivedWaypointId && Object.keys(cart).length > 0,
  );

  /* live quote whenever the cart or destination moves */
  useEffect(() => {
    if (!canQuote) return;
    const lines = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));
    let cancelled = false;
    api<Quote>("/api/quote", {
      merchantId, lines, flightId, deliveryWaypointId: derivedWaypointId,
    })
      .then((q) => { if (!cancelled) setQuoteResult(q); })
      .catch(() => { if (!cancelled) setQuoteResult(null); });
    return () => { cancelled = true; };
  }, [canQuote, cart, merchantId, flightId, derivedWaypointId]);

  // Derived, not stored: an empty basket has no quote by definition, so there
  // is nothing to reset when the inputs go away.
  const quote = canQuote ? quoteResult : null;

  if (!snap) {
    return (
      <div className="grid min-h-screen place-items-center bg-ground">
        <div className="text-center">
          <div className="eyebrow">connecting…</div>
          <p className="mt-2 text-sm text-muted">Reconnecting automatically.</p>
        </div>
      </div>
    );
  }

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const products = snap.products.filter((p) => p.merchantId === merchantId);

  const add = (p: Product) => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
  const remove = (p: Product) =>
    setCart((c) => {
      const n = (c[p.id] ?? 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[p.id]; else next[p.id] = n;
      return next;
    });

  const place = async () => {
    if (!merchantId || !flightId || !derivedWaypointId) return;
    setPlacing(true); setError(null);
    try {
      const lines = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));
      const res = await api<{ order: Order }>("/api/order", {
        merchantId, lines, flightId, deliveryWaypointId: derivedWaypointId,
      });
      setOrderIds((ids) => [res.order.id, ...ids]);
      setActiveOrderId(res.order.id);
      setCart({});
      setMerchantId(null);
      setStep("tracking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPlacing(false);
    }
  };

  // Changing the flight is destructive to the current basket and re-anchors the
  // delivery point, so it is confirmed — and blocked outright while an order is
  // in flight, because there is no version of that action a passenger wants.
  const requestFlightChange = () => {
    if (liveOrders.length > 0) return;
    setConfirmation({
      title: "Change flight?",
      body: "This clears your basket and resets the delivery point. Orders you have already placed are kept.",
      confirmLabel: "Change flight",
      onConfirm: () => {
        setStep("flight");
        setCart({});
        setMerchantId(null);
        setWaypointId(null);
        setConfirmation(null);
      },
    });
  };

  const showNav = step !== "flight";

  return (
    <main className="mx-auto min-h-screen max-w-md bg-ground" style={{ paddingBottom: showNav ? 132 : 24 }}>
      <Header
        flight={flight}
        waypoint={effectiveWaypoint}
        now={now}
        connected={connected}
        locked={liveOrders.length > 0}
        onChangeFlight={requestFlightChange}
      />

      {step === "flight" && (
        <FlightPicker
          flights={snap.flights}
          now={now}
          onPick={(f) => {
            setFlightId(f.id);
            if (!initialWaypointId) setWaypointId(null);
            setStep("shops");
          }}
        />
      )}

      {step === "shops" && flight && (
        <ShopList
          merchants={snap.merchants.filter((m) => m.zone === "airside-schengen")}
          products={snap.products}
          onPick={(m) => { setMerchantId(m.id); setStep("menu"); }}
          onChangePoint={() => setPickingPoint(true)}
          waypoint={effectiveWaypoint}
        />
      )}

      {step === "menu" && merchant && (
        <Menu
          merchant={merchant} products={products} cart={cart}
          onAdd={add} onRemove={remove} onBack={() => setStep("shops")}
        />
      )}

      {step === "cart" && merchant && (
        <CartView
          merchant={merchant} products={snap.products} cart={cart} quote={quote}
          waypoint={effectiveWaypoint} now={now} error={error} placing={placing}
          onAdd={add} onRemove={remove}
          onChangePoint={() => setPickingPoint(true)}
          onBack={() => setStep("menu")}
          onPlace={place}
        />
      )}

      {step === "orders" && (
        <OrdersList
          orders={myOrders}
          snap={snap}
          now={now}
          missingCount={missingCount}
          onOpen={(o) => { setActiveOrderId(o.id); setStep("tracking"); }}
          onForget={() => setOrderIds(myOrders.map((o) => o.id))}
          onShop={() => setStep("shops")}
        />
      )}

      {step === "tracking" && activeOrder && (
        <Tracking
          order={activeOrder} snap={snap} now={now}
          onBack={() => setStep("orders")}
          onShopAgain={() => { setMerchantId(null); setStep("shops"); }}
        />
      )}

      {step === "tracking" && !activeOrder && (
        <section className="px-5 py-10 text-center">
          <div className="text-4xl">🔍</div>
          <h1 className="mt-3 text-xl font-bold">That order isn&rsquo;t on this system</h1>
          <p className="mt-2 text-sm text-ink-2">
            The demo scenario was probably reset. Your other orders are unaffected.
          </p>
          <button
            onClick={() => setStep("orders")}
            className="mt-5 w-full rounded-lg py-3.5 font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            Back to my orders
          </button>
        </section>
      )}

      {pickingPoint && effectiveWaypoint && (
        <PointPicker
          snap={snap} current={effectiveWaypoint}
          onClose={() => setPickingPoint(false)}
          onPick={(w) => { setWaypointId(w.id); setPickingPoint(false); }}
        />
      )}

      {confirmation && (
        <ConfirmDialog
          {...confirmation}
          onCancel={() => setConfirmation(null)}
        />
      )}

      {cartCount > 0 && !["tracking", "orders"].includes(step) && (
        <button
          onClick={() => setStep("cart")}
          className="fixed inset-x-0 mx-auto flex max-w-md items-center justify-between px-5 py-3.5 text-white shadow-lg"
          style={{ bottom: showNav ? 64 : 0, background: "var(--color-accent)" }}
        >
          <span className="font-semibold">{cartCount} item{cartCount > 1 ? "s" : ""}</span>
          <span className="mono">{euros(quote?.goodsCents ?? 0)} · Review →</span>
        </button>
      )}

      {showNav && (
        <BottomNav
          step={step}
          liveCount={liveOrders.length}
          totalCount={myOrders.length}
          onShop={() => setStep("shops")}
          onOrders={() => setStep("orders")}
        />
      )}
    </main>
  );
}

/* ------------------------------ bottom nav ------------------------------ */

function BottomNav({
  step, liveCount, totalCount, onShop, onOrders,
}: {
  step: Step; liveCount: number; totalCount: number;
  onShop: () => void; onOrders: () => void;
}) {
  const onShopTab = ["shops", "menu", "cart"].includes(step);
  const onOrdersTab = ["orders", "tracking"].includes(step);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-line bg-surface">
      <Tab label="Order" icon="🛍️" active={onShopTab} onClick={onShop} />
      <Tab
        label="My orders" icon="📦" active={onOrdersTab} onClick={onOrders}
        badge={liveCount > 0 ? liveCount : totalCount > 0 ? totalCount : undefined}
        badgeLive={liveCount > 0}
      />
    </nav>
  );
}

function Tab({
  label, icon, active, onClick, badge, badgeLive,
}: {
  label: string; icon: string; active: boolean; onClick: () => void;
  badge?: number; badgeLive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5"
      style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      {badge !== undefined && (
        <span
          className="mono absolute right-[26%] top-1.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
          style={{ background: badgeLive ? "var(--color-accent)" : "var(--color-muted)" }}
        >
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-6 top-0 h-0.5 rounded-full" style={{ background: "var(--color-accent)" }} />
      )}
    </button>
  );
}

/* ----------------------------- confirm dialog --------------------------- */

function ConfirmDialog({
  title, body, confirmLabel, onConfirm, onCancel,
}: Confirmation & { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1.5 text-sm text-ink-2">{body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-line py-3 font-semibold">
            Keep as is
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg py-3 font-semibold text-white"
            style={{ background: "var(--color-alert)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- header -------------------------------- */

function Header({
  flight, waypoint, now, connected, locked, onChangeFlight,
}: {
  flight: Flight | null; waypoint: Waypoint | null; now: number;
  connected: boolean; locked: boolean; onChangeFlight: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <div className="eyebrow">Gate Delivery · ZAG</div>
          {flight ? (
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="mono text-sm font-semibold">{flight.number}</span>
              <span className="text-sm text-ink-2">{flight.destinationCode}</span>
              <span className="mono rounded bg-surface-2 px-1.5 py-0.5 text-xs">Gate {flight.gate}</span>
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-muted">Scan your boarding pass</div>
          )}
        </div>
        <div className="text-right">
          {flight && (
            <>
              <div className="mono text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
                Boards {inMinutes(flight.boardingAt, now)}
              </div>
              {locked ? (
                <span className="eyebrow" title="You have an order in progress">🔒 order in progress</span>
              ) : (
                <button onClick={onChangeFlight} className="eyebrow underline">change flight</button>
              )}
            </>
          )}
          {!connected && <div className="eyebrow" style={{ color: "var(--color-alert)" }}>offline</div>}
        </div>
      </div>
      {waypoint && (
        <div className="border-t border-line bg-accent-soft px-5 py-1.5">
          <span className="mono text-xs" style={{ color: "var(--color-accent)" }}>
            Delivering to {waypoint.name}
          </span>
        </div>
      )}
    </header>
  );
}

/* ------------------------------ orders list ----------------------------- */

function OrdersList({
  orders, snap, now, missingCount, onOpen, onForget, onShop,
}: {
  orders: Order[];
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  now: number; missingCount: number;
  onOpen: (o: Order) => void; onForget: () => void; onShop: () => void;
}) {
  const live = orders.filter((o) => LIVE.includes(o.state));
  const past = orders.filter((o) => !LIVE.includes(o.state));

  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">My orders</h1>
      <p className="mt-1 text-sm text-ink-2">
        Everything you&rsquo;ve ordered on this device. Nothing here is ever lost by navigating away.
      </p>

      {orders.length === 0 && missingCount === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <div className="text-4xl">📦</div>
          <p className="mt-3 text-ink-2">No orders yet.</p>
          <button
            onClick={onShop}
            className="mt-4 rounded-lg px-5 py-3 font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            Browse the shops
          </button>
        </div>
      )}

      {live.length > 0 && (
        <>
          <div className="eyebrow mt-6">In progress</div>
          <div className="mt-2 space-y-2">
            {live.map((o) => <OrderRow key={o.id} order={o} snap={snap} now={now} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="eyebrow mt-6">Completed</div>
          <div className="mt-2 space-y-2">
            {past.map((o) => <OrderRow key={o.id} order={o} snap={snap} now={now} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {missingCount > 0 && (
        <div
          className="mt-6 rounded-lg p-4"
          style={{ background: "var(--color-signal-soft)", borderLeft: "3px solid var(--color-signal)" }}
        >
          <div className="mono text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-signal)" }}>
            {missingCount} order{missingCount > 1 ? "s" : ""} no longer on the system
          </div>
          <p className="mt-1 text-sm text-ink-2">
            The demo scenario was reset. Your remaining orders are unaffected.
          </p>
          <button onClick={onForget} className="mono mt-2 text-xs underline">clear them from this list</button>
        </div>
      )}
    </section>
  );
}

function OrderRow({
  order, snap, now, onOpen,
}: {
  order: Order;
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  now: number; onOpen: (o: Order) => void;
}) {
  const copy = STATE_COPY[order.state];
  const merchant = snap.merchants.find((m) => m.id === order.merchantId);
  const unit = snap.units.find((u) => u.id === order.robotId);
  const isLive = LIVE.includes(order.state);
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";

  return (
    <button
      onClick={() => onOpen(order)}
      className="w-full rounded-lg border bg-surface p-4 text-left"
      style={{
        borderColor: arrived ? "var(--color-accent)" : "var(--color-line)",
        borderWidth: arrived ? 2 : 1,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="mono text-xs text-muted">{order.ref}</span>
        <span className="mono text-xs text-muted">{merchant?.name}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ color: arrived ? "var(--color-accent)" : undefined }}>
          {copy.label}
        </span>
        <span className="mono text-sm">{euros(order.totalCents)}</span>
      </div>
      <div className="mt-1 truncate text-xs text-ink-2">
        {order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
      </div>
      {isLive && (
        <div className="mt-2 flex items-center justify-between">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(progressOf(order.state) * 100)}%`, background: "var(--color-accent)" }}
            />
          </div>
          <span className="mono ml-3 text-xs" style={{ color: "var(--color-accent)" }}>
            {arrived ? `code ${order.handoverCode}`
              : order.state === "IN_TRANSIT" && unit?.etaSeconds ? `${mmss(unit.etaSeconds)} away`
              : inMinutes(order.promise.deliverBy, now)}
          </span>
        </div>
      )}
    </button>
  );
}

/* ----------------------------- flight picker ---------------------------- */

function FlightPicker({
  flights, now, onPick,
}: { flights: Flight[]; now: number; onPick: (f: Flight) => void }) {
  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Scan your boarding pass</h1>
      <p className="mt-2 text-sm text-ink-2">
        We use your flight to make sure we can reach you before boarding. Nothing to install.
      </p>
      <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-surface p-4 text-center">
        <div className="text-3xl">📷</div>
        <div className="eyebrow mt-2">camera scan simulated — pick a flight below</div>
      </div>
      <div className="mt-5 space-y-2">
        {flights.map((f) => {
          const mins = Math.round((f.boardingAt - now) / 60000);
          const tight = mins < 20;
          return (
            <button
              key={f.id}
              onClick={() => onPick(f)}
              className="flex w-full items-center justify-between rounded-lg border border-line bg-surface p-4 text-left transition hover:border-ink"
            >
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="mono font-semibold">{f.number}</span>
                  <span className="text-sm text-ink-2">{f.destination}</span>
                </div>
                <div className="eyebrow mt-1">
                  {f.carrier} · Gate {f.gate}{f.nonEu && " · non-EU"}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-sm font-semibold"
                     style={{ color: tight ? "var(--color-alert)" : "var(--color-accent)" }}>
                  {mins > 0 ? `${mins} min` : "boarding"}
                </div>
                <div className="eyebrow">to boarding</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------- shop list ------------------------------ */

function ShopList({
  merchants, products, onPick, onChangePoint, waypoint,
}: {
  merchants: Merchant[]; products: Product[];
  onPick: (m: Merchant) => void; onChangePoint: () => void; waypoint: Waypoint | null;
}) {
  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Order to your seat</h1>
      {waypoint && (
        <p className="mt-1 text-sm text-ink-2">
          {waypoint.landmark}.{" "}
          <button onClick={onChangePoint} className="underline" style={{ color: "var(--color-accent)" }}>
            Change spot
          </button>
        </p>
      )}
      <div className="mt-5 space-y-3">
        {merchants.map((m) => {
          const count = products.filter((p) => p.merchantId === m.id && p.available).length;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m)}
              className="w-full rounded-lg border border-line bg-surface p-4 text-left transition hover:border-ink"
              style={{ borderLeftWidth: 4, borderLeftColor: m.colour }}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{m.name}</h2>
                <span className="mono text-xs text-muted">~{m.prepMinutes} min</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{m.blurb}</p>
              <div className="eyebrow mt-2">{count} items available</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------- menu --------------------------------- */

function Menu({
  merchant, products, cart, onAdd, onRemove, onBack,
}: {
  merchant: Merchant; products: Product[]; cart: Cart;
  onAdd: (p: Product) => void; onRemove: (p: Product) => void; onBack: () => void;
}) {
  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← all shops</button>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{merchant.name}</h1>
      <p className="mt-1 text-sm text-ink-2">{merchant.blurb}</p>
      <div className="mt-5 space-y-2">
        {products.map((p) => {
          const qty = cart[p.id] ?? 0;
          const blocked = p.ageRestricted;
          return (
            <div key={p.id}
                 className={`flex items-center gap-3 rounded-lg border border-line bg-surface p-3 ${!p.available ? "opacity-45" : ""}`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-surface-2 text-xl">{p.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="mono shrink-0 text-sm">{euros(p.priceCents)}</span>
                </div>
                <p className="truncate text-xs text-muted">{p.description}</p>
                {blocked && (
                  <div className="mono mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]"
                       style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}>
                    COLLECT IN STORE — AGE CHECK REQUIRED
                  </div>
                )}
                {!p.available && <div className="eyebrow mt-1">unavailable right now</div>}
              </div>
              {!blocked && p.available && (
                <div className="flex shrink-0 items-center gap-2">
                  {qty > 0 && (
                    <>
                      <button onClick={() => onRemove(p)} aria-label={`Remove one ${p.name}`}
                              className="h-9 w-9 rounded-full border border-line text-lg leading-none">−</button>
                      <span className="mono w-4 text-center text-sm">{qty}</span>
                    </>
                  )}
                  <button onClick={() => onAdd(p)} aria-label={`Add ${p.name}`}
                          className="h-9 w-9 rounded-full text-lg leading-none text-white"
                          style={{ background: "var(--color-accent)" }}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------- cart --------------------------------- */

function CartView({
  merchant, products, cart, quote, waypoint, now, error, placing,
  onAdd, onRemove, onChangePoint, onBack, onPlace,
}: {
  merchant: Merchant; products: Product[]; cart: Cart; quote: Quote | null;
  waypoint: Waypoint | null; now: number; error: string | null; placing: boolean;
  onAdd: (p: Product) => void; onRemove: (p: Product) => void;
  onChangePoint: () => void; onBack: () => void; onPlace: () => void;
}) {
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id)!, qty }))
    .filter((l) => l.product);

  const refused = quote?.verdict === "REFUSE";
  const warned = quote?.verdict === "WARN";
  const total = (quote?.goodsCents ?? 0) + (quote?.deliveryFeeCents ?? 0);

  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← keep browsing</button>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Your order</h1>

      <div className="mt-4 space-y-2">
        {lines.map(({ product, qty }) => (
          <div key={product.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <div className="grid h-10 w-10 place-items-center rounded bg-surface-2">{product.emoji}</div>
            <div className="flex-1">
              <div className="font-medium">{product.name}</div>
              <div className="mono text-xs text-muted">{euros(product.priceCents)} each</div>
            </div>
            <button onClick={() => onRemove(product)} className="h-8 w-8 rounded-full border border-line">−</button>
            <span className="mono w-4 text-center">{qty}</span>
            <button onClick={() => onAdd(product)} className="h-8 w-8 rounded-full border border-line">+</button>
          </div>
        ))}
      </div>

      {waypoint && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="eyebrow">Delivering to</div>
          <div className="mt-1 font-semibold">{waypoint.name}</div>
          <p className="mt-1 text-sm text-ink-2">{waypoint.landmark}</p>
          <p className="mt-2 text-xs text-muted">
            The unit stops here, not at your seat — you&rsquo;ll walk a few steps and keep the gate in sight.
          </p>
          <button onClick={onChangePoint} className="mono mt-2 text-xs underline" style={{ color: "var(--color-accent)" }}>
            choose a different spot
          </button>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <Row label={`${merchant.name} items`} value={euros(quote?.goodsCents ?? 0)} />
        <Row label="Delivery" value={euros(quote?.deliveryFeeCents ?? 0)} />
        <div className="mt-2 border-t border-line pt-2">
          <Row label="Total" value={euros(total)} bold />
        </div>
      </div>

      {quote && quote.blockedItems.length > 0 && (
        <Notice tone="signal" title="Not deliverable by robot">
          {quote.blockedItems.join(", ")} needs an age check, so it can&rsquo;t be handed over by an
          unattended unit. Collect it in store — the rest still comes to you.
        </Notice>
      )}

      {quote && !refused && (
        <Notice tone={warned ? "signal" : "accent"} title={warned ? "This is tight" : "We can make it"}>
          {quote.reason}{" "}
          {!warned && (
            <>Arrives by <strong className="mono">
              {new Date(quote.promise.deliverBy).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </strong>.</>
          )}
        </Notice>
      )}

      {refused && <Notice tone="alert" title="Too tight against boarding">{quote.reason}</Notice>}
      {error && <Notice tone="alert" title="Couldn't place the order">{error}</Notice>}

      <button
        onClick={onPlace}
        disabled={placing || refused || lines.length === 0}
        className="mt-5 w-full rounded-lg py-4 font-semibold text-white disabled:opacity-40"
        style={{ background: refused ? "var(--color-muted)" : "var(--color-accent)" }}
      >
        {placing ? "Placing…" : refused ? "Not available for this flight" : `Pay ${euros(total)}`}
      </button>
      <p className="eyebrow mt-2 text-center">payment simulated · nothing is charged</p>
      <p className="mono mt-3 text-center text-[10px] text-muted">
        boarding {inMinutes(quote?.promise.deliverBy ?? now, now)} — recalculated live
      </p>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className={bold ? "font-semibold" : "text-sm text-ink-2"}>{label}</span>
      <span className={`mono ${bold ? "font-semibold" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function Notice({
  tone, title, children,
}: { tone: "accent" | "signal" | "alert"; title: string; children: React.ReactNode }) {
  const bg = `var(--color-${tone}-soft)`;
  const fg = `var(--color-${tone})`;
  return (
    <div className="mt-4 rounded-lg p-4" style={{ background: bg, borderLeft: `3px solid ${fg}` }}>
      <div className="mono text-xs font-semibold uppercase tracking-wider" style={{ color: fg }}>{title}</div>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </div>
  );
}

/* ------------------------------ point picker ---------------------------- */

function PointPicker({
  snap, current, onClose, onPick,
}: {
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  current: Waypoint; onClose: () => void; onPick: (w: Waypoint) => void;
}) {
  const options = snap.waypoints.filter((w) => w.kind === "gate" && w.zone === "airside-schengen");
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ground">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div>
          <div className="eyebrow">Where are you sitting?</div>
          <div className="text-sm font-semibold">Pick a delivery point</div>
        </div>
        <button onClick={onClose} className="mono rounded-lg border border-line px-4 py-2 text-sm">done</button>
      </div>
      <div className="border-b border-line bg-surface px-3 py-4">
        <TerminalMap
          waypoints={snap.waypoints} edges={snap.edges} zones={["airside-schengen"]}
          highlightWaypointId={current.id} selectableKinds={["gate"]} onSelect={onPick}
        />
      </div>
      <div className="no-bar flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-3 text-xs text-muted">
          This only affects your next order. Orders already placed keep the spot you chose for them.
        </p>
        <div className="space-y-2">
          {options.map((w) => (
            <button
              key={w.id} onClick={() => onPick(w)}
              className="w-full rounded-lg border bg-surface p-3 text-left"
              style={{
                borderColor: w.id === current.id ? "var(--color-accent)" : "var(--color-line)",
                borderWidth: w.id === current.id ? 2 : 1,
              }}
            >
              <div className="font-medium">{w.name}</div>
              <div className="text-xs text-muted">{w.landmark}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- tracking ------------------------------ */

function Tracking({
  order, snap, now, onBack, onShopAgain,
}: {
  order: Order;
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  now: number; onBack: () => void; onShopAgain: () => void;
}) {
  const copy = STATE_COPY[order.state];
  const unit = snap.units.find((u) => u.id === order.robotId);
  const waypoint = snap.waypoints.find((w) => w.id === order.deliveryWaypointId);
  const merchant = snap.merchants.find((m) => m.id === order.merchantId);
  const flight = snap.flights.find((f) => f.id === order.flightId);
  const progress = progressOf(order.state);
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";
  const done = ["COMPLETED", "REJECTED", "ABORTED"].includes(order.state);
  const gateChanged = order.history.some((h) => h.note?.startsWith("Gate change"));

  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← my orders</button>
      <div className="eyebrow mt-2">{order.ref}</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{copy.label}</h1>
      <p className="mt-1 text-ink-2">{copy.detail}</p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all duration-700"
             style={{
               width: `${Math.round(progress * 100)}%`,
               background: done && order.state !== "COMPLETED" ? "var(--color-alert)" : "var(--color-accent)",
             }} />
      </div>

      {arrived && (
        <div className="mt-5 rounded-lg p-5 text-center" style={{ background: "var(--color-accent)" }}>
          <div className="mono text-xs uppercase tracking-widest text-white/80">Enter this on the screen</div>
          <div className="mono mt-1 text-5xl font-bold tracking-[0.2em] text-white">{order.handoverCode}</div>
          <div className="mt-2 text-sm text-white/90">{waypoint?.landmark}</div>
        </div>
      )}

      {gateChanged && !done && (
        <Notice tone="signal" title="Your gate changed">
          {flight?.number} moved to gate {flight?.gate}. We rerouted — your order is still coming.
        </Notice>
      )}
      {order.slaMissed && (
        <Notice tone="alert" title="We were late">Your delivery fee has been refunded automatically.</Notice>
      )}
      {order.state === "NO_SHOW" && (
        <Notice tone="signal" title="We couldn't find you">
          The unit is holding at {waypoint?.name}. Enter your code when you get there.
        </Notice>
      )}

      {!done && unit && (
        <div className="mt-5 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{unit.name}</span>
            <span className="mono text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
              {order.state === "IN_TRANSIT" && unit.etaSeconds
                ? `${mmss(unit.etaSeconds)} away`
                : unit.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="mt-3">
            <TerminalMap
              waypoints={snap.waypoints} edges={snap.edges} zones={["airside-schengen"]}
              units={[unit]} highlightWaypointId={order.deliveryWaypointId} showLabels
            />
          </div>
        </div>
      )}

      {!done && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border p-4"
             style={{ borderColor: "var(--color-line)", background: "var(--color-plum-soft)" }}>
          <span className="text-2xl">🫒</span>
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-plum)" }}>
              Sponsored · Aelia Duty Free
            </div>
            <p className="text-sm text-ink-2">
              Istrian olive oil, award-winning — delivered to your gate before you board.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-line bg-surface p-4">
        <div className="eyebrow">Order</div>
        <div className="mt-2 space-y-1">
          {order.lines.map((l) => (
            <div key={l.productId} className="flex justify-between text-sm">
              <span>{l.emoji} {l.qty} × {l.name}</span>
              <span className="mono">{euros(l.unitPriceCents * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1 text-sm">
            <span className="text-muted">Delivery</span>
            <span className="mono text-muted">{euros(order.deliveryFeeCents)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="mono">{euros(order.totalCents)}</span>
          </div>
        </div>
        <div className="eyebrow mt-3">from {merchant?.name}</div>
      </div>

      <details className="mt-4 rounded-lg border border-line bg-surface p-4">
        <summary className="eyebrow cursor-pointer">Order history</summary>
        <ol className="mono mt-3 space-y-1 text-xs text-ink-2">
          {order.history.map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleTimeString("en-GB")} · {h.state}{h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ol>
      </details>

      {done && (
        <button onClick={onShopAgain}
                className="mt-5 w-full rounded-lg py-4 font-semibold text-white"
                style={{ background: "var(--color-accent)" }}>
          Order something else
        </button>
      )}
      <p className="mono mt-4 text-center text-[10px] text-muted">
        {new Date(now).toLocaleTimeString("en-GB")}
      </p>
    </section>
  );
}
