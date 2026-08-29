import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * What the unit's own screen should be showing.
 *
 * Unauthenticated, because a kiosk bolted to a robot has no one to log in. It
 * therefore returns the minimum a person standing in front of the machine
 * could already see — never the handover code, the passenger's name, or
 * anything about other orders.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = createAdminClient();

  const { data: robot } = await db
    .from("robots").select("id, name, status, battery_pct, zone")
    .eq("id", id).maybeSingle();
  if (!robot) return Response.json({ error: "Unknown unit" }, { status: 404 });

  const { data: order } = await db
    .from("orders")
    .select("id, ref, state, compartment_id, handover_locked_at, nav_waypoint_id")
    .eq("robot_id", id).in("state", ["ARRIVED", "NO_SHOW"])
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  let job = null;
  if (order) {
    const { data: lines } = await db
      .from("order_lines").select("name, emoji, qty").eq("order_id", order.id);
    const { data: wp } = await db
      .from("waypoints").select("name").eq("id", order.nav_waypoint_id).maybeSingle();
    job = {
      orderId: order.id,
      ref: order.ref,
      compartmentId: order.compartment_id,
      locked: Boolean(order.handover_locked_at),
      waypointName: wp?.name ?? null,
      lines: (lines ?? []).map((l) => ({ name: l.name, emoji: l.emoji, qty: l.qty })),
    };
  }

  return Response.json({
    robot: {
      id: robot.id, name: robot.name, status: robot.status,
      batteryPct: Number(robot.battery_pct), zone: robot.zone,
    },
    job,
  });
}
