import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  acceptOrder, rejectOrder, markReady, loadCompartment,
  verifyHandover, completeHandover, cancelOrder, assertStaffOwns,
} from "@/server/workflow";

export const dynamic = "force-dynamic";

const STAFF_ACTIONS = ["accept", "reject", "ready", "load", "cancel"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { action, reason, code } = await req.json();
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (STAFF_ACTIONS.includes(action)) {
      if (!user) return Response.json({ error: "Sign in to manage orders" }, { status: 401 });
      await assertStaffOwns(user.id, id);
    }

    switch (action) {
      case "accept": await acceptOrder(id); break;
      case "reject": await rejectOrder(id, reason || "Item unavailable"); break;
      case "ready":  await markReady(id); break;
      case "load":   await loadCompartment(id); break;
      case "cancel": {
        const why = (reason ?? "").trim();
        // The passenger is told this verbatim, so it cannot be blank.
        if (!why) return Response.json({ error: "Give a reason for cancelling" }, { status: 400 });
        await cancelOrder(id, why);
        break;
      }
      case "handover": {
        const r = await verifyHandover(id, code ?? "");
        if (!r.ok) return Response.json({ error: r.reason }, { status: 400 });
        break;
      }
      case "handover-complete": await completeHandover(id); break;
      default: return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    const db = createAdminClient();
    const { data } = await db.from("order_details").select("*").eq("id", id).single();
    return Response.json({ order: data });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 400 });
  }
}
