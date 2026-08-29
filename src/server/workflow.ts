import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransition } from "@/domain/orders/machine";
import type { OrderState } from "@/domain/types";
import { loadMerchants } from "./data";

/**
 * Order state transitions. Every move goes through here so the state machine
 * is enforced in exactly one place, and order_events is written by a database
 * trigger so no path can forget to record history.
 */

/**
 * No fleet is connected yet, so the legs a robot would drive have nobody to
 * perform them: an order would sit at ROBOT_ASSIGNED forever because nothing
 * marks the unit as having reached the shop, and again at IN_TRANSIT because
 * nothing marks it as arrived.
 *
 * While simulated, those legs complete instantly — marking an order ready puts
 * a unit at the counter, and loading it puts the unit at the passenger. The
 * order states, compartments and missions are all real; only the travel is
 * skipped.
 *
 * Set FLEET_ADAPTER=vendor once the robot interface exists and these become
 * no-ops, so the simulation cannot quietly stay on underneath real hardware.
 */
export function fleetIsSimulated(): boolean {
  return (process.env.FLEET_ADAPTER ?? "simulated").toLowerCase() !== "vendor";
}

async function currentState(orderId: string): Promise<OrderState> {
  const db = createAdminClient();
  const { data, error } = await db.from("orders").select("state").eq("id", orderId).single();
  if (error || !data) throw new Error("Unknown order");
  return data.state as OrderState;
}

export async function move(orderId: string, to: OrderState, patch: Record<string, unknown> = {}) {
  const from = await currentState(orderId);
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move an order from ${from} to ${to}`);
  }
  const db = createAdminClient();
  const { error } = await db.from("orders").update({ state: to, ...patch }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function assertStaffOwns(userId: string, orderId: string) {
  const db = createAdminClient();
  const { data } = await db.from("orders").select("merchant_id").eq("id", orderId).single();
  if (!data) throw new Error("Unknown order");
  const { data: link } = await db
    .from("merchant_staff").select("user_id")
    .eq("user_id", userId).eq("merchant_id", data.merchant_id).maybeSingle();
  if (!link) throw new Error("You do not have access to this order");
}

export async function acceptOrder(orderId: string) {
  await move(orderId, "ACCEPTED");
  await move(orderId, "PREPARING");
}

export async function rejectOrder(orderId: string, reason: string) {
  const db = createAdminClient();
  const { data } = await db.from("orders").select("total_cents").eq("id", orderId).single();
  await move(orderId, "REJECTED", {
    rejection_reason: reason,
    refunded_cents: data?.total_cents ?? 0,
  });
  await db.from("payments").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("order_id", orderId);
  await incident("warn", `Order rejected by the shop — ${reason}`, orderId);
}

/** READY also assigns a unit, if one is free. */
export async function markReady(orderId: string) {
  await move(orderId, "READY");
  await dispatch(orderId);
}

export async function dispatch(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders").select("id, zone, merchant_id, nav_waypoint_id, state")
    .eq("id", orderId).single();
  if (!order || order.state !== "READY") return;

  const { data: robots } = await db
    .from("robots").select("id, zone, status, battery_pct")
    .eq("zone", order.zone).in("status", ["idle", "charging"]).gt("battery_pct", 15).limit(1);
  const robot = robots?.[0];
  if (!robot) {
    await incident("warn", "Order waiting — no free unit in this zone", orderId);
    return;
  }

  const { data: comps } = await db
    .from("robot_compartments").select("id").eq("robot_id", robot.id).eq("occupied", false).limit(1);
  const compartment = comps?.[0];
  if (!compartment) {
    await incident("warn", `Order waiting — no free compartment on ${robot.id}`, orderId);
    return;
  }

  const merchants = await loadMerchants();
  const merchant = merchants.find((m) => m.id === order.merchant_id)!;

  const { data: mission, error } = await db
    .from("missions").insert({ robot_id: robot.id, zone: order.zone, status: "active" })
    .select("id").single();
  if (error || !mission) throw new Error(error?.message ?? "Could not create mission");

  await db.from("mission_stops").insert([
    { mission_id: mission.id, seq: 1, waypoint_id: merchant.waypointId, kind: "pickup", order_id: orderId, compartment_id: compartment.id },
    { mission_id: mission.id, seq: 2, waypoint_id: order.nav_waypoint_id, kind: "dropoff", order_id: orderId, compartment_id: compartment.id },
  ]);

  await db.from("robots").update({ status: "to_merchant", charging: false }).eq("id", robot.id);
  await db.from("robot_compartments")
    .update({ order_id: orderId }).eq("robot_id", robot.id).eq("id", compartment.id);

  await move(orderId, "ROBOT_ASSIGNED", {
    mission_id: mission.id, robot_id: robot.id, compartment_id: compartment.id,
  });

  if (fleetIsSimulated()) {
    // Skip the drive to the counter, so the shop can load straight away.
    await db.from("robots")
      .update({ status: "loading", waypoint_id: merchant.waypointId })
      .eq("id", robot.id);
    await db.from("mission_stops")
      .update({ done: true }).eq("mission_id", mission.id).eq("seq", 1);
    await move(orderId, "AT_MERCHANT");
  }
}

/** The shop loads the compartment and seals it. */
export async function loadCompartment(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders").select("robot_id, compartment_id, state").eq("id", orderId).single();
  if (!order?.robot_id || !order.compartment_id) throw new Error("No unit assigned to this order");
  if (order.state !== "AT_MERCHANT") throw new Error("The unit has not arrived at the shop yet");

  await db.from("robot_compartments")
    .update({ occupied: true, locked: true })
    .eq("robot_id", order.robot_id).eq("id", order.compartment_id);
  await move(orderId, "LOADED");
  await move(orderId, "IN_TRANSIT");
  await db.from("robots").update({ status: "in_transit" }).eq("id", order.robot_id);

  if (fleetIsSimulated()) {
    // Skip the drive to the passenger, so the handover code appears at once.
    const { data: o } = await db
      .from("orders").select("nav_waypoint_id, mission_id").eq("id", orderId).single();
    await db.from("robots")
      .update({ status: "awaiting_handover", waypoint_id: o?.nav_waypoint_id ?? null })
      .eq("id", order.robot_id);
    if (o?.mission_id) {
      await db.from("mission_stops")
        .update({ done: true }).eq("mission_id", o.mission_id).eq("seq", 2);
    }
    await move(orderId, "ARRIVED");
  }
}

export async function verifyHandover(orderId: string, code: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders").select("handover_code, state, robot_id, compartment_id").eq("id", orderId).single();
  if (!order) throw new Error("Unknown order");
  if (!["ARRIVED", "NO_SHOW"].includes(order.state)) {
    return { ok: false as const, reason: "This order is not waiting for handover" };
  }
  if (code.trim() !== order.handover_code) {
    return { ok: false as const, reason: "That code doesn't match" };
  }
  if (order.robot_id && order.compartment_id) {
    await db.from("robot_compartments").update({ locked: false })
      .eq("robot_id", order.robot_id).eq("id", order.compartment_id);
  }
  return { ok: true as const };
}

export async function completeHandover(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("robot_id, compartment_id, merchant_id, goods_cents, delivery_fee_cents, commission_cents, passenger_name, ref")
    .eq("id", orderId).single();
  if (!order) throw new Error("Unknown order");

  await move(orderId, "HANDED_OVER");
  await move(orderId, "COMPLETED");

  if (order.robot_id && order.compartment_id) {
    await db.from("robot_compartments")
      .update({ occupied: false, locked: true, order_id: null })
      .eq("robot_id", order.robot_id).eq("id", order.compartment_id);
    await db.from("robots").update({ status: "returning" }).eq("id", order.robot_id);
  }
  await db.from("payments")
    .update({ status: "captured", captured_at: new Date().toISOString() }).eq("order_id", orderId);

  const merchants = await loadMerchants();
  const merchant = merchants.find((m) => m.id === order.merchant_id);
  await db.from("fiscal_documents").insert([
    { order_id: orderId, kind: "merchant-goods-receipt", issued_by: merchant?.name ?? "Shop",
      issued_to: order.passenger_name || "Passenger", amount_cents: order.goods_cents },
    { order_id: orderId, kind: "platform-fee-receipt", issued_by: "Gate Delivery d.o.o.",
      issued_to: order.passenger_name || "Passenger", amount_cents: order.delivery_fee_cents },
    { order_id: orderId, kind: "commission-invoice", issued_by: "Gate Delivery d.o.o.",
      issued_to: merchant?.name ?? "Shop", amount_cents: order.commission_cents },
  ]);
}

export async function incident(
  severity: "info" | "warn" | "critical", message: string,
  orderId?: string, robotId?: string,
) {
  const db = createAdminClient();
  await db.from("incidents").insert({ severity, message, order_id: orderId ?? null, robot_id: robotId ?? null });
}
