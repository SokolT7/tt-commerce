import { placeOrder } from "@/server/ordering";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    // Anonymous customers are real auth users; the profile row is created on
    // first order so row-level security can key off auth.uid().
    if (user) {
      const db = createAdminClient();
      await db.from("customer_profiles")
        .upsert({ id: user.id, display_name: body.passengerName ?? null }, { onConflict: "id" });
    }

    const result = await placeOrder({ ...body, customerId: user?.id ?? null });
    if (!result.ok) return Response.json({ error: result.reason }, { status: 409 });

    const db = createAdminClient();
    const { data } = await db.from("order_details").select("*").eq("id", result.orderId).single();
    return Response.json({ order: data });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not place the order" }, { status: 400 });
  }
}
