"use client";

import { useState } from "react";
import { api, useNow, useSnapshot } from "@/lib/client";
import { euros, mmss } from "@/lib/format";
import { TerminalMap } from "@/components/TerminalMap";

const CONTROLS = [
  { action: "gate-change", label: "Inject gate change", tone: "signal", hint: "The failure that kills gate delivery" },
  { action: "block", label: "Block a path", tone: "signal", hint: "20 s obstruction, then auto-resume" },
  { action: "no-show", label: "Passenger no-show", tone: "signal", hint: "Holds, then escalates to a runner" },
  { action: "clear-faults", label: "Clear faults", tone: "muted", hint: "Operator intervention" },
  { action: "reset", label: "Reset scenario", tone: "muted", hint: "Clean state, rebuilt flight board" },
] as const;

export default function OpsConsole() {
  const { snap, connected } = useSnapshot();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState(false);

  const run = async (action: string) => {
    // Reset destroys every order in the system — never on a single tap.
    if (action === "reset" && !pendingReset) { setPendingReset(true); return; }
    setBusy(action);
    try { await api("/api/demo", { action }); }
    finally { setBusy(null); setPendingReset(false); }
  };

  if (!snap) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: "var(--color-night)" }}>
        <span className="eyebrow">connecting…</span>
      </div>
    );
  }

  const live = snap.orders.filter(
    (o) => !["COMPLETED", "REJECTED", "CANCELLED", "ABORTED"].includes(o.state),
  );

  return (
    <main className="min-h-screen" style={{ background: "var(--color-night)", color: "var(--color-night-ink)" }}>
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3"
        style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
      >
        <div>
          <div className="eyebrow" style={{ color: "var(--color-night-muted)" }}>
            Operations console · ZAG airside Schengen
          </div>
          <h1 className="text-xl font-bold tracking-tight">Fleet &amp; orders</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-xs" style={{ color: "var(--color-night-muted)" }}>
            {connected ? "● live" : "○ reconnecting"} · {new Date(now).toLocaleTimeString("en-GB")}
          </span>
          <button
            onClick={() => run(snap.held ? "hold-off" : "hold-on")}
            disabled={busy !== null}
            className="rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
            style={{ background: snap.held ? "var(--color-night-accent)" : "var(--color-alert)" }}
          >
            {snap.held ? "Release hold" : "Emergency hold"}
          </button>
        </div>
      </header>

      {snap.held && (
        <div
          className="mono px-6 py-2 text-sm font-semibold"
          style={{ background: "var(--color-alert)", color: "#fff" }}
        >
          EMERGENCY HOLD ACTIVE — all units stopped, escape routes clear
        </div>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
          >
            <div className="eyebrow mb-3" style={{ color: "var(--color-night-muted)" }}>
              Terminal — live positions
            </div>
            <TerminalMap
              waypoints={snap.waypoints}
              edges={snap.edges}
              units={snap.units}
              zones={["airside-schengen", "airside-non-schengen"]}
              dark
            />
            <div className="mono mt-3 flex flex-wrap gap-4 text-[10px]" style={{ color: "var(--color-night-muted)" }}>
              <span>● gates</span>
              <span>■ merchants</span>
              <span>⬭ docks</span>
              <span style={{ color: "var(--color-night-signal)" }}>amber = non-Schengen (sealed — no route across)</span>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {snap.units.map((u) => (
              <div
                key={u.id}
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{u.name}</span>
                  <span
                    className="mono rounded px-2 py-0.5 text-[10px] uppercase"
                    style={{
                      background: ["fault", "blocked", "held"].includes(u.status)
                        ? "var(--color-alert)" : "var(--color-night-3)",
                      color: ["fault", "blocked", "held"].includes(u.status)
                        ? "#fff" : "var(--color-night-ink)",
                    }}
                  >
                    {u.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mono mt-2 grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--color-night-muted)" }}>
                  <span>batt {u.batteryPct}%</span>
                  <span>eta {mmss(u.etaSeconds ?? 0)}</span>
                  <span>@ {u.waypointId ?? "—"}</span>
                </div>
                <div className="mt-3 flex gap-1">
                  {u.compartments.map((c) => (
                    <div
                      key={c.id}
                      title={`${c.label}: ${c.occupied ? "loaded" : "empty"}`}
                      className="mono flex-1 rounded py-1 text-center text-[10px]"
                      style={{
                        background: c.occupied ? "var(--color-night-accent)" : "var(--color-night-3)",
                        color: c.occupied ? "var(--color-night)" : "var(--color-night-muted)",
                      }}
                    >
                      {c.id}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section
            className="rounded-lg border"
            style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
          >
            <div className="eyebrow px-4 py-3" style={{ color: "var(--color-night-muted)" }}>
              Live orders ({live.length})
            </div>
            <table className="w-full text-sm">
              <tbody>
                {live.length === 0 && (
                  <tr><td className="px-4 py-6 text-center" style={{ color: "var(--color-night-muted)" }}>
                    No live orders.
                  </td></tr>
                )}
                {live.map((o) => {
                  const late = o.slaMissed;
                  return (
                    <tr key={o.id} className="border-t" style={{ borderColor: "var(--color-night-line)" }}>
                      <td className="mono px-4 py-2">{o.ref}</td>
                      <td className="px-4 py-2" style={{ color: "var(--color-night-muted)" }}>
                        {snap.merchants.find((m) => m.id === o.merchantId)?.name}
                      </td>
                      <td className="mono px-4 py-2 text-xs">{o.state}</td>
                      <td className="mono px-4 py-2 text-xs">{o.robotId ?? "—"}</td>
                      <td className="mono px-4 py-2 text-right text-xs"
                          style={{ color: late ? "var(--color-night-alert)" : "var(--color-night-muted)" }}>
                        {late ? "SLA MISSED" : mmss((o.promise.promiseDeadline - now) / 1000)}
                      </td>
                      <td className="mono px-4 py-2 text-right">{euros(o.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-4">
          <section
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
          >
            <div className="eyebrow" style={{ color: "var(--color-night-muted)" }}>Demo controls</div>
            <p className="mono mt-2 text-[10px] leading-relaxed" style={{ color: "var(--color-night-muted)" }}>
              Not part of the product. These inject the failures that make the demo credible.
            </p>
            <div className="mt-3 space-y-2">
              {CONTROLS.map((c) => (
                <button
                  key={c.action}
                  onClick={() => run(c.action)}
                  disabled={busy !== null}
                  className="w-full rounded border px-3 py-2.5 text-left text-sm disabled:opacity-40"
                  style={{
                    borderColor: c.action === "reset" && pendingReset
                      ? "var(--color-night-alert)"
                      : c.tone === "signal" ? "var(--color-night-signal)" : "var(--color-night-line)",
                    color: c.action === "reset" && pendingReset
                      ? "var(--color-night-alert)"
                      : c.tone === "signal" ? "var(--color-night-signal)" : "var(--color-night-ink)",
                  }}
                >
                  <div className="font-semibold">
                    {busy === c.action ? "…"
                      : c.action === "reset" && pendingReset ? "Tap again to confirm"
                      : c.label}
                  </div>
                  <div className="mono text-[10px]" style={{ color: "var(--color-night-muted)" }}>
                    {c.action === "reset" && pendingReset
                      ? "deletes every order — no undo"
                      : c.hint}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section
            className="rounded-lg border"
            style={{ borderColor: "var(--color-night-line)", background: "var(--color-night-2)" }}
          >
            <div className="eyebrow px-4 py-3" style={{ color: "var(--color-night-muted)" }}>Incident log</div>
            <ol className="no-bar max-h-[420px] overflow-y-auto">
              {snap.incidents.map((i) => (
                <li
                  key={i.id}
                  className="border-t px-4 py-2"
                  style={{ borderColor: "var(--color-night-line)" }}
                >
                  <div className="mono flex items-baseline gap-2 text-[10px]" style={{ color: "var(--color-night-muted)" }}>
                    <span>{new Date(i.at).toLocaleTimeString("en-GB")}</span>
                    <span
                      style={{
                        color: i.severity === "critical" ? "var(--color-night-alert)"
                          : i.severity === "warn" ? "var(--color-night-signal)"
                          : "var(--color-night-accent)",
                      }}
                    >
                      {i.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs">{i.message}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
