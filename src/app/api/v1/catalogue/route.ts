import { loadTerminal, loadMerchants, loadProducts, loadFlights } from "@/server/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Everything the ordering app needs to render, in one request. */
export async function GET() {
  const db = createAdminClient();
  const [terminal, merchants, products, flights, categories, optionGroups, options] = await Promise.all([
    loadTerminal(), loadMerchants(), loadProducts(), loadFlights(),
    db.from("product_categories").select("*").order("sort_order"),
    db.from("product_option_groups").select("*").order("sort_order"),
    db.from("product_options").select("*").order("sort_order"),
  ]);

  return Response.json({
    now: Date.now(),
    zones: terminal.zones,
    waypoints: terminal.waypoints,
    edges: terminal.edges,
    merchants,
    products,
    categories: categories.data ?? [],
    optionGroups: optionGroups.data ?? [],
    options: options.data ?? [],
    flights,
  });
}
