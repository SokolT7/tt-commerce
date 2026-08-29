"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase, useLiveQuery, useNow, type DB } from "@/lib/hooks";
import { euros, mmss } from "@/lib/format";
import { STATE_COPY } from "@/domain/orders/machine";
import {
  Button, Pill, Monogram, EmptyState, SkeletonList, Notice, Modal,
  IconOrders, IconStore, IconClock, IconCheck, IconAlert, IconRobot, IconLock, IconPin,
} from "@/components/ui";

type Tab = "orders" | "menu" | "settings" | "takings";

interface OrderRow {
  id: string; ref: string; state: string; passenger_name: string;
  total_cents: number; goods_cents: number; commission_cents: number;
  promise_deadline: string | null; nav_waypoint_name: string; location_note: string;
  walk_metres: number; robot_id: string | null; compartment_id: string | null;
  flight_number: string | null; flight_gate: string | null;
  lines: { name: string; emoji: string; qty: number; unit_price_cents: number; options: { name: string }[] }[];
}

interface Shop {
  id: string; name: string; blurb: string; colour: string; open: boolean;
  prep_minutes: number; commission_rate: number;
}
interface Category { id: string; name: string; sort_order: number }
interface Product {
  id: string; category_id: string | null; name: string; description: string;
  price_cents: number; emoji: string; available: boolean; age_restricted: boolean;
  allergens: string[]; sort_order: number;
}

async function loadAll(db: DB, merchantId: string) {
  const [shop, categories, products, live, done] = await Promise.all([
    db.from("merchants").select("*").eq("id", merchantId).single(),
    db.from("product_categories").select("*").eq("merchant_id", merchantId).order("sort_order"),
    db.from("products").select("*").eq("merchant_id", merchantId).order("sort_order"),
    db.from("order_details").select("*").eq("merchant_id", merchantId)
      .not("state", "in", "(COMPLETED,REJECTED,CANCELLED,ABORTED)").order("created_at"),
    db.from("order_details").select("*").eq("merchant_id", merchantId)
      .eq("state", "COMPLETED").order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    shop: shop.data as unknown as Shop,
    categories: (categories.data ?? []) as Category[],
    products: (products.data ?? []) as Product[],
    live: (live.data ?? []) as unknown as OrderRow[],
    done: (done.data ?? []) as unknown as OrderRow[],
  };
}

export function ShopConsole({ merchantId, slug, role }: { merchantId: string; slug: string; role: string }) {
  const router = useRouter();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("orders");
  const { data, error, reload } = useLiveQuery(
    ["orders", "products", "merchants", "product_categories"],
    (db) => loadAll(db, merchantId),
    [merchantId],
  );

  if (error) {
    return (
      <Shell>
        <EmptyState icon={<IconAlert size={26} />} title="Couldn't load your shop" body={error} />
      </Shell>
    );
  }
  if (!data?.shop) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="skeleton h-14 rounded-[var(--radius-lg)]" />
          <div className="mt-6"><SkeletonList rows={3} /></div>
        </div>
      </Shell>
    );
  }

  const { shop, categories, products, live, done } = data;
  const incoming = live.filter((o) => o.state === "SENT_TO_MERCHANT");

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/merchant/login");
    router.refresh();
  };

  return (
    <Shell>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Monogram name={shop.name} colour={shop.colour} size={40} />
            <div>
              <h1 className="headline text-[19px] font-semibold leading-tight">{shop.name}</h1>
              <p className="text-[12.5px] text-[var(--color-muted)]">Shop console · {role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {incoming.length > 0 && (
              <span className="pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white"
                    style={{ background: "var(--color-alert)" }}>
                <span className="relative flex h-2 w-2">
                  <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-white" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                {incoming.length} new
              </span>
            )}
            <OpenToggle shop={shop} onDone={reload} />
            <button onClick={signOut}
              className="pressable-sm rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-2">
          {([
            ["orders", "Orders", <IconOrders key="o" size={16} />],
            ["menu", "Menu", <IconStore key="m" size={16} />],
            ["takings", "Takings", <IconCheck key="t" size={16} />],
            ["settings", "Settings", <IconLock key="s" size={16} />],
          ] as const).map(([t, label, icon]) => {
            const on = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className="pressable-sm inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors"
                style={on
                  ? { background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }
                  : { color: "var(--color-muted)" }}>
                {icon}{label}
                {t === "orders" && live.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-[var(--color-accent)] px-1.5 text-[11px] font-semibold text-white tnum">
                    {live.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "orders" && <Orders orders={live} now={now} onDone={reload} />}
      {tab === "menu" && <Menu merchantId={merchantId} categories={categories} products={products} onDone={reload} />}
      {tab === "settings" && <Settings shop={shop} merchantId={merchantId} onDone={reload} />}
      {tab === "takings" && <Takings orders={done} rate={shop.commission_rate} />}
      <p className="mx-auto max-w-6xl px-6 py-8 text-[11.5px] text-[var(--color-muted)]">
        /merchant/{slug} · updates live from the database
      </p>
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-screen bg-ground">{children}</main>
);

function OpenToggle({ shop, onDone }: { shop: Shop; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await supabase().from("merchants").update({ open: !shop.open }).eq("id", shop.id);
    setBusy(false); onDone();
  };
  return (
    <button onClick={toggle} disabled={busy} role="switch" aria-checked={shop.open}
      aria-label={shop.open ? "Shop is open — tap to close" : "Shop is closed — tap to open"}
      className="pressable-sm inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-[13px] font-medium disabled:opacity-50"
      style={{ background: shop.open ? "var(--color-accent-soft)" : "var(--color-surface-2)",
               color: shop.open ? "var(--color-accent-ink)" : "var(--color-muted)" }}>
      <span className="relative h-5 w-9 rounded-full transition-colors duration-200"
            style={{ background: shop.open ? "var(--color-accent)" : "var(--color-line-strong)" }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-out)]"
              style={{ transform: shop.open ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
      {shop.open ? "Open" : "Closed"}
    </button>
  );
}

/* -------------------------------- orders -------------------------------- */

function Orders({ orders, now, onDone }: { orders: OrderRow[]; now: number; onDone: () => void }) {
  if (orders.length === 0) {
    return (
      <EmptyState icon={<IconOrders size={26} />} title="No orders waiting"
        body="New orders appear here the moment a passenger pays, with a sound and a countdown." />
    );
  }
  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => <OrderCard key={o.id} order={o} now={now} onDone={onDone} />)}
    </div>
  );
}

const CANCEL_REASONS = [
  "Item ran out",
  "Equipment problem",
  "Too busy to make it in time",
  "Order placed by mistake",
];

function OrderCard({ order, now, onDone }: { order: OrderRow; now: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const deadlineIn = order.promise_deadline
    ? Math.round((new Date(order.promise_deadline).getTime() - now) / 1000) : null;
  const urgent = deadlineIn !== null && deadlineIn < 300;   // includes overdue
  const isNew = order.state === "SENT_TO_MERCHANT";

  const act = async (action: string, reason?: string) => {
    setBusy(true); setErr(null);
    try { await api(`/api/v1/orders/${order.id}/action`, { action, reason }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <article className="rise flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]"
      style={isNew ? { boxShadow: "0 0 0 2px var(--color-alert), var(--shadow-md)" } : undefined}>

      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tnum">{order.ref}</span>
          {isNew && <Pill tone="alert">New</Pill>}
        </div>
        {deadlineIn !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tnum"
            style={{ background: urgent ? "var(--color-alert-soft)" : "var(--color-surface-2)",
                     color: urgent ? "var(--color-alert)" : "var(--color-ink-2)" }}>
            <IconClock size={12} />
            {/* A passed deadline is information the shop needs, not a blank dash. */}
            {deadlineIn <= 0 ? "Overdue" : mmss(deadlineIn)}
          </span>
        )}
      </div>

      <div className="px-4 pt-3">
        <p className="text-[12.5px] text-[var(--color-muted)]">
          {order.flight_number} · Gate {order.flight_gate} · {order.passenger_name || "Passenger"}
        </p>

        <ul className="mt-3 space-y-2">
          {order.lines.map((l, i) => (
            <li key={i}>
              <div className="flex items-baseline gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--color-surface-2)] text-[12px] font-semibold tnum">
                  {l.qty}
                </span>
                <span className="flex-1 text-[14.5px]"><span aria-hidden>{l.emoji}</span> {l.name}</span>
                <span className="shrink-0 text-[13px] text-[var(--color-muted)] tnum">
                  {euros(l.unit_price_cents * l.qty)}
                </span>
              </div>
              {l.options?.length > 0 && (
                <p className="ml-[34px] mt-0.5 text-[12px] text-[var(--color-muted)]">
                  {l.options.map((o) => o.name).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <span className="mt-0.5 text-[var(--color-muted)]"><IconPin size={14} /></span>
          <div className="min-w-0 text-[12.5px]">
            <p className="font-semibold">{order.nav_waypoint_name}</p>
            <p className="text-[var(--color-muted)]">
              {order.location_note} · {Number(order.walk_metres).toFixed(1)} m walk
            </p>
          </div>
        </div>

        {err && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--color-alert)" }}>
            <IconAlert size={13} />{err}
          </p>
        )}
      </div>

      <div className="mt-auto p-4">
        {order.state === "SENT_TO_MERCHANT" && (
          <div className="grid grid-cols-3 gap-2">
            <Button className="col-span-2" loading={busy} onClick={() => act("accept")} icon={<IconCheck size={17} />}>
              Accept
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => act("reject", "Item unavailable")}>
              Reject
            </Button>
          </div>
        )}
        {order.state === "PREPARING" && (
          <Button full loading={busy} onClick={() => act("ready")}
            className="!bg-[var(--color-signal)] !shadow-none">
            Mark ready
          </Button>
        )}
        {["READY", "ROBOT_ASSIGNED"].includes(order.state) && (
          <div className="flex items-center justify-center gap-2 rounded-[12px] bg-[var(--color-surface-2)] py-3 text-[13.5px] font-medium text-[var(--color-ink-2)]">
            <IconRobot size={16} />
            {order.state === "READY" ? "Waiting for a unit" : `${order.robot_id} on its way`}
          </div>
        )}
        {order.state === "AT_MERCHANT" && (
          <Button full size="lg" loading={busy} onClick={() => act("load")} icon={<IconRobot size={18} />}>
            Load compartment {order.compartment_id}
          </Button>
        )}
        {["IN_TRANSIT", "ARRIVED"].includes(order.state) && (
          <div className="rounded-[12px] bg-[var(--color-accent-soft)] py-3 text-center text-[13.5px] font-medium text-[var(--color-accent-ink)]">
            {STATE_COPY[order.state as keyof typeof STATE_COPY]?.label ?? order.state}
          </div>
        )}

        {/* Rejecting is offered on a new order; after that the way out is to
            cancel, which also refunds and frees the unit. */}
        {order.state !== "SENT_TO_MERCHANT" && (
          <button onClick={() => setCancelling(true)} disabled={busy}
            className="pressable-sm mt-2 w-full rounded-[10px] py-2 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-alert-soft)] hover:text-[var(--color-alert)] disabled:opacity-50">
            Cancel this order
          </button>
        )}
      </div>
      {cancelling && (
        <CancelDialog
          order={order}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => { await act("cancel", reason); setCancelling(false); }}
        />
      )}
    </article>
  );
}

function CancelDialog({ order, onClose, onConfirm }: {
  order: OrderRow; onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = ["LOADED", "IN_TRANSIT", "ARRIVED"].includes(order.state);

  return (
    <Modal
      title={`Cancel ${order.ref}?`}
      tone="danger"
      onClose={onClose}
      description="The passenger is refunded in full and told why. This cannot be undone."
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onClose}>Keep order</Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()}
            onClick={async () => { setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}>
            Cancel order
          </Button>
        </div>
      }
    >
      {inFlight && (
        <div className="mb-4">
          <Notice tone="alert" title="The order is already loaded" icon={<IconAlert size={16} />}>
            It is in a compartment on {order.robot_id ?? "a unit"} and will need retrieving.
          </Notice>
        </div>
      )}

      <p className="label">Reason — the passenger sees this</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CANCEL_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)}
            className="pressable-sm rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
            style={reason === r
              ? { background: "var(--color-ink)", color: "white" }
              : { background: "var(--color-surface-2)", color: "var(--color-ink-2)" }}>
            {r}
          </button>
        ))}
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Or type a reason"
        className="mt-2.5 w-full rounded-[var(--radius-md)] border border-[var(--color-line)] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[var(--color-accent)]" />
    </Modal>
  );
}


const BLANK: Omit<Product, "id"> & { id: string } = {
  id: "", category_id: null, name: "", description: "", price_cents: 0,
  emoji: "🍽️", available: true, age_restricted: false, allergens: [], sort_order: 0,
};

function Menu({
  merchantId, categories, products, onDone,
}: { merchantId: string; categories: Category[]; products: Product[]; onDone: () => void }) {
  const [editing, setEditing] = useState<(Product & { isNew?: boolean }) | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    await supabase().from("product_categories").insert({
      merchant_id: merchantId, name: newCategory.trim(), sort_order: categories.length,
    });
    setNewCategory(""); onDone();
  };

  const removeCategory = async (id: string) => {
    await supabase().from("product_categories").delete().eq("id", id);
    onDone();
  };

  const toggle = async (p: Product) => {
    await supabase().from("products").update({ available: !p.available }).eq("id", p.id);
    onDone();
  };

  const grouped = [
    ...categories.map((c) => ({ category: c, items: products.filter((p) => p.category_id === c.id) })),
    { category: null, items: products.filter((p) => !p.category_id) },
  ].filter((g) => g.items.length > 0 || g.category);

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your menu</h2>
          <p className="text-sm text-ink-2">Changes appear in the passenger app immediately.</p>
        </div>
        <button onClick={() => setEditing({ ...BLANK, isNew: true })}
          className="rounded-lg px-4 py-2 font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>+ Add item</button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="eyebrow">Sections</span>
        {categories.map((c) => (
          <span key={c.id} className="mono inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs">
            {c.name}
            <button onClick={() => removeCategory(c.id)} aria-label={`Delete ${c.name}`}
                    className="text-muted hover:text-alert">×</button>
          </span>
        ))}
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder="New section…"
          className="mono rounded-full border border-dashed border-line-strong bg-surface px-3 py-1 text-xs" />
      </div>

      {grouped.map(({ category, items }) => (
        <section key={category?.id ?? "none"} className="mb-6">
          <div className="eyebrow mb-2">{category?.name ?? "Uncategorised"}</div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {items.length === 0 && <p className="px-4 py-4 text-sm text-muted">Nothing in this section yet.</p>}
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className="text-xl">{p.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted">{p.description}</div>
                  {p.age_restricted && (
                    <span className="mono text-[10px]" style={{ color: "var(--color-signal)" }}>
                      age-restricted · collect in store only
                    </span>
                  )}
                </div>
                <span className="mono text-sm">{euros(p.price_cents)}</span>
                <button onClick={() => toggle(p)} className="mono rounded-full px-3 py-1 text-xs"
                  style={{ background: p.available ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                           color: p.available ? "var(--color-accent)" : "var(--color-muted)" }}>
                  {p.available ? "on sale" : "86'd"}
                </button>
                <button onClick={() => setEditing(p)} className="mono text-xs underline">edit</button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <ProductEditor merchantId={merchantId} categories={categories} product={editing}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); onDone(); }} />
      )}
    </div>
  );
}

function ProductEditor({
  merchantId, categories, product, onClose, onDone,
}: {
  merchantId: string; categories: Category[];
  product: Product & { isNew?: boolean }; onClose: () => void; onDone: () => void;
}) {
  const [draft, setDraft] = useState(product);
  const [price, setPrice] = useState((product.price_cents / 100).toFixed(2));
  const [allergens, setAllergens] = useState(product.allergens.join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!draft.name.trim()) { setErr("Give the item a name"); return; }
    setBusy(true); setErr(null);
    const row = {
      merchant_id: merchantId,
      category_id: draft.category_id,
      name: draft.name.trim(),
      description: draft.description,
      price_cents: Math.max(0, Math.round(parseFloat(price || "0") * 100)),
      emoji: draft.emoji || "🍽️",
      available: draft.available,
      age_restricted: draft.age_restricted,
      allergens: allergens.split(",").map((a) => a.trim()).filter(Boolean),
      sort_order: draft.sort_order,
    };
    const db = supabase();
    const { error } = product.isNew
      ? await db.from("products").insert(row)
      : await db.from("products").update(row).eq("id", product.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    onDone();
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase().from("products").delete().eq("id", product.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface p-6">
        <div className="eyebrow">{product.isNew ? "New item" : "Edit item"}</div>

        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <label className="block">
              <span className="eyebrow">Icon</span>
              <input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="mt-1 w-full rounded border border-line bg-surface px-3 py-2 text-center text-xl" />
            </label>
            <label className="block">
              <span className="eyebrow">Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Cappuccino"
                className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Description</span>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Double shot, whole or oat milk"
              className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow">Price (EUR)</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
                className="mono mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
            </label>
            <label className="block">
              <span className="eyebrow">Section</span>
              <select value={draft.category_id ?? ""}
                onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}
                className="mono mt-1 w-full rounded border border-line bg-surface px-3 py-2">
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Allergens (comma separated)</span>
            <input value={allergens} onChange={(e) => setAllergens(e.target.value)}
              placeholder="gluten, dairy"
              className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
          </label>

          <label className="flex items-start gap-3 rounded border border-line bg-surface-2 p-3">
            <input type="checkbox" checked={draft.age_restricted} className="mt-1"
              onChange={(e) => setDraft({ ...draft, age_restricted: e.target.checked })} />
            <span className="text-sm">
              <strong>Age-restricted</strong>
              <span className="block text-xs text-ink-2">
                An unattended unit cannot verify age, so this stays collect-in-store in the passenger app.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={draft.available}
              onChange={(e) => setDraft({ ...draft, available: e.target.checked })} />
            <span className="text-sm">Available now</span>
          </label>
        </div>

        {err && <p className="mt-3 text-sm" style={{ color: "var(--color-alert)" }}>{err}</p>}

        <div className="mt-6 flex items-center justify-between">
          {!product.isNew ? (
            <button onClick={remove} disabled={busy} className="mono text-sm" style={{ color: "var(--color-alert)" }}>
              delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2">Cancel</button>
            <button onClick={save} disabled={busy}
              className="rounded-lg px-5 py-2 font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-accent)" }}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- settings -------------------------------- */

function Settings({ shop, merchantId, onDone }: { shop: Shop; merchantId: string; onDone: () => void }) {
  const [prep, setPrep] = useState(shop.prep_minutes);
  const { data: overrides, reload } = useLiveQuery(
    ["merchant_prep_overrides"],
    async (db) => (await db.from("merchant_prep_overrides").select("*")
      .eq("merchant_id", merchantId).order("hour_of_day")).data ?? [],
    [merchantId],
  );
  const [hour, setHour] = useState(7);
  const [hourMins, setHourMins] = useState(8);

  const saveDefault = async () => {
    await supabase().from("merchants").update({ prep_minutes: prep }).eq("id", merchantId);
    onDone();
  };
  const addOverride = async () => {
    await supabase().from("merchant_prep_overrides")
      .upsert({ merchant_id: merchantId, hour_of_day: hour, prep_minutes: hourMins });
    reload();
  };
  const removeOverride = async (h: number) => {
    await supabase().from("merchant_prep_overrides").delete()
      .eq("merchant_id", merchantId).eq("hour_of_day", h);
    reload();
  };

  return (
    <div className="max-w-2xl p-6">
      <h2 className="text-lg font-semibold">Preparation times</h2>
      <p className="mt-1 text-sm text-ink-2">
        This is what the system promises the passenger. Set it honestly — an order that arrives
        after boarding costs more than one that was never taken.
      </p>

      <div className="mt-5 rounded-lg border border-line bg-surface p-4">
        <label className="block">
          <span className="eyebrow">Default preparation time</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min={1} max={60} value={prep}
              onChange={(e) => setPrep(Number(e.target.value))}
              className="mono w-24 rounded border border-line bg-surface px-3 py-2" />
            <span className="text-sm text-muted">minutes</span>
            <button onClick={saveDefault}
              className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-accent)" }}>Save</button>
          </div>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="eyebrow">Busy-hour overrides</div>
        <p className="mt-1 text-xs text-ink-2">Peak preparation is nothing like the quiet hours.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(overrides ?? []).map((o) => (
            <span key={o.hour_of_day}
              className="mono inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs">
              {String(o.hour_of_day).padStart(2, "0")}:00 → {o.prep_minutes} min
              <button onClick={() => removeOverride(o.hour_of_day)} className="text-muted hover:text-alert">×</button>
            </span>
          ))}
          {(overrides ?? []).length === 0 && <span className="text-xs text-muted">None set.</span>}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <label className="block">
            <span className="eyebrow">Hour</span>
            <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))}
              className="mono mt-1 w-20 rounded border border-line bg-surface px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="eyebrow">Minutes</span>
            <input type="number" min={1} max={60} value={hourMins} onChange={(e) => setHourMins(Number(e.target.value))}
              className="mono mt-1 w-20 rounded border border-line bg-surface px-2 py-1.5" />
          </label>
          <button onClick={addOverride} className="rounded-lg border border-line px-4 py-2 text-sm">Add</button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
        <div className="eyebrow">Commission</div>
        <p className="mt-1 text-sm text-ink-2">
          {(shop.commission_rate * 100).toFixed(1)}% on delivered orders. Set in your agreement — contact us to change it.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------- takings -------------------------------- */

function Takings({ orders, rate }: { orders: OrderRow[]; rate: number }) {
  const gross = orders.reduce((s, o) => s + o.goods_cents, 0);
  const commission = orders.reduce((s, o) => s + o.commission_cents, 0);
  return (
    <div className="p-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Delivered orders" value={String(orders.length)} />
        <Stat label="Gross sales" value={euros(gross)} />
        <Stat label={`Commission (${(rate * 100).toFixed(1)}%)`} value={`− ${euros(commission)}`} tone="signal" />
        <Stat label="Net payout" value={euros(gross - commission)} tone="accent" />
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-surface-2">
              {["Order", "Items", "Gross", "Commission", "Net"].map((h) => (
                <th key={h} className="eyebrow px-3 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No completed orders yet.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="mono px-3 py-2">{o.ref}</td>
                <td className="px-3 py-2">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</td>
                <td className="mono px-3 py-2">{euros(o.goods_cents)}</td>
                <td className="mono px-3 py-2" style={{ color: "var(--color-signal)" }}>− {euros(o.commission_cents)}</td>
                <td className="mono px-3 py-2 font-semibold">{euros(o.goods_cents - o.commission_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mono mt-4 text-xs text-muted">
        The shop issues the fiscal receipt for the goods. Commission is invoiced separately as a
        B2B e-invoice — three documents, never one.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "signal" }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <p className="label">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tnum"
        style={{ color: tone ? `var(--color-${tone})` : "var(--color-ink)" }}>{value}</p>
    </div>
  );
}
