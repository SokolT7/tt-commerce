"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, useNow, useSnapshot } from "@/lib/client";
import { euros, mmss } from "@/lib/format";
import type { Order, Product, ProductCategory } from "@/domain/types";

type Tab = "orders" | "catalogue" | "takings";

const CATEGORIES: ProductCategory[] = [
  "hot-drinks", "cold-drinks", "food", "snacks", "croatian", "beauty", "alcohol",
];

export function MerchantConsole({ merchantId }: { merchantId: string }) {
  const { snap, connected } = useSnapshot();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("orders");

  const merchant = snap?.merchants.find((m) => m.id === merchantId);
  const orders = useMemo(
    () => (snap?.orders ?? []).filter((o) => o.merchantId === merchantId),
    [snap, merchantId],
  );
  const products = useMemo(
    () => (snap?.products ?? []).filter((p) => p.merchantId === merchantId),
    [snap, merchantId],
  );

  if (!snap || !merchant) {
    return <div className="grid min-h-screen place-items-center"><span className="eyebrow">loading…</span></div>;
  }

  const queue = orders.filter((o) =>
    ["SENT_TO_MERCHANT", "ACCEPTED", "PREPARING", "READY", "ROBOT_ASSIGNED", "AT_MERCHANT"].includes(o.state),
  );
  const done = orders.filter((o) => o.state === "COMPLETED");

  return (
    <main className="min-h-screen bg-ground">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/merchant" className="eyebrow">← shops</Link>
            <div style={{ borderLeft: `4px solid ${merchant.colour}`, paddingLeft: 12 }}>
              <div className="eyebrow">Merchant tablet</div>
              <h1 className="text-xl font-bold tracking-tight">{merchant.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {queue.filter((o) => o.state === "SENT_TO_MERCHANT").length > 0 && (
              <span
                className="mono animate-pulse rounded-full px-3 py-1 text-sm font-semibold text-white"
                style={{ background: "var(--color-alert)" }}
              >
                {queue.filter((o) => o.state === "SENT_TO_MERCHANT").length} new
              </span>
            )}
            <span className="mono inline-flex items-center gap-2 text-xs text-muted">
              <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-accent" : "bg-alert"}`} />
              {connected ? "live" : "offline"}
            </span>
          </div>
        </div>
        <nav className="flex gap-1 px-6">
          {(["orders", "catalogue", "takings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="mono border-b-2 px-4 py-2 text-sm capitalize"
              style={{
                borderColor: tab === t ? "var(--color-ink)" : "transparent",
                color: tab === t ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {t}
              {t === "orders" && queue.length > 0 && ` (${queue.length})`}
            </button>
          ))}
        </nav>
      </header>

      {tab === "orders" && <OrdersTab orders={queue} snap={snap} now={now} />}
      {tab === "catalogue" && (
        <CatalogueTab merchantId={merchantId} products={products} prepMinutes={merchant.prepMinutes} />
      )}
      {tab === "takings" && <TakingsTab orders={done} rate={merchant.commissionRate} />}
    </main>
  );
}

/* -------------------------------- orders -------------------------------- */

function OrdersTab({
  orders, snap, now,
}: {
  orders: Order[];
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  now: number;
}) {
  if (orders.length === 0) {
    return (
      <div className="grid place-items-center py-32 text-center">
        <div>
          <div className="text-5xl">🧾</div>
          <p className="mt-4 text-lg text-ink-2">No orders waiting.</p>
          <p className="mono mt-1 text-sm text-muted">New orders appear here the moment a passenger pays.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} snap={snap} now={now} />
      ))}
    </div>
  );
}

function OrderCard({
  order, snap, now,
}: {
  order: Order;
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  now: number;
}) {
  const [busy, setBusy] = useState(false);
  const flight = snap.flights.find((f) => f.id === order.flightId);
  const waypoint = snap.waypoints.find((w) => w.id === order.deliveryWaypointId);
  const deadlineIn = Math.round((order.promise.promiseDeadline - now) / 1000);
  const urgent = deadlineIn < 300;

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try { await api("/api/order/action", { orderId: order.id, action, ...extra }); }
    finally { setBusy(false); }
  };

  const isNew = order.state === "SENT_TO_MERCHANT";

  return (
    <article
      className="flex flex-col rounded-lg border bg-surface p-4"
      style={{
        borderColor: isNew ? "var(--color-alert)" : "var(--color-line)",
        borderWidth: isNew ? 2 : 1,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="mono text-sm font-semibold">{order.ref}</span>
        <span
          className="mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            background: urgent ? "var(--color-alert-soft)" : "var(--color-surface-2)",
            color: urgent ? "var(--color-alert)" : "var(--color-ink-2)",
          }}
        >
          {mmss(deadlineIn)} left
        </span>
      </div>

      <div className="mono mt-1 text-xs text-muted">
        {flight?.number} · Gate {flight?.gate} · {order.passengerName}
      </div>

      <ul className="mt-3 space-y-1.5">
        {order.lines.map((l) => (
          <li key={l.productId} className="flex items-baseline gap-2 text-sm">
            <span className="mono font-semibold">{l.qty}×</span>
            <span className="flex-1">{l.emoji} {l.name}</span>
            <span className="mono text-xs text-muted">{euros(l.unitPriceCents * l.qty)}</span>
          </li>
        ))}
      </ul>

      <div className="mono mt-3 rounded bg-surface-2 px-3 py-2 text-xs">
        Deliver to <strong>{waypoint?.name}</strong>
      </div>

      <div className="mt-auto pt-4">
        {order.state === "SENT_TO_MERCHANT" && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => act("accept")}
              disabled={busy}
              className="col-span-2 rounded-lg py-3 font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              Accept
            </button>
            <button
              onClick={() => act("reject", { reason: "Item unavailable" })}
              disabled={busy}
              className="rounded-lg border border-line py-3 text-sm disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}

        {order.state === "PREPARING" && (
          <button
            onClick={() => act("ready")}
            disabled={busy}
            className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-signal)" }}
          >
            Mark ready
          </button>
        )}

        {["READY", "ROBOT_ASSIGNED"].includes(order.state) && (
          <div className="mono rounded-lg bg-surface-2 py-3 text-center text-sm text-ink-2">
            {order.state === "READY" ? "Waiting for a unit…" : `${order.robotId} on its way`}
          </div>
        )}

        {order.state === "AT_MERCHANT" && (
          <button
            onClick={() => act("load")}
            disabled={busy}
            className="w-full rounded-lg py-4 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-accent)" }}
          >
            Load {order.compartmentId} → scan to confirm
          </button>
        )}
      </div>
    </article>
  );
}

/* ------------------------------- catalogue ------------------------------ */

function CatalogueTab({
  merchantId, products, prepMinutes,
}: { merchantId: string; products: Product[]; prepMinutes: number }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [prep, setPrep] = useState(prepMinutes);

  const blank = (): Product => ({
    id: "", merchantId, name: "", description: "", category: "food",
    priceCents: 0, available: true, ageRestricted: false, emoji: "🍽️",
  });

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your products</h2>
          <p className="text-sm text-ink-2">Anything you add appears in the passenger app immediately.</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="eyebrow">Default prep time</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number" min={1} max={30} value={prep}
                onChange={(e) => setPrep(Number(e.target.value))}
                onBlur={() => api("/api/catalogue", { action: "prep", merchantId, minutes: prep })}
                className="mono w-20 rounded border border-line bg-surface px-2 py-1.5"
              />
              <span className="text-sm text-muted">min</span>
            </div>
          </label>
          <button
            onClick={() => setEditing(blank())}
            className="rounded-lg px-4 py-2 font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            + Add product
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-surface-2">
              {["", "Product", "Category", "Price", "Available", ""].map((h, i) => (
                <th key={i} className="eyebrow px-3 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-xl">{p.emoji}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{p.description}</div>
                  {p.ageRestricted && (
                    <span className="mono text-[10px]" style={{ color: "var(--color-signal)" }}>
                      age-restricted · collect in store only
                    </span>
                  )}
                </td>
                <td className="mono px-3 py-2 text-xs text-muted">{p.category}</td>
                <td className="mono px-3 py-2">{euros(p.priceCents)}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => api("/api/catalogue", { action: "toggle", productId: p.id })}
                    className="mono rounded-full px-3 py-1 text-xs"
                    style={{
                      background: p.available ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                      color: p.available ? "var(--color-accent)" : "var(--color-muted)",
                    }}
                  >
                    {p.available ? "on sale" : "86'd"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setEditing(p)} className="mono text-xs underline">edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const [draft, setDraft] = useState<Product>({ ...product });
  const [price, setPrice] = useState((product.priceCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/catalogue", {
        action: "upsert",
        product: { ...draft, priceCents: Math.round(parseFloat(price || "0") * 100) },
      });
      onClose();
    } catch { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/api/catalogue", { action: "delete", productId: draft.id });
      onClose();
    } catch { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-6">
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-6">
        <div className="eyebrow">{product.id ? "Edit product" : "New product"}</div>

        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <label className="block">
              <span className="eyebrow">Icon</span>
              <input
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="mt-1 w-full rounded border border-line bg-surface px-3 py-2 text-center text-xl"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Cappuccino"
                className="mt-1 w-full rounded border border-line bg-surface px-3 py-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Description</span>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Double shot, whole or oat milk"
              className="mt-1 w-full rounded border border-line bg-surface px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow">Price (EUR)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="mono mt-1 w-full rounded border border-line bg-surface px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Category</span>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductCategory })}
                className="mono mt-1 w-full rounded border border-line bg-surface px-3 py-2"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded border border-line bg-surface-2 p-3">
            <input
              type="checkbox"
              checked={draft.ageRestricted}
              onChange={(e) => setDraft({ ...draft, ageRestricted: e.target.checked })}
              className="mt-1"
            />
            <span className="text-sm">
              <strong>Age-restricted</strong>
              <span className="block text-xs text-ink-2">
                Alcohol and tobacco can&rsquo;t be handed over by an unattended unit. Marked
                collect-in-store in the passenger app.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {product.id ? (
            <button onClick={remove} disabled={busy} className="mono text-sm" style={{ color: "var(--color-alert)" }}>
              delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2">Cancel</button>
            <button
              onClick={save}
              disabled={busy || !draft.name.trim()}
              className="rounded-lg px-5 py-2 font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-accent)" }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- takings ------------------------------- */

function TakingsTab({ orders, rate }: { orders: Order[]; rate: number }) {
  const gross = orders.reduce((s, o) => s + o.goodsCents, 0);
  const commission = orders.reduce((s, o) => s + o.commissionCents, 0);

  return (
    <div className="p-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Delivered orders" value={String(orders.length)} />
        <Stat label="Gross sales" value={euros(gross)} />
        <Stat label={`Commission (${Math.round(rate * 100)}%)`} value={`− ${euros(commission)}`} tone="signal" />
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
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">
                No completed orders yet.
              </td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="mono px-3 py-2">{o.ref}</td>
                <td className="px-3 py-2">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</td>
                <td className="mono px-3 py-2">{euros(o.goodsCents)}</td>
                <td className="mono px-3 py-2" style={{ color: "var(--color-signal)" }}>
                  − {euros(o.commissionCents)}
                </td>
                <td className="mono px-3 py-2 font-semibold">{euros(o.goodsCents - o.commissionCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mono mt-4 text-xs text-muted">
        The shop issues the fiscal receipt for the goods. We invoice commission separately as a
        B2B e-invoice — three documents, never one.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "signal" }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="eyebrow">{label}</div>
      <div
        className="mono mt-1 text-2xl font-semibold"
        style={{ color: tone ? `var(--color-${tone})` : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
