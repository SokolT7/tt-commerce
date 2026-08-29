"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/hooks";
import {
  IconRobot, IconCheck, IconAlert, IconLock, IconBag, IconPin,
} from "@/components/ui";

/**
 * The screen on the unit itself.
 *
 * Two jobs: look like something worth walking up to while it is driving, and
 * run the handover when it arrives. Everything is sized for a glance from
 * standing distance, and there is no navigation — a passenger cannot leave
 * this screen, and neither can anyone else.
 */

interface Job {
  orderId: string;
  ref: string;
  compartmentId: string | null;
  locked: boolean;
  waypointName: string | null;
  lines: { name: string; emoji: string; qty: number }[];
}
interface Snapshot {
  robot: { id: string; name: string; status: string; batteryPct: number; zone: string };
  job: Job | null;
}

const ADS = [
  { emoji: "🫒", brand: "Aelia Duty Free", line: "Istrian olive oil, award-winning.", sub: "Delivered before you board.", bg: "#6a4a6e" },
  { emoji: "☕", brand: "Gate Café", line: "Coffee to your seat in under ten minutes.", sub: "Scan any seat code to order.", bg: "#a9603c" },
  { emoji: "🥪", brand: "NeedStop", line: "A proper sandwich, not an airport one.", sub: "Ordered from your phone.", bg: "#0d6b58" },
  { emoji: "🍫", brand: "Kraš Bajadera", line: "The Croatian gift that always works.", sub: "At Aelia Duty Free.", bg: "#7c3b47" },
];

export function RobotScreen({ unitId }: { unitId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ad, setAd] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/robot/${encodeURIComponent(unitId)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Unit not found");
      setSnap(body as Snapshot);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server");
    }
  }, [unitId]);

  // A kiosk cannot be refreshed by hand, so it polls. Realtime would need an
  // authenticated session this device does not have.
  useEffect(() => {
    // load is async and only sets state after awaiting the fetch, which the
    // rule cannot see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setAd((i) => (i + 1) % ADS.length), 7000);
    return () => clearInterval(t);
  }, []);

  const job = snap?.job ?? null;

  if (error) {
    return (
      <Full bg="var(--color-night)">
        <IconAlert size={44} />
        <h1 className="mt-5 text-[34px] font-semibold">{error}</h1>
        <p className="mt-2 text-[17px] opacity-70">Unit “{unitId}”</p>
      </Full>
    );
  }

  if (!snap) {
    return <Full bg="var(--color-night)"><p className="text-[20px] opacity-60">Starting up…</p></Full>;
  }

  /* ------------------------------------------------------------- handover */
  // Keyed on the order, so moving to the next job remounts the pad with clean
  // state rather than an effect reaching in to reset it.
  if (job) return <Handover key={job.orderId} job={job} onDone={load} />;

  /* -------------------------------------------------------------- ad loop */
  const a = ADS[ad];
  const driving = ["to_merchant", "in_transit", "returning"].includes(snap.robot.status);
  return (
    <main className="flex min-h-screen flex-col transition-colors duration-700"
          style={{ background: a.bg, color: "white" }}>
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
        <div className="text-[120px] leading-none">{a.emoji}</div>
        <p className="mt-8 text-[15px] uppercase tracking-[0.3em] opacity-70">Sponsored · {a.brand}</p>
        <h1 className="mt-3 max-w-[22ch] text-[46px] font-semibold leading-tight">{a.line}</h1>
        <p className="mt-3 text-[22px] opacity-80">{a.sub}</p>
      </div>
      <footer className="flex items-center justify-between border-t border-white/20 px-12 py-6">
        <div className="flex items-center gap-3">
          <IconRobot size={26} />
          <div>
            <p className="text-[13px] uppercase tracking-widest opacity-60">{snap.robot.name}</p>
            <p className="text-[20px] font-semibold">
              {driving ? "On a delivery" : "Available — scan any seat code to order"}
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-[15px] opacity-60">
          <IconBag size={16} /> battery {Math.round(snap.robot.batteryPct)}%
        </p>
      </footer>
    </main>
  );
}

/**
 * The handover pad. Mounted per order, so its state cannot survive into the
 * next delivery — the previous passenger's half-typed code must never be
 * sitting on screen for the next one.
 */
function Handover({ job, onDone }: { job: Job; onDone: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(job.locked);

  const submit = async (value: string) => {
    setBusy(true); setCodeError(null);
    try {
      await api(`/api/v1/orders/${job.orderId}/action`, { action: "handover", code: value });
      setOpened(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "That code doesn't match";
      setCodeError(message);
      setCode("");
      if (/staff/i.test(message)) setLocked(true);
    } finally { setBusy(false); }
  };

  const press = (d: string) => {
    if (busy || opened || locked) return;
    const next = (code + d).slice(0, 4);
    setCode(next);
    setCodeError(null);
    if (next.length === 4) void submit(next);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/orders/${job.orderId}/action`, { action: "handover-complete" });
      await onDone();
    } finally { setBusy(false); }
  };

  if (opened) {
    return (
      <Full bg="var(--color-accent)">
        <IconCheck size={64} strokeWidth={2.2} />
        <h1 className="mt-6 text-[46px] font-semibold leading-tight">
          Compartment {job.compartmentId} is open
        </h1>
        <p className="mt-3 text-[22px] opacity-90">
          Take your order — {job.lines.map((l) => l.name).join(", ")}
        </p>
        <button onClick={finish} disabled={busy}
          className="pressable mt-12 rounded-[18px] bg-white px-14 py-6 text-[24px] font-semibold disabled:opacity-50"
          style={{ color: "var(--color-accent)" }}>
          I&rsquo;ve taken it
        </button>
      </Full>
    );
  }

  return (
    <main className="grid min-h-screen grid-cols-1 gap-10 p-10 md:grid-cols-2"
      style={{ background: "var(--color-night)", color: "var(--color-night-ink)" }}>
      <div>
        <p className="text-[15px] uppercase tracking-widest opacity-50">Delivery for</p>
        <h1 className="mt-2 text-[44px] font-semibold leading-none tnum">{job.ref}</h1>
        {job.waypointName && (
          <p className="mt-4 flex items-center gap-2 text-[19px] opacity-70">
            <IconPin size={19} />{job.waypointName}
          </p>
        )}
        <ul className="mt-8 space-y-3 text-[24px]">
          {job.lines.map((l, i) => (
            <li key={i}><span aria-hidden>{l.emoji}</span> {l.qty} × {l.name}</li>
          ))}
        </ul>
      </div>

      <div>
        {locked ? (
          <div className="rounded-[var(--radius-xl)] p-8 text-center"
               style={{ background: "var(--color-alert)", color: "white" }}>
            <IconLock size={40} />
            <h2 className="mt-4 text-[26px] font-semibold">Locked</h2>
            <p className="mt-2 text-[17px] opacity-90">
              Too many wrong codes were entered. Please ask a member of staff.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[15px] uppercase tracking-widest opacity-50">
              Enter the code from your phone
            </p>
            <div className="mt-4 flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}
                  className="grid h-24 flex-1 place-items-center rounded-[16px] text-[40px] font-semibold"
                  style={{ background: "var(--color-night-2)",
                           border: `2px solid ${codeError ? "var(--color-night-alert)" : "var(--color-night-line)"}` }}>
                  {code[i] ? "•" : ""}
                </div>
              ))}
            </div>
            {codeError && (
              <p className="mt-3 text-[18px]" style={{ color: "var(--color-night-alert)" }}>{codeError}</p>
            )}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                <button key={i} disabled={!d || busy}
                  onClick={() => d === "⌫" ? setCode((c) => c.slice(0, -1)) : d && press(d)}
                  className="pressable h-24 rounded-[16px] text-[32px] font-semibold disabled:opacity-20"
                  style={{ background: d ? "var(--color-night-2)" : "transparent",
                           border: d ? "1px solid var(--color-night-line)" : "none" }}>
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Full({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-10 text-center"
          style={{ background: bg, color: "white" }}>
      <div className="flex flex-col items-center">{children}</div>
    </main>
  );
}
