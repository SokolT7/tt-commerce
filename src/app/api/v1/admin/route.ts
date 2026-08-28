import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Every admin mutation goes through here, behind one guard. */
async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from("platform_admins")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  return data ? db : null;
}

export async function POST(req: Request) {
  const db = await requireAdmin();
  if (!db) return Response.json({ error: "Not authorised" }, { status: 403 });

  const body = await req.json() as {
    action: string;
    merchantId?: string; open?: boolean;
    commissionRate?: number; prepMinutes?: number;
    leadMinutes?: number;
  };

  switch (body.action) {
    case "shop-open": {
      if (!body.merchantId) return Response.json({ error: "merchantId required" }, { status: 400 });
      const { error } = await db.from("merchants")
        .update({ open: Boolean(body.open) }).eq("id", body.merchantId);
      if (error) return Response.json({ error: error.message }, { status: 400 });
      break;
    }
    case "shop-terms": {
      if (!body.merchantId) return Response.json({ error: "merchantId required" }, { status: 400 });
      const patch: { commission_rate?: number; prep_minutes?: number } = {};
      if (body.commissionRate !== undefined) {
        // Stored as a fraction; reject anything outside a sane commercial range
        // rather than letting a typo write 15.0 instead of 0.15.
        if (body.commissionRate < 0 || body.commissionRate > 0.5) {
          return Response.json({ error: "Commission must be between 0% and 50%" }, { status: 400 });
        }
        patch.commission_rate = body.commissionRate;
      }
      if (body.prepMinutes !== undefined) {
        if (body.prepMinutes < 1 || body.prepMinutes > 60) {
          return Response.json({ error: "Prep time must be between 1 and 60 minutes" }, { status: 400 });
        }
        patch.prep_minutes = Math.round(body.prepMinutes);
      }
      if (Object.keys(patch).length === 0) {
        return Response.json({ error: "Nothing to change" }, { status: 400 });
      }
      const { error } = await db.from("merchants").update(patch).eq("id", body.merchantId);
      if (error) return Response.json({ error: error.message }, { status: 400 });
      break;
    }
    case "rebase-flights": {
      const { error } = await db.rpc("rebase_flight_board", {
        lead_minutes: body.leadMinutes ?? 12,
      });
      if (error) return Response.json({ error: error.message }, { status: 400 });
      break;
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
