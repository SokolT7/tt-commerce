"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/server/engine";

/**
 * One SSE connection per surface. The server pushes a full snapshot on every
 * change, which is small enough at demo scale and removes a whole class of
 * "two screens disagree" bugs — the thing the demo is meant to prove.
 */
export function useSnapshot(): { snap: Snapshot | null; connected: boolean } {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastMessageAt = Date.now();
    let cancelled = false;

    const close = () => {
      // Always drop the old socket before opening another. Without this a
      // retry storm stacks EventSources until the browser hits its
      // six-connection-per-origin cap and every surface hangs on "connecting".
      source?.close();
      source = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const scheduleRetry = (delay = 1500) => {
      if (cancelled || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      close();
      lastMessageAt = Date.now();
      source = new EventSource("/api/stream");
      source.onopen = () => setConnected(true);
      source.onmessage = (e) => {
        lastMessageAt = Date.now();
        setConnected(true);
        try {
          setSnap(JSON.parse(e.data) as Snapshot);
        } catch {
          /* keep the last good snapshot rather than blanking the screen */
        }
      };
      source.onerror = () => {
        setConnected(false);
        close();
        scheduleRetry();
      };
    };

    // A laptop waking from sleep leaves a socket that looks open but is dead:
    // nothing arrives and no error fires. Watch for silence instead — the
    // server sends a keep-alive every 15s.
    //
    // Deliberately NOT gated on visibility. A hidden tab still holds a live
    // connection, because surfaces run on second monitors and backgrounded
    // tablets, and a stale ops console is worse than an extra socket. The
    // check only skips while hidden because background timers are throttled,
    // which would otherwise read as a false timeout.
    watchdog = setInterval(() => {
      if (cancelled || document.visibilityState === "hidden") return;
      if (Date.now() - lastMessageAt > 25_000) {
        setConnected(false);
        connect();
      }
    }, 5_000);

    // Coming back to a tab is the moment a dead socket becomes obvious.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!source || source.readyState === EventSource.CLOSED) connect();
    };
    const onOnline = () => connect();

    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", close);

    return () => {
      cancelled = true;
      if (watchdog) clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, []);

  return { snap, connected };
}

/** A clock that ticks locally so countdowns move between snapshots. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export async function api<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed");
  return json as T;
}
