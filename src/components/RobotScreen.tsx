"use client";

import { useEffect, useState } from "react";
import { api, useSnapshot } from "@/lib/client";
import { mmss } from "@/lib/format";
import type { Order } from "@/domain/types";

/**
 * The unit's own screen — kiosk mode on the robot's Android tablet.
 *
 * Two jobs: play the ad loop while driving (this is the media inventory the
 * revenue model depends on), and run the handover when it arrives.
 */

const ADS = [
  { emoji: "🫒", brand: "Aelia Duty Free", line: "Istrian olive oil, award-winning.", sub: "Delivered to your gate before you board.", bg: "#6a4a6e" },
  { emoji: "☕", brand: "NeedStop", line: "Coffee to your seat in under 10 minutes.", sub: "Scan any gate QR to order.", bg: "#0e6e5c" },
  { emoji: "🍫", brand: "Kraš Bajadera", line: "The Croatian gift that always works.", sub: "Available at Aelia Duty Free.", bg: "#9e6410" },
  { emoji: "🥪", brand: "Apron View", line: "A proper meal, not an airport sandwich.", sub: "Order ahead, collect or delivered.", bg: "#3d5a73" },
];

export function RobotScreen({ unitId }: { unitId: string }) {
  const { snap } = useSnapshot();
  const [adIndex, setAdIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setAdIndex((i) => (i + 1) % ADS.length), 7000);
    return () => clearInterval(t);
  }, []);

  const unit = snap?.units.find((u) => u.id === unitId);
  const order = snap?.orders.find(
    (o) => o.robotId === unitId && ["ARRIVED", "NO_SHOW"].includes(o.state),
  );

  if (!snap || !unit) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: "var(--color-night)" }}>
        <span className="eyebrow">connecting…</span>
      </div>
    );
  }

  /* Keyed by order id, so the keypad state resets for every new handover
   * without an effect reaching in to clear it. */
  if (order) {
    const waypoint = snap.waypoints.find((w) => w.id === order.deliveryWaypointId);
    return <Handover key={order.id} order={order} waypointName={waypoint?.name ?? ""} />;
  }

  /* ------------------------------- ad loop ------------------------------ */
  const ad = ADS[adIndex];
  const destination = snap.orders.find((o) => o.robotId === unitId && o.state === "IN_TRANSIT");
  const destWaypoint = destination
    ? snap.waypoints.find((w) => w.id === destination.deliveryWaypointId)
    : null;

  /* An ETA is only meaningful when the unit is going somewhere on a job.
   * Driving home to the dock is not a delivery and must not read like one. */
  const onJob = Boolean(destWaypoint) || unit.status === "to_merchant";
  const activity =
    destWaypoint ? `Delivering to ${destWaypoint.name}`
    : unit.status === "to_merchant" ? "Collecting from the shop"
    : unit.status === "loading" ? "Loading at the shop"
    : unit.status === "returning" ? "Returning to the dock"
    : unit.status === "held" ? "Held — emergency stop"
    : unit.status === "blocked" ? "Waiting — path blocked"
    : unit.status === "charging" ? "Charging — ready for the next order"
    : "Available — scan any gate QR to order";

  return (
    <div className="flex min-h-screen flex-col" style={{ background: ad.bg, color: "#fff" }}>
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center transition-colors duration-700">
        <div className="text-9xl">{ad.emoji}</div>
        <div className="mono mt-8 text-sm uppercase tracking-[0.3em] opacity-70">
          Sponsored · {ad.brand}
        </div>
        <h1 className="mt-3 max-w-3xl text-5xl font-bold leading-tight tracking-tight">{ad.line}</h1>
        <p className="mt-3 text-2xl opacity-80">{ad.sub}</p>
      </div>

      <footer className="border-t border-white/20 px-10 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="mono text-xs uppercase tracking-widest opacity-60">{unit.name}</div>
            <div className="text-2xl font-semibold">{activity}</div>
          </div>
          <div className="text-right">
            {onJob && unit.etaSeconds ? (
              <>
                <div className="mono text-3xl font-bold">{mmss(unit.etaSeconds)}</div>
                <div className="mono text-xs uppercase tracking-widest opacity-60">to arrival</div>
              </>
            ) : (
              <div className="mono text-sm opacity-60">battery {unit.batteryPct}%</div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------- handover ------------------------------- */

function Handover({
  order, waypointName,
}: {
  order: Order;
  waypointName: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/order/action", { orderId: order.id, action: "handover", code: value });
      setOpened(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code doesn't match");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy || opened) return;
    const next = (code + d).slice(0, 4);
    setCode(next);
    setError(null);
    if (next.length === 4) void submit(next);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api("/api/order/action", { orderId: order.id, action: "handover-complete" });
    } finally {
      setBusy(false);
    }
  };

  if (opened) {
    return (
      <div
        className="grid min-h-screen place-items-center p-10 text-center"
        style={{ background: "var(--color-accent)", color: "#fff" }}
      >
        <div>
          <div className="text-8xl">📦</div>
          <h1 className="mt-6 text-5xl font-bold tracking-tight">
            Compartment {order.compartmentId} is open
          </h1>
          <p className="mt-3 text-2xl opacity-90">
            Take your order — {order.lines.map((l) => l.name).join(", ")}
          </p>
          <button
            onClick={finish}
            disabled={busy}
            className="mono mt-10 rounded-xl bg-white px-12 py-6 text-2xl font-bold disabled:opacity-50"
            style={{ color: "var(--color-accent)" }}
          >
            I&rsquo;ve taken it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-screen place-content-center p-10"
      style={{ background: "var(--color-night)", color: "var(--color-night-ink)" }}
    >
      <div className="mx-auto grid w-full max-w-4xl gap-10 md:grid-cols-2">
        <div>
          <div className="eyebrow" style={{ color: "var(--color-night-muted)" }}>Delivery for</div>
          <h1 className="mt-2 text-5xl font-bold tracking-tight">{order.passengerName}</h1>
          <p className="mono mt-2 text-xl" style={{ color: "var(--color-night-accent)" }}>{order.ref}</p>
          <p className="mt-6 text-xl" style={{ color: "var(--color-night-muted)" }}>{waypointName}</p>
          <ul className="mt-6 space-y-2 text-2xl">
            {order.lines.map((l) => (
              <li key={l.productId}>{l.emoji} {l.qty} × {l.name}</li>
            ))}
          </ul>
          {order.state === "NO_SHOW" && (
            <p className="mono mt-6 text-lg" style={{ color: "var(--color-night-signal)" }}>
              Holding here — enter your code when you arrive.
            </p>
          )}
        </div>

        <div>
          <div className="eyebrow" style={{ color: "var(--color-night-muted)" }}>
            Enter the 4-digit code from your phone
          </div>
          <div className="mono mt-3 flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="grid h-20 flex-1 place-items-center rounded-lg text-4xl font-bold"
                style={{
                  background: "var(--color-night-2)",
                  border: `2px solid ${error ? "var(--color-night-alert)" : "var(--color-night-line)"}`,
                }}
              >
                {code[i] ? "•" : ""}
              </div>
            ))}
          </div>
          {error && (
            <p className="mono mt-3 text-lg" style={{ color: "var(--color-night-alert)" }}>{error}</p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
              <button
                key={i}
                onClick={() => (d === "⌫" ? setCode((c) => c.slice(0, -1)) : d && press(d))}
                disabled={!d || busy}
                className="mono h-20 rounded-lg text-3xl font-semibold disabled:opacity-20"
                style={{
                  background: d ? "var(--color-night-2)" : "transparent",
                  border: d ? "1px solid var(--color-night-line)" : "none",
                  color: "var(--color-night-ink)",
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
