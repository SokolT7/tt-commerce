"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type DB = SupabaseClient<Database>;

let browserClient: DB | null = null;
export function supabase(): DB {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}

/**
 * Subscribes to a Postgres table and re-runs the supplied loader whenever it
 * changes. Realtime replaces the demo's server-sent events: the database is
 * now the single source of truth every surface reads from.
 */
export function useLiveQuery<T>(
  tables: string[],
  loader: (db: DB) => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  // Writing a ref during render is not allowed; sync it after commit instead.
  useEffect(() => { loaderRef.current = loader; });

  const reload = useCallback(() => {
    loaderRef.current(supabase())
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, []);

  useEffect(() => {
    reload();
    const db = supabase();
    const channel = db.channel(`live:${tables.join("-")}:${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => reload());
    }
    channel.subscribe();
    return () => { void db.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  return { data, error, reload };
}

/** A clock that ticks locally so countdowns move between database updates. */
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
