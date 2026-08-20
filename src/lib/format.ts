export function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "in 12 min" / "3 min ago" — the demo lives on relative time. */
export function inMinutes(target: number, now: number): string {
  const mins = Math.round((target - now) / 60000);
  if (mins > 0) return `in ${mins} min`;
  if (mins === 0) return "now";
  return `${Math.abs(mins)} min ago`;
}

export function mmss(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
