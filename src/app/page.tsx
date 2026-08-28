import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SURFACES = [
  {
    href: "/order", title: "Order something", role: "Passenger",
    body: "Choose a flight, set where you're sitting, and order from the terminal's shops.",
    colour: "var(--color-accent)",
  },
  {
    href: "/merchant", title: "Shop console", role: "Outlet staff",
    body: "Menu, incoming orders, preparation and takings for a single shop.",
    colour: "var(--color-hue-slate)",
  },
  {
    href: "/admin", title: "Operations", role: "Administrator",
    body: "Everything across the estate — orders, shops, fleet, incidents and the terminal.",
    colour: "var(--color-ink)",
  },
];

export default async function Home() {
  const db = createAdminClient();
  const [{ count: seatCount }, { data: shops }] = await Promise.all([
    db.from("seats").select("id", { count: "exact", head: true }),
    db.from("merchants").select("slug, name, colour, zone").eq("zone", "airside-schengen").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="label">Franjo Tuđman Airport · ZAG</p>
      <h1 className="headline mt-3 text-[44px] font-semibold leading-[1.05] sm:text-[54px]">
        Gate Delivery
      </h1>
      <p className="prose-balance mt-4 max-w-xl text-[17px] leading-relaxed text-[var(--color-ink-2)]">
        In-terminal ordering and delivery. Passengers order from the airport&rsquo;s own shops and
        it&rsquo;s brought to where they&rsquo;re sitting.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {SURFACES.map((s, i) => (
          <Link key={s.href} href={s.href}
            className="pressable rise group rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
            style={{ animationDelay: `${i * 60}ms` }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.colour }} />
            <h2 className="mt-3 text-[17px] font-semibold">{s.title}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">{s.body}</p>
            <p className="mt-3 text-[12px] font-medium text-[var(--color-muted)]">{s.role}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-[15px] font-semibold">Delivery points</h2>
        <p className="prose-balance mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          A passenger can scan the QR code printed on their seat, drop a pin on the terminal map, or
          pick a gate. All three resolve to the nearest point a unit can actually reach, and the
          walking distance is shown before they pay.
        </p>
        <p className="mt-3 text-[13px] font-medium tnum text-[var(--color-accent)]">
          {seatCount ?? 0} seats surveyed and coded across the Schengen gates
        </p>
      </section>

      <section className="mt-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] p-5">
        <h2 className="text-[15px] font-semibold">Live shops</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(shops ?? []).map((s) => (
            <span key={s.slug}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-xs)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />
              {s.name}
            </span>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[12.5px] text-[var(--color-muted)]">
        Robot dispatch runs against a simulated fleet until the vendor interface is available.
      </p>
    </main>
  );
}
