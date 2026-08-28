import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Resolves the QR token printed on a seat into a delivery location. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = createAdminClient();
  const { data, error } = await db
    .from("seats")
    .select("id, zone, gate, row_label, seat_label, x, y, nav_waypoint_id, walk_metres, active")
    .eq("qr_token", decodeURIComponent(token))
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || !data.active) return Response.json({ error: "That seat code is not recognised" }, { status: 404 });

  return Response.json({
    seat: {
      id: data.id, zone: data.zone, gate: data.gate,
      rowLabel: data.row_label, seatLabel: data.seat_label,
      x: Number(data.x), y: Number(data.y),
      navWaypointId: data.nav_waypoint_id, walkMetres: Number(data.walk_metres),
    },
  });
}
