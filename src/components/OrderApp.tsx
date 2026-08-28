"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, supabase, useNow } from "@/lib/hooks";
import { euros, inMinutes } from "@/lib/format";
import { STATE_COPY, progressOf } from "@/domain/orders/machine";
import { TerminalMap } from "@/components/TerminalMap";
import type {
  DeliveryLocationKind, Flight, Merchant, OrderState, Product, RouteEdge, Seat, Waypoint,
} from "@/domain/types";

type Step = "flight" | "shops" | "menu" | "cart" | "orders" | "tracking";
type Cart = Record<string, { qty: number; optionIds: string[] }>;

const LS_KEY = "gate-delivery-session";
const LIVE: OrderState[] = ["DRAFT","VALIDATED","AUTHORIZED","SENT_TO_MERCHANT","ACCEPTED",
  "PREPARING","READY","ROBOT_ASSIGNED","AT_MERCHANT","LOADED","IN_TRANSIT","ARRIVED","NO_SHOW"];

interface Catalogue {
  waypoints: Waypoint[]; edges: RouteEdge[]; merchants: Merchant[]; products: Product[];
  flights: Flight[];
  categories: { id: string; merchant_id: string; name: string; sort_order: number }[];
  optionGroups: { id: string; product_id: string; name: string; min_select: number; max_select: number }[];
  options: { id: string; group_id: string; name: string; price_delta_cents: number; available: boolean }[];
}

interface Quote {
  verdict: "ACCEPT" | "WARN" | "REFUSE"; reason: string;
  goodsCents: number; deliveryFeeCents: number; totalCents: number;
  blockedItems: string[];
  location: { navWaypointId: string; walkMetres: number; note: string };
  promise: { deliverBy: number };
}

interface OrderRow {
  id: string; ref: string; state: OrderState; total_cents: number; delivery_fee_cents: number;
  handover_code: string; nav_waypoint_name: string; nav_waypoint_landmark: string;
  location_note: string; walk_metres: number; robot_id: string | null;
  merchant_name: string; flight_number: string | null; flight_gate: string | null;
  sla_missed: boolean; created_at: string;
  lines: { name: string; emoji: string; qty: number; unit_price_cents: number; options: { name: string }[] }[];
}

interface LocationChoice {
  kind: DeliveryLocationKind;
  seatId?: string; pinX?: number; pinY?: number; waypointId?: string;
  label: string; detail: string;
}

export function OrderApp({ seatToken }: { seatToken?: string }) {
  const now = useNow();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [ready, setReady] = useState(false);

  const [step, setStep] = useState<Step>("flight");
  const [flightId, setFlightId] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<OrderRow[]>([]);

  const [quoteResult, setQuoteResult] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);

  /* ---- boot: anonymous session, catalogue, restored state ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = supabase();
      const { data: { session } } = await db.auth.getSession();
      if (!session) await db.auth.signInAnonymously();

      const c = (await (await fetch("/api/v1/catalogue")).json()) as Catalogue;
      if (cancelled) return;
      setCat(c);

      let restored: { orderIds?: string[]; flightId?: string; activeOrderId?: string; step?: Step; location?: LocationChoice } = {};
      try { restored = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { /* ignore */ }

      if (seatToken) {
        try {
          const r = await (await fetch(`/api/v1/seat/${encodeURIComponent(seatToken)}`)).json();
          const s = r.seat as Seat;
          setLocation({
            kind: "seat", seatId: s.id,
            label: `Seat ${s.seatLabel}${s.gate ? ` · gate ${s.gate}` : ""}`,
            detail: `${s.walkMetres.toFixed(1)} m from where the unit stops`,
          });
        } catch { /* fall through to manual choice */ }
      } else if (restored.location) {
        setLocation(restored.location);
      }

      // Hydration from localStorage after an await — one-shot, not a render loop.
      if (restored.flightId) setFlightId(restored.flightId);
      if (restored.orderIds?.length) {
        setOrderIds(restored.orderIds);
        setActiveOrderId(restored.activeOrderId ?? null);
        setStep(restored.step === "tracking" && restored.activeOrderId ? "tracking" : "orders");
      } else if (restored.flightId) {
        setStep("shops");
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [seatToken]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ orderIds, flightId, activeOrderId, step, location }));
  }, [ready, orderIds, flightId, activeOrderId, step, location]);

  /* ---- my orders, live ---- */
  const loadOrders = useCallback(async () => {
    if (orderIds.length === 0) return;   // nothing to fetch; the list is derived below
    const { data } = await supabase().from("order_details").select("*").in("id", orderIds);
    setFetched(((data ?? []) as unknown as OrderRow[]).sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
  }, [orderIds]);

  useEffect(() => {
    // loadOrders is async and only sets state after awaiting the query, which the rule cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders();
    const db = supabase();
    const ch = db.channel(`my-orders-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadOrders())
      .subscribe();
    return () => { void db.removeChannel(ch); };
  }, [loadOrders]);

  /* ---- live quote ---- */
  const cartEntries = useMemo(() => Object.entries(cart), [cart]);
  const canQuote = Boolean(merchantId && flightId && location && cartEntries.length > 0);
  useEffect(() => {
    if (!canQuote || !location || !merchantId || !flightId) return;
    let cancelled = false;
    api<Quote>("/api/v1/quote", {
      merchantId, flightId,
      lines: cartEntries.map(([productId, v]) => ({ productId, qty: v.qty, optionIds: v.optionIds })),
      location: { kind: location.kind, seatId: location.seatId, pinX: location.pinX, pinY: location.pinY, waypointId: location.waypointId },
    }).then((q) => { if (!cancelled) setQuoteResult(q); }).catch(() => { if (!cancelled) setQuoteResult(null); });
    return () => { cancelled = true; };
  }, [canQuote, cartEntries, merchantId, flightId, location]);

  // Derived, not stored: an empty basket has no quote by definition.
  const quote = canQuote ? quoteResult : null;

  if (!cat || !ready) {
    return <div className="grid min-h-screen place-items-center bg-ground"><span className="eyebrow">loading…</span></div>;
  }

  const flight = cat.flights.find((f) => f.id === flightId) ?? null;
  const merchant = cat.merchants.find((m) => m.id === merchantId) ?? null;
  // Derived so clearing the local list never needs a state write inside an effect.
  const myOrders = fetched.filter((o) => orderIds.includes(o.id));
  const liveOrders = myOrders.filter((o) => LIVE.includes(o.state));
  const activeOrder = myOrders.find((o) => o.id === activeOrderId) ?? null;
  const missing = orderIds.length - myOrders.length;
  const cartCount = cartEntries.reduce((n, [, v]) => n + v.qty, 0);

  // A boarding pass gate pre-fills the delivery point when nothing better is known.
  const effectiveLocation: LocationChoice | null = location ?? (flight
    ? (() => {
        const wp = cat.waypoints.find((w) => w.kind === "gate" && w.gate === flight.gate);
        return wp ? { kind: "waypoint" as const, waypointId: wp.id, label: wp.name, detail: wp.landmark } : null;
      })()
    : null);

  const place = async () => {
    if (!merchantId || !flightId || !effectiveLocation) return;
    setPlacing(true); setError(null);
    try {
      const res = await api<{ order: OrderRow }>("/api/v1/orders", {
        merchantId, flightId,
        lines: cartEntries.map(([productId, v]) => ({ productId, qty: v.qty, optionIds: v.optionIds })),
        location: {
          kind: effectiveLocation.kind, seatId: effectiveLocation.seatId,
          pinX: effectiveLocation.pinX, pinY: effectiveLocation.pinY, waypointId: effectiveLocation.waypointId,
        },
      });
      setOrderIds((ids) => [res.order.id, ...ids]);
      setActiveOrderId(res.order.id);
      setCart({}); setMerchantId(null); setStep("tracking");
      void loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setPlacing(false); }
  };

  const showNav = step !== "flight";

  return (
    <main className="mx-auto min-h-screen max-w-md bg-ground" style={{ paddingBottom: showNav ? 132 : 24 }}>
      <Header
        flight={flight} location={effectiveLocation} now={now}
        locked={liveOrders.length > 0}
        onChangeFlight={() => liveOrders.length === 0 && setConfirm({
          title: "Change flight?",
          body: "This clears your basket. Orders you have already placed are kept.",
          label: "Change flight",
          run: () => { setStep("flight"); setCart({}); setMerchantId(null); setConfirm(null); },
        })}
        onChangeLocation={() => setPicking(true)}
      />

      {step === "flight" && (
        <FlightPicker flights={cat.flights} now={now}
          onPick={(f) => { setFlightId(f.id); setStep("shops"); }} />
      )}

      {step === "shops" && flight && (
        <ShopList merchants={cat.merchants.filter((m) => m.zone === "airside-schengen")}
          products={cat.products} onPick={(m) => { setMerchantId(m.id); setStep("menu"); }} />
      )}

      {step === "menu" && merchant && (
        <MenuView cat={cat} merchant={merchant} cart={cart} setCart={setCart}
          onBack={() => setStep("shops")} />
      )}

      {step === "cart" && merchant && (
        <CartView cat={cat} merchant={merchant} cart={cart} setCart={setCart} quote={quote}
          location={effectiveLocation} error={error} placing={placing}
          onChangeLocation={() => setPicking(true)}
          onBack={() => setStep("menu")} onPlace={place} />
      )}

      {step === "orders" && (
        <OrdersList orders={myOrders} missing={missing} now={now}
          onOpen={(o) => { setActiveOrderId(o.id); setStep("tracking"); }}
          onForget={() => setOrderIds(myOrders.map((o) => o.id))}
          onShop={() => setStep("shops")} />
      )}

      {step === "tracking" && activeOrder && (
        <Tracking order={activeOrder} cat={cat} now={now}
          onBack={() => setStep("orders")} onShopAgain={() => { setMerchantId(null); setStep("shops"); }} />
      )}

      {step === "tracking" && !activeOrder && (
        <section className="px-5 py-10 text-center">
          <div className="text-4xl">🔍</div>
          <h1 className="mt-3 text-xl font-bold">That order isn&rsquo;t on this system</h1>
          <button onClick={() => setStep("orders")}
            className="mt-5 w-full rounded-lg py-3.5 font-semibold text-white"
            style={{ background: "var(--color-accent)" }}>Back to my orders</button>
        </section>
      )}

      {picking && (
        <LocationPicker cat={cat} current={effectiveLocation}
          onClose={() => setPicking(false)}
          onPick={(l) => { setLocation(l); setPicking(false); }} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-5">
            <h2 className="text-lg font-bold">{confirm.title}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{confirm.body}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-line py-3 font-semibold">Keep as is</button>
              <button onClick={confirm.run} className="rounded-lg py-3 font-semibold text-white"
                style={{ background: "var(--color-alert)" }}>{confirm.label}</button>
            </div>
          </div>
        </div>
      )}

      {cartCount > 0 && !["tracking", "orders"].includes(step) && (
        <button onClick={() => setStep("cart")}
          className="fixed inset-x-0 mx-auto flex max-w-md items-center justify-between px-5 py-3.5 text-white shadow-lg"
          style={{ bottom: showNav ? 64 : 0, background: "var(--color-accent)" }}>
          <span className="font-semibold">{cartCount} item{cartCount > 1 ? "s" : ""}</span>
          <span className="mono">{euros(quote?.goodsCents ?? 0)} · Review →</span>
        </button>
      )}

      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-line bg-surface">
          <Tab label="Order" icon="🛍️" active={["shops","menu","cart"].includes(step)} onClick={() => setStep("shops")} />
          <Tab label="My orders" icon="📦" active={["orders","tracking"].includes(step)}
            onClick={() => setStep("orders")}
            badge={liveOrders.length || myOrders.length || undefined} live={liveOrders.length > 0} />
        </nav>
      )}
    </main>
  );
}

function Tab({ label, icon, active, onClick, badge, live }: {
  label: string; icon: string; active: boolean; onClick: () => void; badge?: number; live?: boolean;
}) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5"
      style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}>
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      {badge !== undefined && (
        <span className="mono absolute right-[26%] top-1.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
          style={{ background: live ? "var(--color-accent)" : "var(--color-muted)" }}>{badge}</span>
      )}
      {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full" style={{ background: "var(--color-accent)" }} />}
    </button>
  );
}

/* -------------------------------- header -------------------------------- */

function Header({ flight, location, now, locked, onChangeFlight, onChangeLocation }: {
  flight: Flight | null; location: LocationChoice | null; now: number; locked: boolean;
  onChangeFlight: () => void; onChangeLocation: () => void;
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
          ) : <div className="mt-0.5 text-sm text-muted">Choose your flight</div>}
        </div>
        <div className="text-right">
          {flight && (
            <>
              <div className="mono text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
                Boards {inMinutes(flight.boardingAt, now)}
              </div>
              {locked
                ? <span className="eyebrow">🔒 order in progress</span>
                : <button onClick={onChangeFlight} className="eyebrow underline">change flight</button>}
            </>
          )}
        </div>
      </div>
      {location && (
        <button onClick={onChangeLocation}
          className="flex w-full items-center justify-between border-t border-line bg-accent-soft px-5 py-1.5 text-left">
          <span className="mono text-xs" style={{ color: "var(--color-accent)" }}>
            📍 {location.label}
          </span>
          <span className="mono text-[10px] underline" style={{ color: "var(--color-accent)" }}>change</span>
        </button>
      )}
    </header>
  );
}

/* --------------------------- location picker ---------------------------- */

function LocationPicker({ cat, current, onClose, onPick }: {
  cat: Catalogue; current: LocationChoice | null;
  onClose: () => void; onPick: (l: LocationChoice) => void;
}) {
  const [mode, setMode] = useState<"pin" | "gate" | "code">(current?.kind === "pin" ? "pin" : "gate");
  const [pin, setPin] = useState<{ x: number; y: number } | null>(
    current?.pinX != null ? { x: current.pinX, y: current.pinY! } : null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gates = cat.waypoints.filter((w) => w.kind === "gate" && w.zone === "airside-schengen");

  const submitCode = async () => {
    setBusy(true); setCodeError(null);
    try {
      const r = await (await fetch(`/api/v1/seat/${encodeURIComponent(code.trim())}`)).json();
      if (r.error) throw new Error(r.error);
      const s = r.seat as Seat;
      onPick({
        kind: "seat", seatId: s.id,
        label: `Seat ${s.seatLabel}${s.gate ? ` · gate ${s.gate}` : ""}`,
        detail: `${s.walkMetres.toFixed(1)} m from where the unit stops`,
      });
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : "That code is not recognised");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ground">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div>
          <div className="eyebrow">Where should we bring it?</div>
          <div className="text-sm font-semibold">Set your delivery point</div>
        </div>
        <button onClick={onClose} className="mono rounded-lg border border-line px-4 py-2 text-sm">close</button>
      </div>

      <div className="flex gap-1 border-b border-line bg-surface px-3">
        {([["pin","Drop a pin"],["gate","Pick a gate"],["code","Seat code"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)}
            className="mono border-b-2 px-3 py-2 text-xs"
            style={{ borderColor: mode === k ? "var(--color-ink)" : "transparent",
                     color: mode === k ? "var(--color-ink)" : "var(--color-muted)" }}>{label}</button>
        ))}
      </div>

      <div className="no-bar flex-1 overflow-y-auto">
        {mode === "pin" && (
          <div className="p-4">
            <p className="text-sm text-ink-2">
              Tap the map where you are sitting. We bring it to the nearest point the unit can
              reach and tell you how far that is.
            </p>
            <div className="mt-3 rounded-lg border border-line bg-surface p-3">
              <TerminalMap waypoints={cat.waypoints} edges={cat.edges} zones={["airside-schengen"]}
                pin={pin} onPinDrop={(x, y) => setPin({ x, y })} showLabels />
            </div>
            {pin && (
              <button onClick={() => onPick({
                  kind: "pin", pinX: pin.x, pinY: pin.y,
                  label: "Pin on the map", detail: "We will confirm the exact walk at checkout",
                })}
                className="mt-4 w-full rounded-lg py-3.5 font-semibold text-white"
                style={{ background: "var(--color-accent)" }}>
                Deliver here
              </button>
            )}
          </div>
        )}

        {mode === "gate" && (
          <div className="space-y-2 p-4">
            {gates.map((w) => (
              <button key={w.id}
                onClick={() => onPick({ kind: "waypoint", waypointId: w.id, label: w.name, detail: w.landmark })}
                className="w-full rounded-lg border bg-surface p-3 text-left"
                style={{ borderColor: current?.waypointId === w.id ? "var(--color-accent)" : "var(--color-line)",
                         borderWidth: current?.waypointId === w.id ? 2 : 1 }}>
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-muted">{w.landmark}</div>
              </button>
            ))}
          </div>
        )}

        {mode === "code" && (
          <div className="p-4">
            <p className="text-sm text-ink-2">
              Every seat has a printed code. Scanning its QR opens this app with the seat already
              set — or type the code here.
            </p>
            <input value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="Seat code from the sticker"
              className="mono mt-3 w-full rounded border border-line bg-surface px-3 py-3" />
            {codeError && <p className="mt-2 text-sm" style={{ color: "var(--color-alert)" }}>{codeError}</p>}
            <button onClick={submitCode} disabled={busy || !code.trim()}
              className="mt-3 w-full rounded-lg py-3.5 font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-accent)" }}>
              {busy ? "Checking…" : "Use this seat"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- flight picker ---------------------------- */

function FlightPicker({ flights, now, onPick }: { flights: Flight[]; now: number; onPick: (f: Flight) => void }) {
  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Which flight are you on?</h1>
      <p className="mt-2 text-sm text-ink-2">
        We use it to be sure we can reach you before boarding. Nothing to install.
      </p>
      <div className="mt-5 space-y-2">
        {flights.map((f) => {
          const mins = Math.round((f.boardingAt - now) / 60000);
          return (
            <button key={f.id} onClick={() => onPick(f)}
              className="flex w-full items-center justify-between rounded-lg border border-line bg-surface p-4 text-left transition hover:border-ink">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="mono font-semibold">{f.number}</span>
                  <span className="text-sm text-ink-2">{f.destination}</span>
                </div>
                <div className="eyebrow mt-1">{f.carrier} · Gate {f.gate}{f.nonEu && " · non-EU"}</div>
              </div>
              <div className="text-right">
                <div className="mono text-sm font-semibold"
                  style={{ color: mins < 20 ? "var(--color-alert)" : "var(--color-accent)" }}>
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

function ShopList({ merchants, products, onPick }: {
  merchants: Merchant[]; products: Product[]; onPick: (m: Merchant) => void;
}) {
  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Order to your seat</h1>
      <div className="mt-5 space-y-3">
        {merchants.map((m) => {
          const count = products.filter((p) => p.merchantId === m.id && p.available).length;
          return (
            <button key={m.id} onClick={() => onPick(m)} disabled={!m.open}
              className="w-full rounded-lg border border-line bg-surface p-4 text-left transition hover:border-ink disabled:opacity-50"
              style={{ borderLeftWidth: 4, borderLeftColor: m.colour }}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{m.name}</h2>
                <span className="mono text-xs text-muted">{m.open ? `~${m.prepMinutes} min` : "closed"}</span>
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

function MenuView({ cat, merchant, cart, setCart, onBack }: {
  cat: Catalogue; merchant: Merchant; cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>; onBack: () => void;
}) {
  const [configuring, setConfiguring] = useState<Product | null>(null);
  const products = cat.products.filter((p) => p.merchantId === merchant.id);
  const cats = cat.categories.filter((c) => c.merchant_id === merchant.id);

  const groupsFor = (p: Product) => cat.optionGroups.filter((g) => g.product_id === p.id);

  const add = (p: Product) => {
    if (groupsFor(p).length > 0) { setConfiguring(p); return; }
    setCart((c) => ({ ...c, [p.id]: { qty: (c[p.id]?.qty ?? 0) + 1, optionIds: c[p.id]?.optionIds ?? [] } }));
  };
  const remove = (p: Product) => setCart((c) => {
    const n = (c[p.id]?.qty ?? 0) - 1;
    const next = { ...c };
    if (n <= 0) delete next[p.id]; else next[p.id] = { ...next[p.id], qty: n };
    return next;
  });

  const sections = [
    ...cats.map((c) => ({ name: c.name, items: products.filter((p) => p.categoryId === c.id) })),
    { name: "More", items: products.filter((p) => !p.categoryId) },
  ].filter((s) => s.items.length > 0);

  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← all shops</button>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{merchant.name}</h1>
      <p className="mt-1 text-sm text-ink-2">{merchant.blurb}</p>

      {sections.map((s) => (
        <div key={s.name} className="mt-5">
          <div className="eyebrow mb-2">{s.name}</div>
          <div className="space-y-2">
            {s.items.map((p) => {
              const qty = cart[p.id]?.qty ?? 0;
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
                    {p.allergens && p.allergens.length > 0 && (
                      <p className="mono text-[10px] text-muted">contains {p.allergens.join(", ")}</p>
                    )}
                    {p.ageRestricted && (
                      <div className="mono mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]"
                        style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}>
                        COLLECT IN STORE — AGE CHECK REQUIRED
                      </div>
                    )}
                  </div>
                  {!p.ageRestricted && p.available && (
                    <div className="flex shrink-0 items-center gap-2">
                      {qty > 0 && (
                        <>
                          <button onClick={() => remove(p)} aria-label={`Remove one ${p.name}`}
                            className="h-9 w-9 rounded-full border border-line text-lg leading-none">−</button>
                          <span className="mono w-4 text-center text-sm">{qty}</span>
                        </>
                      )}
                      <button onClick={() => add(p)} aria-label={`Add ${p.name}`}
                        className="h-9 w-9 rounded-full text-lg leading-none text-white"
                        style={{ background: "var(--color-accent)" }}>+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {configuring && (
        <OptionSheet cat={cat} product={configuring} onClose={() => setConfiguring(null)}
          onConfirm={(optionIds) => {
            setCart((c) => ({ ...c, [configuring.id]: { qty: (c[configuring.id]?.qty ?? 0) + 1, optionIds } }));
            setConfiguring(null);
          }} />
      )}
    </section>
  );
}

function OptionSheet({ cat, product, onClose, onConfirm }: {
  cat: Catalogue; product: Product; onClose: () => void; onConfirm: (optionIds: string[]) => void;
}) {
  const groups = cat.optionGroups.filter((g) => g.product_id === product.id);
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const first = cat.options.find((o) => o.group_id === g.id && o.available);
      init[g.id] = g.min_select > 0 && first ? [first.id] : [];
    }
    return init;
  });

  const toggle = (groupId: string, optionId: string, max: number) => {
    setChosen((c) => {
      const cur = c[groupId] ?? [];
      if (cur.includes(optionId)) return { ...c, [groupId]: cur.filter((x) => x !== optionId) };
      if (max === 1) return { ...c, [groupId]: [optionId] };
      if (cur.length >= max) return c;
      return { ...c, [groupId]: [...cur, optionId] };
    });
  };

  const all = Object.values(chosen).flat();
  const delta = all.reduce((s, id) => s + (cat.options.find((o) => o.id === id)?.price_delta_cents ?? 0), 0);
  const incomplete = groups.some((g) => (chosen[g.id] ?? []).length < g.min_select);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40">
      <div className="w-full max-w-md rounded-t-xl bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{product.name}</h2>
          <button onClick={onClose} className="mono text-sm underline">cancel</button>
        </div>
        {groups.map((g) => (
          <div key={g.id} className="mt-4">
            <div className="eyebrow">{g.name}{g.min_select > 0 && " · required"}</div>
            <div className="mt-2 space-y-1.5">
              {cat.options.filter((o) => o.group_id === g.id && o.available).map((o) => {
                const on = (chosen[g.id] ?? []).includes(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g.id, o.id, g.max_select)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left"
                    style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line)", borderWidth: on ? 2 : 1 }}>
                    <span>{o.name}</span>
                    <span className="mono text-sm text-muted">
                      {o.price_delta_cents ? `+${euros(o.price_delta_cents)}` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={() => onConfirm(all)} disabled={incomplete}
          className="mt-5 w-full rounded-lg py-3.5 font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--color-accent)" }}>
          Add · {euros(product.priceCents + delta)}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- cart --------------------------------- */

function CartView({ cat, merchant, cart, setCart, quote, location, error, placing, onChangeLocation, onBack, onPlace }: {
  cat: Catalogue; merchant: Merchant; cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  quote: Quote | null; location: LocationChoice | null; error: string | null; placing: boolean;
  onChangeLocation: () => void; onBack: () => void; onPlace: () => void;
}) {
  const refused = quote?.verdict === "REFUSE";
  const warned = quote?.verdict === "WARN";
  const lines = Object.entries(cart)
    .map(([id, v]) => ({ product: cat.products.find((p) => p.id === id)!, ...v }))
    .filter((l) => l.product);

  const bump = (id: string, d: number) => setCart((c) => {
    const n = (c[id]?.qty ?? 0) + d;
    const next = { ...c };
    if (n <= 0) delete next[id]; else next[id] = { ...next[id], qty: n };
    return next;
  });

  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← keep browsing</button>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Your order</h1>

      <div className="mt-4 space-y-2">
        {lines.map((l) => (
          <div key={l.product.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <div className="grid h-10 w-10 place-items-center rounded bg-surface-2">{l.product.emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{l.product.name}</div>
              {l.optionIds.length > 0 && (
                <div className="mono text-[11px] text-muted">
                  {l.optionIds.map((id) => cat.options.find((o) => o.id === id)?.name).filter(Boolean).join(", ")}
                </div>
              )}
            </div>
            <button onClick={() => bump(l.product.id, -1)} className="h-8 w-8 rounded-full border border-line">−</button>
            <span className="mono w-4 text-center">{l.qty}</span>
            <button onClick={() => bump(l.product.id, 1)} className="h-8 w-8 rounded-full border border-line">+</button>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="eyebrow">Delivering to</div>
        <div className="mt-1 font-semibold">{location?.label ?? "Not set"}</div>
        {quote && (
          <p className="mt-1 text-sm text-ink-2">
            The unit stops at <strong>{quote.location.navWaypointId}</strong> — about{" "}
            <strong>{quote.location.walkMetres.toFixed(1)} m</strong> from you.
          </p>
        )}
        <button onClick={onChangeLocation} className="mono mt-2 text-xs underline" style={{ color: "var(--color-accent)" }}>
          change delivery point
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <Row label={`${merchant.name} items`} value={euros(quote?.goodsCents ?? 0)} />
        <Row label="Delivery" value={euros(quote?.deliveryFeeCents ?? 0)} />
        <div className="mt-2 border-t border-line pt-2">
          <Row label="Total" value={euros(quote?.totalCents ?? 0)} bold />
        </div>
      </div>

      {quote && quote.blockedItems.length > 0 && (
        <Notice tone="signal" title="Not deliverable by robot">
          {quote.blockedItems.join(", ")} needs an age check, so it stays collect-in-store.
        </Notice>
      )}
      {quote && !refused && (
        <Notice tone={warned ? "signal" : "accent"} title={warned ? "This is tight" : "We can make it"}>
          {quote.reason}
        </Notice>
      )}
      {refused && <Notice tone="alert" title="Too tight against boarding">{quote.reason}</Notice>}
      {error && <Notice tone="alert" title="Couldn't place the order">{error}</Notice>}

      <button onClick={onPlace} disabled={placing || refused || lines.length === 0 || !location}
        className="mt-5 w-full rounded-lg py-4 font-semibold text-white disabled:opacity-40"
        style={{ background: refused ? "var(--color-muted)" : "var(--color-accent)" }}>
        {placing ? "Placing…" : refused ? "Not available for this flight" : `Pay ${euros(quote?.totalCents ?? 0)}`}
      </button>
      <p className="eyebrow mt-2 text-center">payment simulated · nothing is charged</p>
    </section>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-baseline justify-between py-0.5">
    <span className={bold ? "font-semibold" : "text-sm text-ink-2"}>{label}</span>
    <span className={`mono ${bold ? "font-semibold" : "text-sm"}`}>{value}</span>
  </div>
);

function Notice({ tone, title, children }: {
  tone: "accent" | "signal" | "alert"; title: string; children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg p-4"
      style={{ background: `var(--color-${tone}-soft)`, borderLeft: `3px solid var(--color-${tone})` }}>
      <div className="mono text-xs font-semibold uppercase tracking-wider" style={{ color: `var(--color-${tone})` }}>{title}</div>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </div>
  );
}

/* ------------------------------ orders list ----------------------------- */

function OrdersList({ orders, missing, now, onOpen, onForget, onShop }: {
  orders: OrderRow[]; missing: number; now: number;
  onOpen: (o: OrderRow) => void; onForget: () => void; onShop: () => void;
}) {
  const live = orders.filter((o) => LIVE.includes(o.state));
  const past = orders.filter((o) => !LIVE.includes(o.state));
  return (
    <section className="px-5 py-6">
      <h1 className="text-2xl font-bold tracking-tight">My orders</h1>
      <p className="mt-1 text-sm text-ink-2">Nothing here is lost by navigating away.</p>

      {orders.length === 0 && missing === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <div className="text-4xl">📦</div>
          <p className="mt-3 text-ink-2">No orders yet.</p>
          <button onClick={onShop} className="mt-4 rounded-lg px-5 py-3 font-semibold text-white"
            style={{ background: "var(--color-accent)" }}>Browse the shops</button>
        </div>
      )}

      {live.length > 0 && <><div className="eyebrow mt-6">In progress</div>
        <div className="mt-2 space-y-2">{live.map((o) => <OrderRowCard key={o.id} order={o} now={now} onOpen={onOpen} />)}</div></>}
      {past.length > 0 && <><div className="eyebrow mt-6">Completed</div>
        <div className="mt-2 space-y-2">{past.map((o) => <OrderRowCard key={o.id} order={o} now={now} onOpen={onOpen} />)}</div></>}

      {missing > 0 && (
        <div className="mt-6 rounded-lg p-4"
          style={{ background: "var(--color-signal-soft)", borderLeft: "3px solid var(--color-signal)" }}>
          <div className="mono text-xs font-semibold uppercase" style={{ color: "var(--color-signal)" }}>
            {missing} order{missing > 1 ? "s" : ""} no longer on the system
          </div>
          <button onClick={onForget} className="mono mt-2 text-xs underline">clear them from this list</button>
        </div>
      )}
    </section>
  );
}

function OrderRowCard({ order, now, onOpen }: { order: OrderRow; now: number; onOpen: (o: OrderRow) => void }) {
  const copy = STATE_COPY[order.state];
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";
  return (
    <button onClick={() => onOpen(order)} className="w-full rounded-lg border bg-surface p-4 text-left"
      style={{ borderColor: arrived ? "var(--color-accent)" : "var(--color-line)", borderWidth: arrived ? 2 : 1 }}>
      <div className="flex items-baseline justify-between">
        <span className="mono text-xs text-muted">{order.ref}</span>
        <span className="mono text-xs text-muted">{order.merchant_name}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ color: arrived ? "var(--color-accent)" : undefined }}>{copy.label}</span>
        <span className="mono text-sm">{euros(order.total_cents)}</span>
      </div>
      <div className="mt-1 truncate text-xs text-ink-2">
        {order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
      </div>
      {LIVE.includes(order.state) && (
        <div className="mt-2 flex items-center justify-between">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(progressOf(order.state) * 100)}%`, background: "var(--color-accent)" }} />
          </div>
          {arrived && <span className="mono ml-3 text-xs" style={{ color: "var(--color-accent)" }}>code {order.handover_code}</span>}
        </div>
      )}
      <span className="sr-only">{now}</span>
    </button>
  );
}

/* -------------------------------- tracking ------------------------------ */

function Tracking({ order, cat, now, onBack, onShopAgain }: {
  order: OrderRow; cat: Catalogue; now: number; onBack: () => void; onShopAgain: () => void;
}) {
  const copy = STATE_COPY[order.state];
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";
  const done = ["COMPLETED", "REJECTED", "CANCELLED", "ABORTED"].includes(order.state);

  return (
    <section className="px-5 py-6">
      <button onClick={onBack} className="eyebrow">← my orders</button>
      <div className="eyebrow mt-2">{order.ref}</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{copy.label}</h1>
      <p className="mt-1 text-ink-2">{copy.detail}</p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.round(progressOf(order.state) * 100)}%`,
                   background: done && order.state !== "COMPLETED" ? "var(--color-alert)" : "var(--color-accent)" }} />
      </div>

      {arrived && (
        <div className="mt-5 rounded-lg p-5 text-center" style={{ background: "var(--color-accent)" }}>
          <div className="mono text-xs uppercase tracking-widest text-white/80">Enter this on the screen</div>
          <div className="mono mt-1 text-5xl font-bold tracking-[0.2em] text-white">{order.handover_code}</div>
          <div className="mt-2 text-sm text-white/90">{order.nav_waypoint_landmark}</div>
        </div>
      )}

      {order.sla_missed && (
        <Notice tone="alert" title="We were late">Your delivery fee has been refunded automatically.</Notice>
      )}

      <div className="mt-5 rounded-lg border border-line bg-surface p-4">
        <div className="eyebrow">Delivery point</div>
        <div className="mt-1 font-semibold">{order.nav_waypoint_name}</div>
        <p className="mt-1 text-sm text-ink-2">
          {order.location_note} · {Number(order.walk_metres).toFixed(1)} m from where the unit stops
        </p>
        <div className="mt-3">
          <TerminalMap waypoints={cat.waypoints} edges={cat.edges} zones={["airside-schengen"]}
            highlightWaypointId={order.lines.length ? undefined : undefined} showLabels />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="eyebrow">Order</div>
        <div className="mt-2 space-y-1">
          {order.lines.map((l, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{l.emoji} {l.qty} × {l.name}</span>
              <span className="mono">{euros(l.unit_price_cents * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1 text-sm">
            <span className="text-muted">Delivery</span>
            <span className="mono text-muted">{euros(order.delivery_fee_cents)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span><span className="mono">{euros(order.total_cents)}</span>
          </div>
        </div>
        <div className="eyebrow mt-3">from {order.merchant_name}</div>
      </div>

      {done && (
        <button onClick={onShopAgain} className="mt-5 w-full rounded-lg py-4 font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>Order something else</button>
      )}
      <p className="mono mt-4 text-center text-[10px] text-muted">{new Date(now).toLocaleTimeString("en-GB")}</p>
    </section>
  );
}
