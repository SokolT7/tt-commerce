import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = createAdminClient();
  const [{ count: seatCount }, { data: shops }] = await Promise.all([
    db.from("seats").select("id", { count: "exact", head: true }),
    db.from("merchants").select("slug, name, colour, zone").eq("zone", "airside-schengen").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <div className="eyebrow">Franjo Tuđman Airport (ZAG)</div>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Gate Delivery</h1>
      <p className="mt-4 max-w-2xl text-ink-2">
        In-terminal ordering and delivery. Passengers order from the airport&rsquo;s own shops and
        the order is brought to where they are sitting.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/order"
          className="rounded-lg border border-line bg-surface p-5 transition hover:border-ink"
          style={{ borderTopWidth: 3, borderTopColor: "var(--color-accent)" }}>
          <h2 className="text-lg font-semibold">Order something</h2>
          <p className="mt-2 text-sm text-ink-2">
            The passenger app. Choose a flight, set where you are sitting, and order.
          </p>
          <div className="mono mt-3 text-xs text-muted">/order →</div>
        </Link>

        <Link href="/merchant"
          className="rounded-lg border border-line bg-surface p-5 transition hover:border-ink"
          style={{ borderTopWidth: 3, borderTopColor: "var(--color-slate)" }}>
          <h2 className="text-lg font-semibold">Shop console</h2>
          <p className="mt-2 text-sm text-ink-2">
            For outlet staff. Menu, incoming orders, preparation and takings.
          </p>
          <div className="mono mt-3 text-xs text-muted">/merchant →</div>
        </Link>
      </div>

      <section className="mt-10 rounded-lg border border-line bg-surface p-5">
        <div className="eyebrow">Delivery points</div>
        <p className="mt-2 text-sm text-ink-2">
          A passenger can scan the QR code printed on their seat, drop a pin on the terminal map, or
          pick a gate. All three resolve to the nearest point a unit can actually reach, and the
          walking distance is shown before they pay.
        </p>
        <p className="mono mt-3 text-xs text-muted">
          {seatCount ?? 0} seats surveyed and coded across the Schengen gates
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface-2 p-5">
        <div className="eyebrow">Live shops</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(shops ?? []).map((s) => (
            <span key={s.slug} className="mono rounded-full border border-line bg-surface px-3 py-1 text-xs"
              style={{ borderLeftWidth: 3, borderLeftColor: s.colour }}>{s.name}</span>
          ))}
        </div>
      </section>

      <p className="mono mt-8 text-xs text-muted">
        Robot dispatch runs against a simulated fleet until the vendor interface is available.
      </p>
    </main>
  );
}
