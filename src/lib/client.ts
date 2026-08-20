"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/server/engine";

/**
 * One SSE connection per surface. The server pushes a full snapshot on every
 * change, which is small enough at demo scale and removes a whole class of
 * "two screens disagree" bugs — the thing the demo is meant to prove.
 */
export function useSnapshot(): { snap: Snapshot | null; connected: boolean } {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource("/api/stream");
      source.onopen = () => setConnected(true);
      source.onmessage = (e) => {
        try {
          setSnap(JSON.parse(e.data) as Snapshot);
        } catch {
          /* keep the last good snapshot rather than blanking the screen */
        }
      };
      source.onerror = () => {
        setConnected(false);
        source?.close();
        retry.current = setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retry.current) clearTimeout(retry.current);
      source?.close();
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
