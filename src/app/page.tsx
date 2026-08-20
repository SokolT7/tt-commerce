"use client";

import Link from "next/link";
import { useSnapshot, api } from "@/lib/client";
import { useState } from "react";

const SURFACES = [
  { href: "/order", label: "Customer", role: "Phone", detail: "Order from a gate seat. Scan-to-order, tracking, handover code.", colour: "var(--color-accent)" },
  { href: "/merchant", label: "Merchant", role: "Tablet", detail: "Back of house. Catalogue, order queue, prepare, load compartment.", colour: "var(--color-slate)" },
  { href: "/ops", label: "Operations", role: "Laptop", detail: "Live fleet map, missions, incidents, emergency hold, demo controls.", colour: "var(--color-plum)" },
  { href: "/robot/SB-01", label: "Robot screen", role: "Second tablet", detail: "Ad loop in transit, code entry on arrival, compartment release.", colour: "var(--color-signal)" },
];

export default function Launcher() {
  const { snap, connected } = useSnapshot();
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try { await api("/api/demo", { action: "reset" }); } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen mx-auto max-w-5xl px-6 py-12">
      <div className="eyebrow">Demo launcher · Franjo Tuđman Airport (ZAG)</div>
      <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight leading-none">
        Gate Delivery
      </h1>
      <p className="mt-4 max-w-2xl text-ink-2 leading-relaxed">
        Open each surface on its own device. They share one live state — accept an order
        on the merchant tablet and the passenger&rsquo;s phone updates in the same second.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="mono inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-accent" : "bg-alert"}`} />
          {connected ? "live" : "reconnecting"}
        </span>
        {snap && (
          <>
            <span className="mono rounded-full border border-line bg-surface px-3 py-1">
              {snap.orders.length} orders
            </span>
            <span className="mono rounded-full border border-line bg-surface px-3 py-1">
              {snap.units.length} units
            </span>
          </>
        )}
        <button
          onClick={reset}
          disabled={busy}
          className="mono rounded-full border border-line bg-surface px-3 py-1 hover:border-ink disabled:opacity-50"
        >
          {busy ? "resetting…" : "reset scenario"}
        </button>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-lg border border-line bg-surface p-5 transition hover:border-ink"
            style={{ borderTopWidth: 3, borderTopColor: s.colour }}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{s.label}</h2>
              <span className="eyebrow">{s.role}</span>
            </div>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">{s.detail}</p>
            <div className="mono mt-3 text-xs text-muted group-hover:text-ink">{s.href} →</div>
          </Link>
        ))}
      </div>

      <section className="mt-12 rounded-lg border border-line bg-surface-2 p-5">
        <div className="eyebrow">Say this out loud in the demo</div>
        <ul className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
          <li><strong className="text-ink">Simulated:</strong> the robot, the flight board, payments.</li>
          <li><strong className="text-ink">Reconstructed:</strong> gate layout and walking distances — pending an MZLZ survey.</li>
          <li><strong className="text-ink">Out of scope:</strong> live FIDS, fiscalisation, POS, Wi-Fi location, media booking.</li>
          <li><strong className="text-ink">Real:</strong> everything else — state machine, acceptance engine, cross-device sync.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="eyebrow">Seven-minute script</div>
        <ol className="mono mt-3 space-y-1.5 text-xs text-ink-2">
          <li>1 — Phone: scan gate 7, pick flight OU 654, order a cappuccino and a toastie.</li>
          <li>2 — Point out the spirits marked <em>collect in store</em>: the catalogue enforces the age rule.</li>
          <li>3 — Merchant tablet: the order is already there. Accept → Ready → Load compartment.</li>
          <li>4 — Robot screen plays its ad loop while it drives. Phone shows a live ETA.</li>
          <li>5 — Ops console: inject a gate change. Watch it reroute and notify the passenger.</li>
          <li>6 — Robot arrives. Enter the code. Compartment opens.</li>
          <li>7 — Order against LH 1727 (boards in 12 min) — refused, store collection offered.</li>
        </ol>
      </section>
    </main>
  );
}
