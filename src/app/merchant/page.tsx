import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Sends staff straight to their own shop; shows a picker only if they run several. */
export default async function MerchantIndex() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/merchant/login");

  const db = createAdminClient();
  const { data: links } = await db
    .from("merchant_staff")
    .select("merchant_id, role, merchants(slug, name, blurb, colour)")
    .eq("user_id", user.id);

  const shops = (links ?? []).flatMap((l) =>
    l.merchants ? [{ ...l.merchants, role: l.role }] : []);

  if (shops.length === 1) redirect(`/merchant/${shops[0].slug}`);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow">Shop console</div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Choose your outlet</h1>
      {shops.length === 0 && (
        <p className="mt-4 text-ink-2">
          This account is not linked to a shop yet. Ask an administrator to add you.
        </p>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {shops.map((s) => (
          <Link key={s.slug} href={`/merchant/${s.slug}`}
                className="rounded-lg border border-line bg-surface p-5 transition hover:border-ink"
                style={{ borderLeftWidth: 4, borderLeftColor: s.colour }}>
            <h2 className="text-lg font-semibold">{s.name}</h2>
            <p className="mt-1 text-sm text-ink-2">{s.blurb}</p>
            <div className="eyebrow mt-2">{s.role}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
