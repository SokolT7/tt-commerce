"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, supabase, useNow } from "@/lib/hooks";
import { euros, inMinutes } from "@/lib/format";
import { STATE_COPY, progressOf } from "@/domain/orders/machine";
import { TerminalMap } from "@/components/TerminalMap";
import { THEMES, themeFor, tint } from "@/lib/categories";
import {
  Button, Card, Monogram, Pill, Notice, Sheet, SkeletonList, Stagger, EmptyState,
  CATEGORY_ICONS, IconArrowRight,
  IconBag, IconOrders, IconPin, IconSeat, IconClock, IconCheck, IconArrowLeft,
  IconPlus, IconMinus, IconStore, IconLock, IconAlert, IconRobot,
} from "@/components/ui";
import type {
  DeliveryLocationKind, Flight, Merchant, OrderState, Product, RouteEdge, Seat, Waypoint,
} from "@/domain/types";

type Step = "home" | "category" | "shop" | "cart" | "orders" | "tracking";
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
  rejection_reason: string | null; refunded_cents: number | null;
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

  const [step, setStep] = useState<Step>("home");
  const [themeId, setThemeId] = useState<string | null>(null);
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

      let restored: { orderIds?: string[]; activeOrderId?: string; step?: Step; location?: LocationChoice } = {};
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
      if (restored.orderIds?.length) {
        setOrderIds(restored.orderIds);
        setActiveOrderId(restored.activeOrderId ?? null);
        setStep(restored.step === "tracking" && restored.activeOrderId ? "tracking" : "orders");
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [seatToken]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ orderIds, activeOrderId, step, location }));
  }, [ready, orderIds, activeOrderId, step, location]);

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

  // A basket cannot span two kitchens, so the shop is whichever one the first
  // item came from. Derived rather than stored, so it can never disagree with
  // the basket's contents — browsing by category means a product can be added
  // without ever visiting a shop page.
  const cartMerchantId = useMemo(() => {
    if (!cat || cartEntries.length === 0) return null;
    return cat.products.find((p) => p.id === cartEntries[0][0])?.merchantId ?? null;
  }, [cat, cartEntries]);
  const canQuote = Boolean(cartMerchantId && location && cartEntries.length > 0);
  useEffect(() => {
    if (!canQuote || !location || !cartMerchantId) return;
    let cancelled = false;
    api<Quote>("/api/v1/quote", {
      merchantId: cartMerchantId,
      lines: cartEntries.map(([productId, v]) => ({ productId, qty: v.qty, optionIds: v.optionIds })),
      location: { kind: location.kind, seatId: location.seatId, pinX: location.pinX, pinY: location.pinY, waypointId: location.waypointId },
    }).then((q) => { if (!cancelled) setQuoteResult(q); }).catch(() => { if (!cancelled) setQuoteResult(null); });
    return () => { cancelled = true; };
  }, [canQuote, cartEntries, cartMerchantId, location]);

  // Derived, not stored: an empty basket has no quote by definition.
  const quote = canQuote ? quoteResult : null;

  if (!cat || !ready) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pt-6">
        <div className="skeleton h-[52px] rounded-[var(--radius-lg)]" />
        <div className="skeleton mt-6 h-8 w-2/3 rounded-lg" />
        <div className="mt-5"><SkeletonList rows={5} /></div>
      </main>
    );
  }

  const merchant = cat.merchants.find((m) => m.id === merchantId) ?? null;
  // Derived so clearing the local list never needs a state write inside an effect.
  const myOrders = fetched.filter((o) => orderIds.includes(o.id));
  const liveOrders = myOrders.filter((o) => LIVE.includes(o.state));
  const activeOrder = myOrders.find((o) => o.id === activeOrderId) ?? null;
  const missing = orderIds.length - myOrders.length;
  const cartCount = cartEntries.reduce((n, [, v]) => n + v.qty, 0);
  // Same reason as in the basket: show real arithmetic before the server quote.
  const basketGoods = cartEntries.reduce((sum, [id, v]) => {
    const p = cat.products.find((x) => x.id === id);
    if (!p) return sum;
    const delta = v.optionIds.reduce(
      (d, oid) => d + (cat.options.find((o) => o.id === oid)?.price_delta_cents ?? 0), 0);
    return sum + (p.priceCents + delta) * v.qty;
  }, 0);
  const cartMerchant = cat.merchants.find((m) => m.id === cartMerchantId) ?? null;


  // Flight-derived gates are on hold until live flight data is connected, so
  // the delivery point comes only from the seat QR or the passenger's choice.
  const effectiveLocation: LocationChoice | null = location;

  const place = async () => {
    if (!cartMerchantId || !effectiveLocation) return;
    setPlacing(true); setError(null);
    try {
      const res = await api<{ order: OrderRow }>("/api/v1/orders", {
        merchantId: cartMerchantId,
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

  const showNav = true;

  return (
    <main className="mx-auto min-h-screen max-w-md" style={{ paddingBottom: 128 }}>
      <Header
        location={effectiveLocation}
        onChangeLocation={() => setPicking(true)}
      />

      {step === "home" && (
        <HomeView
          cat={cat}
          onTheme={(id) => { setThemeId(id); setStep("category"); }}
          onShop={(m) => { setMerchantId(m.id); setStep("shop"); }}
          onProduct={(p) => { setMerchantId(p.merchantId); setStep("shop"); }}
        />
      )}

      {step === "category" && themeId && (
        <CategoryView
          cat={cat} themeId={themeId} cart={cart} setCart={setCart}
          onBack={() => setStep("home")}
          onShop={(m) => { setMerchantId(m.id); setStep("shop"); }}
        />
      )}

      {step === "shop" && merchant && (
        <MenuView cat={cat} merchant={merchant} cart={cart} setCart={setCart}
          onBack={() => setStep("home")} />
      )}

      {step === "cart" && cartMerchant && (
        <CartView cat={cat} merchant={cartMerchant} cart={cart} setCart={setCart} quote={quote}
          location={effectiveLocation} error={error} placing={placing}
          onChangeLocation={() => setPicking(true)}
          onBack={() => setStep(merchant ? "shop" : "home")} onPlace={place} />
      )}

      {step === "cart" && !cartMerchant && (
        <EmptyState icon={<IconBag size={26} />} title="Your basket is empty"
          body="Add something from any of the terminal's shops and it appears here."
          action={<Button onClick={() => setStep("home")}>Browse shops</Button>} />
      )}

      {step === "orders" && (
        <OrdersList orders={myOrders} missing={missing} now={now}
          onOpen={(o) => { setActiveOrderId(o.id); setStep("tracking"); }}
          onForget={() => setOrderIds(myOrders.map((o) => o.id))}
          onShop={() => setStep("home")} />
      )}

      {step === "tracking" && activeOrder && (
        <Tracking order={activeOrder} cat={cat}
          onBack={() => setStep("orders")} onShopAgain={() => { setMerchantId(null); setStep("home"); }} />
      )}

      {step === "tracking" && !activeOrder && (
        <EmptyState
          icon={<IconAlert size={26} />}
          title="That order isn't on this system"
          body="It may have been cleared from the server. Your other orders are unaffected."
          action={<Button onClick={() => setStep("orders")}>Back to my orders</Button>}
        />
      )}

      {picking && (
        <LocationPicker cat={cat} current={effectiveLocation}
          onClose={() => setPicking(false)}
          onPick={(l) => { setLocation(l); setPicking(false); }} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
          <button aria-label="Cancel" onClick={() => setConfirm(null)}
            className="fade-in absolute inset-0 bg-[rgba(16,20,19,0.42)] backdrop-blur-[2px]" />
          <div className="sheet-up relative w-full max-w-md rounded-[var(--radius-2xl)] bg-white p-6 shadow-[var(--shadow-lg)]">
            <h2 className="headline text-[19px] font-semibold">{confirm.title}</h2>
            <p className="prose-balance mt-2 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">{confirm.body}</p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Keep as is</Button>
              <Button variant="danger" onClick={confirm.run}>{confirm.label}</Button>
            </div>
          </div>
        </div>
      )}

      {cartCount > 0 && !["tracking", "orders"].includes(step) && (
        <div className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-md px-4" style={{ bottom: 78 }}>
          <button onClick={() => setStep("cart")}
            className="pressable pop pointer-events-auto flex w-full items-center justify-between rounded-[16px] bg-[var(--color-accent)] px-5 py-4 text-white shadow-[var(--shadow-accent)]">
            <span className="flex items-center gap-2.5">
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white/20 px-1.5 text-[12px] font-semibold tnum">
                {cartCount}
              </span>
              <span className="text-[15px] font-semibold">View basket</span>
            </span>
            <span className="text-[15px] font-semibold tnum">{euros(quote?.goodsCents ?? basketGoods)}</span>
          </button>
        </div>
      )}

      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-[var(--color-line)] bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <Tab label="Order" icon={<IconBag size={21} />}
            active={["home","category","shop","cart"].includes(step)}
            onClick={() => setStep("home")} />
          <Tab label="Orders" icon={<IconOrders size={21} />} active={["orders","tracking"].includes(step)}
            onClick={() => setStep("orders")}
            badge={liveOrders.length || myOrders.length || undefined} live={liveOrders.length > 0} />
        </nav>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- nav ---- */

function Tab({ label, icon, active, onClick, badge, live }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
  badge?: number; live?: boolean;
}) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      className="pressable-sm relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-3"
      style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}>
      <span className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold text-white tnum"
                style={{ background: live ? "var(--color-accent)" : "var(--color-muted)" }}>
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
      {active && <span className="absolute inset-x-7 top-0 h-[2px] rounded-full bg-[var(--color-accent)]" />}
    </button>
  );
}

/* -------------------------------------------------------------- header --- */

function Header({ location, onChangeLocation }: {
  location: LocationChoice | null; onChangeLocation: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur-xl">
      <button onClick={onChangeLocation}
        className="pressable-sm flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
          style={{ background: location ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                   color: location ? "var(--color-accent)" : "var(--color-muted)" }}>
          {location?.kind === "seat" ? <IconSeat size={18} /> : <IconPin size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="label block">Delivering to</span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold">
            {location ? location.label : "Set where you're sitting"}
          </span>
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-[var(--color-accent)]">
          {location ? "Change" : "Set"}
        </span>
      </button>
    </header>
  );
}

/* ---------------------------------------------------------------- home --- */

function HomeView({ cat, onTheme, onShop, onProduct }: {
  cat: Catalogue;
  onTheme: (id: string) => void;
  onShop: (m: Merchant) => void;
  onProduct: (p: Product) => void;
}) {
  const open = cat.merchants.filter((m) => m.zone === "airside-schengen");
  const openIds = new Set(open.map((m) => m.id));
  const available = cat.products.filter((p) => p.available && openIds.has(p.merchantId));

  const categoryName = (p: Product) =>
    cat.categories.find((c) => c.id === p.categoryId)?.name ?? null;

  // Only show themes that actually have something behind them today.
  const counts = new Map<string, number>();
  for (const p of available) {
    const t = themeFor(categoryName(p), p.name);
    counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
  }
  const themes = THEMES.filter((t) => (counts.get(t.id) ?? 0) > 0);

  // Cheapest deliverable items read as the easiest yes.
  const quickPicks = available
    .filter((p) => !p.ageRestricted)
    .sort((a, b) => a.priceCents - b.priceCents)
    .slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden px-5 pb-7 pt-8"
        style={{ background: "linear-gradient(165deg, #12866e 0%, #0d6b58 52%, #0a4d41 100%)" }}>
        <h1 className="headline max-w-[15ch] text-[30px] font-semibold leading-[1.08] text-white">
          Anything in the terminal, brought to your seat
        </h1>
        <p className="prose-balance mt-2.5 max-w-[32ch] text-[14.5px] leading-relaxed text-white/80">
          Order from the airport&rsquo;s own shops. Same prices as the shelf, usually under
          ten minutes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white">
            <IconClock size={13} /> ~10 min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white">
            <IconCheck size={13} /> Shelf prices
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white">
            <IconStore size={13} /> {open.length} shops
          </span>
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="text-[16px] font-semibold">What do you need?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stagger>
            {themes.map((t) => {
              const Icon = CATEGORY_ICONS[t.icon] ?? IconBag;
              return (
                <button key={t.id} onClick={() => onTheme(t.id)}
                  className="pressable w-full overflow-hidden rounded-[var(--radius-lg)] p-4 text-left shadow-[var(--shadow-sm)]"
                  style={{ background: tint(t.hue, 10) }}>
                  <span style={{ color: t.hue }}><Icon size={24} /></span>
                  <span className="mt-2.5 block text-[14.5px] font-semibold" style={{ color: t.hue }}>
                    {t.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--color-ink-2)]">
                    {counts.get(t.id)} {counts.get(t.id) === 1 ? "item" : "items"}
                  </span>
                </button>
              );
            })}
          </Stagger>
        </div>
      </section>

      {quickPicks.length > 0 && (
        <section className="pt-7">
          <h2 className="px-5 text-[16px] font-semibold">Quick picks</h2>
          <div className="no-bar mt-3 flex gap-2.5 overflow-x-auto px-5 pb-1">
            {quickPicks.map((p) => {
              const m = open.find((x) => x.id === p.merchantId);
              return (
                <button key={p.id} onClick={() => onProduct(p)}
                  className="pressable w-[142px] shrink-0 rounded-[var(--radius-lg)] bg-white p-3.5 text-left shadow-[var(--shadow-sm)]">
                  <span aria-hidden className="grid h-11 w-11 place-items-center rounded-[13px] bg-[var(--color-surface-2)] text-[21px]">
                    {p.emoji}
                  </span>
                  <span className="mt-2.5 block truncate text-[14px] font-medium">{p.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--color-muted)]">{m?.name}</span>
                  <span className="mt-1.5 block text-[14px] font-semibold tnum">{euros(p.priceCents)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="px-5 pb-8 pt-7">
        <h2 className="text-[16px] font-semibold">All shops</h2>
        <div className="mt-3 space-y-2.5">
          {open.map((m) => {
            const count = available.filter((p) => p.merchantId === m.id).length;
            return (
              <Card key={m.id} onClick={() => onShop(m)} className="p-4">
                <div className="flex items-start gap-3.5">
                  <Monogram name={m.name} colour={m.colour} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15.5px] font-semibold">{m.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-ink-2)]">{m.blurb}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Pill><IconClock size={12} /> ~{m.prepMinutes} min</Pill>
                      <span className="text-[12.5px] text-[var(--color-muted)] tnum">{count} {count === 1 ? "item" : "items"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------ category --- */

function CategoryView({ cat, themeId, cart, setCart, onBack, onShop }: {
  cat: Catalogue; themeId: string; cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  onBack: () => void; onShop: (m: Merchant) => void;
}) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const Icon = CATEGORY_ICONS[theme.icon] ?? IconBag;
  const open = cat.merchants.filter((m) => m.zone === "airside-schengen");
  const openIds = new Set(open.map((m) => m.id));

  const items = cat.products
    .filter((p) => p.available && openIds.has(p.merchantId))
    .filter((p) => themeFor(cat.categories.find((c) => c.id === p.categoryId)?.name ?? null, p.name).id === themeId);

  // Grouped by shop, because that is how the order is actually fulfilled — one
  // basket cannot span two kitchens.
  const byShop = open
    .map((m) => ({ merchant: m, products: items.filter((p) => p.merchantId === m.id) }))
    .filter((g) => g.products.length > 0);

  return (
    <section className="pb-8">
      <div className="px-5 pt-5">
        <button onClick={onBack}
          className="pressable-sm -ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13.5px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]">
          <IconArrowLeft size={16} /> Everything
        </button>
      </div>

      <div className="mx-5 mt-3 flex items-center gap-3.5 rounded-[var(--radius-lg)] p-4"
           style={{ background: tint(theme.hue, 10) }}>
        <span style={{ color: theme.hue }}><Icon size={26} /></span>
        <div>
          <h1 className="headline text-[20px] font-semibold" style={{ color: theme.hue }}>{theme.label}</h1>
          <p className="text-[13px] text-[var(--color-ink-2)]">{items.length} items across {byShop.length} shops</p>
        </div>
      </div>

      {byShop.map(({ merchant, products }) => (
        <div key={merchant.id} className="mt-6 px-5">
          <button onClick={() => onShop(merchant)}
            className="pressable-sm mb-2.5 flex w-full items-center gap-2 text-left">
            <Monogram name={merchant.name} colour={merchant.colour} size={26} />
            <span className="text-[14px] font-semibold">{merchant.name}</span>
            <IconArrowRight size={14} className="text-[var(--color-muted)]" />
          </button>
          <div className="space-y-2">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} cat={cat} cart={cart} setCart={setCart} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * One product line, shared by the category browse and a shop's own menu so
 * the add-to-basket behaviour cannot drift between them.
 */
function ProductRow({ product: p, cat, cart, setCart }: {
  product: Product; cat: Catalogue; cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
}) {
  const [configuring, setConfiguring] = useState(false);
  const [switching, setSwitching] = useState(false);
  const qty = cart[p.id]?.qty ?? 0;
  const groups = cat.optionGroups.filter((g) => g.product_id === p.id);

  // One order is prepared by one shop, so a basket cannot mix them.
  const entries = Object.keys(cart);
  const basketMerchantId = entries.length
    ? cat.products.find((x) => x.id === entries[0])?.merchantId ?? null
    : null;
  const wouldSwitchShop = basketMerchantId !== null && basketMerchantId !== p.merchantId;
  const basketShopName = cat.merchants.find((m) => m.id === basketMerchantId)?.name ?? "another shop";

  const put = () => {
    if (groups.length > 0) { setConfiguring(true); return; }
    setCart((c) => ({ ...c, [p.id]: { qty: (c[p.id]?.qty ?? 0) + 1, optionIds: c[p.id]?.optionIds ?? [] } }));
  };

  const add = () => {
    if (wouldSwitchShop) { setSwitching(true); return; }
    put();
  };
  const remove = () => setCart((c) => {
    const n = (c[p.id]?.qty ?? 0) - 1;
    const next = { ...c };
    if (n <= 0) delete next[p.id]; else next[p.id] = { ...next[p.id], qty: n };
    return next;
  });

  return (
    <>
      <div className={`flex items-start gap-3.5 rounded-[var(--radius-lg)] bg-white p-3.5 shadow-[var(--shadow-sm)] ${!p.available ? "opacity-50" : ""}`}>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--color-surface-2)] text-[21px]">
          {p.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-medium">{p.name}</span>
            <span className="shrink-0 text-[15px] font-semibold tnum">{euros(p.priceCents)}</span>
          </div>
          {p.description && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-ink-2)]">{p.description}</p>
          )}
          {p.allergens && p.allergens.length > 0 && (
            <p className="mt-1 text-[11.5px] text-[var(--color-muted)]">Contains {p.allergens.join(", ")}</p>
          )}
          {p.ageRestricted ? (
            <div className="mt-2"><Pill tone="signal"><IconLock size={11} /> Collect in store · age check</Pill></div>
          ) : p.available && (
            <div className="mt-2.5 flex items-center gap-2">
              {qty > 0 && (
                <>
                  <button onClick={remove} aria-label={`Remove one ${p.name}`}
                    className="pressable grid h-8 w-8 place-items-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-2)]">
                    <IconMinus size={15} />
                  </button>
                  <span className="w-4 text-center text-[14px] font-semibold tnum">{qty}</span>
                </>
              )}
              <button onClick={add} aria-label={`Add ${p.name}`}
                className="pressable grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-white shadow-[var(--shadow-accent)]">
                <IconPlus size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {configuring && (
        <OptionSheet cat={cat} product={p} onClose={() => setConfiguring(false)}
          onConfirm={(optionIds) => {
            setCart((c) => ({ ...c, [p.id]: { qty: (c[p.id]?.qty ?? 0) + 1, optionIds } }));
            setConfiguring(false);
          }} />
      )}

      {switching && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
          <button aria-label="Cancel" onClick={() => setSwitching(false)}
            className="fade-in absolute inset-0 bg-[rgba(16,20,19,0.42)] backdrop-blur-[2px]" />
          <div className="sheet-up relative w-full max-w-md rounded-[var(--radius-2xl)] bg-white p-6 shadow-[var(--shadow-lg)]">
            <h2 className="headline text-[19px] font-semibold">Start a new basket?</h2>
            <p className="prose-balance mt-2 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
              Your basket has items from {basketShopName}. Each order is prepared by one shop, so
              adding this will clear what you have.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setSwitching(false)}>Keep basket</Button>
              <Button onClick={() => {
                setCart({});
                setSwitching(false);
                // Options still need choosing if this product has any.
                if (groups.length > 0) setConfiguring(true);
                else setCart({ [p.id]: { qty: 1, optionIds: [] } });
              }}>Start new</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- menu --- */

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
    <section className="px-5 pb-8 pt-5">
      <button onClick={onBack}
        className="pressable-sm -ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13.5px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]">
        <IconArrowLeft size={16} /> All shops
      </button>

      <div className="mt-3 flex items-center gap-3.5">
        <Monogram name={merchant.name} colour={merchant.colour} size={48} />
        <div className="min-w-0">
          <h1 className="headline text-[24px] font-semibold leading-tight">{merchant.name}</h1>
          <p className="mt-0.5 line-clamp-1 text-[13.5px] text-[var(--color-ink-2)]">{merchant.blurb}</p>
        </div>
      </div>

      {sections.map((s) => (
        <div key={s.name} className="mt-7">
          <h2 className="label mb-2.5 font-semibold text-[var(--color-ink)]">{s.name}</h2>
          <div className="space-y-2">
            {s.items.map((p) => {
              const qty = cart[p.id]?.qty ?? 0;
              const disabled = !p.available;
              return (
                <div key={p.id}
                  className={`flex items-start gap-3.5 rounded-[var(--radius-lg)] bg-white p-3.5 shadow-[var(--shadow-sm)] ${disabled ? "opacity-50" : ""}`}>
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--color-surface-2)] text-[21px]">
                    {p.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[15px] font-medium">{p.name}</span>
                      <span className="shrink-0 text-[15px] font-semibold tnum">{euros(p.priceCents)}</span>
                    </div>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-ink-2)]">{p.description}</p>
                    )}
                    {p.allergens && p.allergens.length > 0 && (
                      <p className="mt-1 text-[11.5px] text-[var(--color-muted)]">Contains {p.allergens.join(", ")}</p>
                    )}
                    {p.ageRestricted ? (
                      <div className="mt-2"><Pill tone="signal"><IconLock size={11} /> Collect in store · age check</Pill></div>
                    ) : !disabled && (
                      <div className="mt-2.5 flex items-center gap-2">
                        {qty > 0 && (
                          <>
                            <button onClick={() => remove(p)} aria-label={`Remove one ${p.name}`}
                              className="pressable grid h-8 w-8 place-items-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-2)]">
                              <IconMinus size={15} />
                            </button>
                            <span className="w-4 text-center text-[14px] font-semibold tnum">{qty}</span>
                          </>
                        )}
                        <button onClick={() => add(p)} aria-label={`Add ${p.name}`}
                          className="pressable grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-white shadow-[var(--shadow-accent)]">
                          <IconPlus size={15} />
                        </button>
                      </div>
                    )}
                    {disabled && <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">Unavailable right now</p>}
                  </div>
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
    <Sheet title={product.name} onClose={onClose}
      footer={
        <Button full size="lg" disabled={incomplete} onClick={() => onConfirm(all)}>
          Add to basket · {euros(product.priceCents + delta)}
        </Button>
      }>
      {groups.map((g) => (
        <div key={g.id} className="mb-5">
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-[14px] font-semibold">{g.name}</h3>
            {g.min_select > 0
              ? <span className="text-[12px] text-[var(--color-alert)]">Required</span>
              : <span className="text-[12px] text-[var(--color-muted)]">Optional</span>}
          </div>
          <div className="space-y-1.5">
            {cat.options.filter((o) => o.group_id === g.id && o.available).map((o) => {
              const on = (chosen[g.id] ?? []).includes(o.id);
              return (
                <button key={o.id} onClick={() => toggle(g.id, o.id, g.max_select)}
                  className="pressable flex w-full items-center justify-between rounded-[var(--radius-md)] px-3.5 py-3 text-left transition-colors"
                  style={{
                    background: on ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                    color: on ? "var(--color-accent-ink)" : "var(--color-ink)",
                  }}>
                  <span className="flex items-center gap-2.5 text-[14.5px] font-medium">
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full border-2 transition-colors"
                      style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line-strong)",
                               background: on ? "var(--color-accent)" : "transparent", color: "white" }}>
                      {on && <IconCheck size={11} strokeWidth={3} />}
                    </span>
                    {o.name}
                  </span>
                  <span className="text-[13.5px] font-medium tnum text-[var(--color-muted)]">
                    {o.price_delta_cents ? `+${euros(o.price_delta_cents)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- cart --- */

function CartView({ cat, merchant, cart, setCart, quote, location, error, placing, onChangeLocation, onBack, onPlace }: {
  cat: Catalogue; merchant: Merchant; cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  quote: Quote | null; location: LocationChoice | null; error: string | null; placing: boolean;
  onChangeLocation: () => void; onBack: () => void; onPlace: () => void;
}) {
  const lines = Object.entries(cart).map(([id, v]) => ({
    product: cat.products.find((p) => p.id === id)!, ...v,
  })).filter((l) => l.product);

  const refused = quote?.verdict === "REFUSE";
  const warned = quote?.verdict === "WARN";

  // Pricing is authoritative only from the server, but a quote needs a
  // delivery point. Until then, show the basket's own arithmetic rather than
  // €0.00 next to items the passenger can plainly see.
  const localGoods = lines.reduce((sum, { product, qty, optionIds }) => {
    const delta = optionIds.reduce(
      (d, id) => d + (cat.options.find((o) => o.id === id)?.price_delta_cents ?? 0), 0);
    return sum + (product.priceCents + delta) * qty;
  }, 0);
  const goodsCents = quote?.goodsCents ?? localGoods;
  const feeCents = quote?.deliveryFeeCents ?? 0;
  const totalCents = quote?.totalCents ?? localGoods;

  const setQty = (id: string, d: number) => setCart((c) => {
    const n = (c[id]?.qty ?? 0) + d;
    const next = { ...c };
    if (n <= 0) delete next[id]; else next[id] = { ...next[id], qty: n };
    return next;
  });

  return (
    <section className="px-5 pb-8 pt-5">
      <button onClick={onBack}
        className="pressable-sm -ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13.5px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]">
        <IconArrowLeft size={16} /> Keep browsing
      </button>
      <h1 className="headline mt-3 text-[26px] font-semibold">Your basket</h1>
      <p className="mt-1 text-[14px] text-[var(--color-ink-2)]">from {merchant.name}</p>

      <div className="mt-5 space-y-2">
        {lines.map(({ product, qty, optionIds }) => {
          const opts = optionIds.map((id) => cat.options.find((o) => o.id === id)).filter(Boolean);
          const delta = opts.reduce((s, o) => s + (o?.price_delta_cents ?? 0), 0);
          return (
            <div key={product.id} className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-white p-3.5 shadow-[var(--shadow-sm)]">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--color-surface-2)] text-[19px]">
                {product.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14.5px] font-medium">{product.name}</span>
                  <span className="shrink-0 text-[14.5px] font-semibold tnum">
                    {euros((product.priceCents + delta) * qty)}
                  </span>
                </div>
                {opts.length > 0 && (
                  <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">
                    {opts.map((o) => o!.name).join(", ")}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => setQty(product.id, -1)} aria-label={`Remove one ${product.name}`}
                    className="pressable grid h-7 w-7 place-items-center rounded-full border border-[var(--color-line)]">
                    <IconMinus size={13} />
                  </button>
                  <span className="w-4 text-center text-[13.5px] font-semibold tnum">{qty}</span>
                  <button onClick={() => setQty(product.id, 1)} aria-label={`Add one ${product.name}`}
                    className="pressable grid h-7 w-7 place-items-center rounded-full border border-[var(--color-line)]">
                    <IconPlus size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!location && (
        <button onClick={onChangeLocation}
          className="pressable mt-4 flex w-full items-center gap-3 rounded-[var(--radius-lg)] p-4 text-left"
          style={{ background: "var(--color-signal-soft)" }}>
          <span style={{ color: "var(--color-signal)" }}><IconPin size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold" style={{ color: "var(--color-signal)" }}>
              Where should we bring it?
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-ink-2)]">
              Scan the code on your seat, drop a pin, or pick a gate.
            </span>
          </span>
          <IconArrowRight size={17} className="shrink-0" />
        </button>
      )}

      {location && (
        <button onClick={onChangeLocation}
          className="pressable mt-4 flex w-full items-start gap-3 rounded-[var(--radius-lg)] bg-white p-4 text-left shadow-[var(--shadow-sm)]">
          <span className="mt-0.5 text-[var(--color-accent)]">
            {location.kind === "seat" ? <IconSeat size={19} /> : <IconPin size={19} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="label block">Delivering to</span>
            <span className="mt-0.5 block text-[15px] font-semibold">{location.label}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-ink-2)]">
              {quote?.location.note ?? location.detail}
            </span>
          </span>
          <span className="shrink-0 text-[12.5px] font-medium text-[var(--color-accent)]">Change</span>
        </button>
      )}

      <div className="mt-4 rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <Row label="Items" value={euros(goodsCents)} />
        <Row label="Delivery" value={feeCents ? euros(feeCents) : "—"} />
        <div className="mt-2.5 border-t border-[var(--color-line)] pt-2.5">
          <Row label="Total" value={euros(totalCents)} bold />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {quote && quote.blockedItems.length > 0 && (
          <Notice tone="signal" title="Some items need collecting in store" icon={<IconLock size={16} />}>
            {quote.blockedItems.join(", ")} needs an age check, which an unattended unit can&rsquo;t do.
            Everything else still comes to you.
          </Notice>
        )}
        {quote && !refused && (
          <Notice tone={warned ? "signal" : "accent"} icon={warned ? <IconAlert size={16} /> : <IconCheck size={16} />}
            title={warned ? "This is tight against boarding" : "We can get this to you in time"}>
            {quote.reason}
          </Notice>
        )}
        {refused && (
          <Notice tone="alert" title="Not enough time before boarding" icon={<IconAlert size={16} />}>
            {quote.reason}
          </Notice>
        )}
        {error && <Notice tone="alert" title="We couldn't place that order" icon={<IconAlert size={16} />}>{error}</Notice>}
      </div>

      <div className="mt-5">
        <Button full size="lg" loading={placing}
          disabled={refused || lines.length === 0}
          onClick={location ? onPlace : onChangeLocation}>
          {!location ? "Set a delivery point"
            : refused ? "Can't deliver this"
            : `Pay ${euros(totalCents)}`}
        </Button>
        <p className="mt-2.5 text-center text-[12px] text-[var(--color-muted)]">
          Payment is simulated — nothing is charged.
        </p>
      </div>
    </section>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-baseline justify-between py-0.5">
    <span className={bold ? "text-[15px] font-semibold" : "text-[14px] text-[var(--color-ink-2)]"}>{label}</span>
    <span className={`tnum ${bold ? "text-[16px] font-semibold" : "text-[14px] text-[var(--color-ink-2)]"}`}>{value}</span>
  </div>
);

/* -------------------------------------------------------------- orders --- */

function OrdersList({ orders, missing, now, onOpen, onForget, onShop }: {
  orders: OrderRow[]; missing: number; now: number;
  onOpen: (o: OrderRow) => void; onForget: () => void; onShop: () => void;
}) {
  const live = orders.filter((o) => LIVE.includes(o.state));
  const past = orders.filter((o) => !LIVE.includes(o.state));

  if (orders.length === 0 && missing === 0) {
    return <EmptyState icon={<IconOrders size={26} />} title="No orders yet"
      body="Anything you order appears here and stays put, even if you navigate away."
      action={<Button onClick={onShop} icon={<IconBag size={17} />}>Browse the shops</Button>} />;
  }

  return (
    <section className="px-5 pb-8 pt-7">
      <h1 className="headline text-[28px] font-semibold">Your orders</h1>

      {live.length > 0 && (
        <>
          <h2 className="label mt-6 mb-2.5 font-semibold text-[var(--color-ink)]">In progress</h2>
          <div className="space-y-2.5">
            <Stagger>{live.map((o) => <OrderRowCard key={o.id} order={o} now={now} onOpen={onOpen} />)}</Stagger>
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="label mt-7 mb-2.5 font-semibold text-[var(--color-ink)]">Completed</h2>
          <div className="space-y-2.5">
            {past.map((o) => <OrderRowCard key={o.id} order={o} now={now} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {missing > 0 && (
        <div className="mt-6">
          <Notice tone="signal" title={`${missing} order${missing > 1 ? "s" : ""} no longer on the system`}
            icon={<IconAlert size={16} />}>
            They were cleared from the server. Your remaining orders are unaffected.{" "}
            <button onClick={onForget} className="font-medium underline underline-offset-2">Clear from this list</button>
          </Notice>
        </div>
      )}
    </section>
  );
}

function OrderRowCard({ order, now, onOpen }: { order: OrderRow; now: number; onOpen: (o: OrderRow) => void }) {
  const copy = STATE_COPY[order.state];
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";
  const isLive = LIVE.includes(order.state);
  const pct = Math.round(progressOf(order.state) * 100);

  return (
    <Card onClick={() => onOpen(order)} className="overflow-hidden p-4"
      style={arrived ? { boxShadow: "0 0 0 2px var(--color-accent), var(--shadow-md)" } : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--color-muted)] tnum">{order.ref}</span>
        <span className="text-[12px] text-[var(--color-muted)]">{order.merchant_name}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[16px] font-semibold" style={arrived ? { color: "var(--color-accent)" } : undefined}>
          {copy.label}
        </span>
        <span className="text-[15px] font-semibold tnum">{euros(order.total_cents)}</span>
      </div>
      <p className="mt-1 truncate text-[13px] text-[var(--color-ink-2)]">
        {order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
      </p>

      {isLive && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]"
              style={{ width: `${pct}%`, background: "var(--color-accent)" }} />
          </div>
          {arrived
            ? <Pill tone="accent">Code {order.handover_code}</Pill>
            : <span className="text-[12px] font-medium text-[var(--color-muted)] tnum">
                {inMinutes(new Date(order.created_at).getTime(), now)}
              </span>}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ tracking --- */

function Tracking({ order, cat, onBack, onShopAgain }: {
  order: OrderRow; cat: Catalogue; onBack: () => void; onShopAgain: () => void;
}) {
  const copy = STATE_COPY[order.state];
  const arrived = order.state === "ARRIVED" || order.state === "NO_SHOW";
  const done = ["COMPLETED", "REJECTED", "CANCELLED", "ABORTED"].includes(order.state);
  const failed = done && order.state !== "COMPLETED";
  const pct = Math.round(progressOf(order.state) * 100);

  return (
    <section className="px-5 pb-8 pt-5">
      <button onClick={onBack}
        className="pressable-sm -ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13.5px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]">
        <IconArrowLeft size={16} /> Your orders
      </button>

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"
          style={{ background: failed ? "var(--color-alert-soft)" : "var(--color-accent-soft)",
                   color: failed ? "var(--color-alert)" : "var(--color-accent)" }}>
          {done && !failed ? <IconCheck size={21} strokeWidth={2.4} /> : <IconRobot size={21} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[var(--color-muted)] tnum">{order.ref}</p>
          <h1 className="headline text-[24px] font-semibold leading-tight">{copy.label}</h1>
          <p className="mt-0.5 text-[14px] text-[var(--color-ink-2)]">{copy.detail}</p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]"
          style={{ width: `${pct}%`, background: failed ? "var(--color-alert)" : "var(--color-accent)" }} />
      </div>

      {arrived && (
        <div className="pop mt-5 overflow-hidden rounded-[var(--radius-xl)] p-6 text-center text-white shadow-[var(--shadow-accent)]"
             style={{ background: "linear-gradient(160deg, var(--color-accent-hi), var(--color-accent))" }}>
          <p className="text-[12.5px] font-medium text-white/80">Enter this on the robot&rsquo;s screen</p>
          <p className="mt-2 text-[46px] font-semibold leading-none tracking-[0.16em] tnum">{order.handover_code}</p>
          <p className="mt-3 text-[13.5px] text-white/85">{order.nav_waypoint_landmark}</p>
        </div>
      )}

      {order.sla_missed && (
        <div className="mt-4">
          <Notice tone="alert" title="We were late" icon={<IconClock size={16} />}>
            Your delivery fee has been refunded automatically.
          </Notice>
        </div>
      )}

      {["ABORTED", "REJECTED"].includes(order.state) && (
        <div className="mt-4">
          <Notice tone="alert" icon={<IconAlert size={16} />}
            title={order.state === "REJECTED" ? "The shop couldn't take this order" : "The shop cancelled this order"}>
            {order.rejection_reason || "No reason was given."}
            {order.refunded_cents ? ` You have been refunded ${euros(order.refunded_cents)} in full.` : ""}
          </Notice>
        </div>
      )}

      <div className="mt-5 rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-[var(--color-accent)]"><IconPin size={17} /></span>
          <div className="min-w-0">
            <p className="label">Delivery point</p>
            <p className="mt-0.5 text-[15px] font-semibold">{order.nav_waypoint_name}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-ink-2)]">
              {order.location_note} · {Number(order.walk_metres).toFixed(1)} m from where the unit stops
            </p>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-2)]/50 p-2">
          <TerminalMap waypoints={cat.waypoints} edges={cat.edges} zones={["airside-schengen"]} showLabels />
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <p className="label mb-2">Order</p>
        <div className="space-y-1.5">
          {order.lines.map((l, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="truncate"><span aria-hidden>{l.emoji}</span> {l.qty} × {l.name}</span>
              <span className="shrink-0 tnum">{euros(l.unit_price_cents * l.qty)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-[var(--color-line)] pt-2 text-[13.5px] text-[var(--color-ink-2)]">
            <span>Delivery</span><span className="tnum">{euros(order.delivery_fee_cents)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[15px] font-semibold">
            <span>Total</span><span className="tnum">{euros(order.total_cents)}</span>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">from {order.merchant_name}</p>
      </div>

      {done && (
        <div className="mt-5">
          <Button full size="lg" onClick={onShopAgain} icon={<IconBag size={17} />}>Order something else</Button>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------- location picker --- */

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

  const tabs = [
    ["pin", "Drop a pin", <IconPin key="p" size={15} />],
    ["gate", "Pick a gate", <IconStore key="g" size={15} />],
    ["code", "Seat code", <IconSeat key="s" size={15} />],
  ] as const;

  return (
    <Sheet title="Where should we bring it?" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-[12px] bg-[var(--color-surface-2)] p-1">
        {tabs.map(([k, label, icon]) => (
          <button key={k} onClick={() => setMode(k)}
            className="pressable-sm flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-medium transition-colors"
            style={mode === k
              ? { background: "white", color: "var(--color-ink)", boxShadow: "var(--shadow-xs)" }
              : { color: "var(--color-muted)" }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {mode === "pin" && (
        <div className="fade-in pb-4">
          <p className="prose-balance text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            Tap the map where you&rsquo;re sitting. We bring it to the nearest point the robot can reach
            and tell you exactly how far that is.
          </p>
          <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] bg-white p-2 shadow-[var(--shadow-sm)]">
            <TerminalMap waypoints={cat.waypoints} edges={cat.edges} zones={["airside-schengen"]}
              pin={pin} onPinDrop={(x, y) => setPin({ x, y })} showLabels />
          </div>
          {pin && (
            <div className="pop mt-4">
              <Button full size="lg" icon={<IconPin size={17} />}
                onClick={() => onPick({
                  kind: "pin", pinX: pin.x, pinY: pin.y,
                  label: "Pin on the map", detail: "We confirm the exact walk at checkout",
                })}>
                Deliver here
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "gate" && (
        <div className="fade-in space-y-2 pb-4">
          {gates.map((w) => {
            const on = current?.waypointId === w.id;
            return (
              <button key={w.id}
                onClick={() => onPick({ kind: "waypoint", waypointId: w.id, label: w.name, detail: w.landmark })}
                className="pressable flex w-full items-center gap-3 rounded-[var(--radius-md)] p-3.5 text-left transition-colors"
                style={{ background: on ? "var(--color-accent-soft)" : "var(--color-surface-2)" }}>
                <span style={{ color: on ? "var(--color-accent)" : "var(--color-muted)" }}><IconPin size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">{w.name}</span>
                  <span className="block truncate text-[12.5px] text-[var(--color-ink-2)]">{w.landmark}</span>
                </span>
                {on && <span className="text-[var(--color-accent)]"><IconCheck size={17} strokeWidth={2.4} /></span>}
              </button>
            );
          })}
        </div>
      )}

      {mode === "code" && (
        <div className="fade-in pb-4">
          <p className="prose-balance text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            Every seat has a printed code. Scanning its QR opens this app with the seat already set —
            or type the code here.
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="Code from the seat sticker" autoCapitalize="characters" autoCorrect="off"
            className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-line)] bg-white px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]" />
          {codeError && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--color-alert)]">
              <IconAlert size={14} />{codeError}
            </p>
          )}
          <div className="mt-3">
            <Button full size="lg" loading={busy} disabled={!code.trim()} onClick={submitCode}>
              Use this seat
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
