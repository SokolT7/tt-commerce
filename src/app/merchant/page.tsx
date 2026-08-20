"use client";

import Link from "next/link";
import { useSnapshot } from "@/lib/client";

export default function MerchantPicker() {
  const { snap } = useSnapshot();
  const merchants = snap?.merchants.filter((m) => m.zone === "airside-schengen") ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow">Merchant tablet · back of house</div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Sign in to your shop</h1>
      <p className="mt-2 text-ink-2">Pick the outlet this tablet belongs to.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {merchants.map((m) => (
          <Link
            key={m.id}
            href={`/merchant/${m.id}`}
            className="rounded-lg border border-line bg-surface p-5 transition hover:border-ink"
            style={{ borderLeftWidth: 4, borderLeftColor: m.colour }}
          >
            <h2 className="text-lg font-semibold">{m.name}</h2>
            <p className="mt-1 text-sm text-ink-2">{m.blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
