import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assess } from "@/domain/acceptance/engine";
import { DELIVERY_FEE_CENTS } from "@/domain/pricing/ledger";
import type { DeliveryLocationKind, ZoneId } from "@/domain/types";
import { loadTerminal, loadMerchants, loadFlights, merchantQueueDepth } from "./data";

export interface CartLineInput {
  productId: string;
  qty: number;
  optionIds?: string[];
  notes?: string;
}

export interface LocationInput {
  kind: DeliveryLocationKind;
  seatId?: string;
  pinX?: number;
  pinY?: number;
  waypointId?: string;
}

/** Resolves any of the three ways a passenger can say where they are. */
export async function resolveLocation(input: LocationInput, zone: ZoneId) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("resolve_delivery_location", {
    p_kind: input.kind,
    p_zone: zone,
    p_seat_id: input.seatId,
    p_pin_x: input.pinX,
    p_pin_y: input.pinY,
    p_waypoint_id: input.waypointId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("That delivery point could not be resolved");
  return {
    navWaypointId: row.nav_waypoint_id as string,
    walkMetres: Number(row.walk_metres),
    note: row.note as string,
  };
}

/** Zone a location falls in — a seat and a waypoint both carry one. */
export async function zoneForLocation(input: LocationInput): Promise<ZoneId> {
  const db = createAdminClient();
  if (input.kind === "seat" && input.seatId) {
    const { data } = await db.from("seats").select("zone").eq("id", input.seatId).single();
    if (!data) throw new Error("Unknown seat");
    return data.zone as ZoneId;
  }
  if (input.kind === "waypoint" && input.waypointId) {
    const { data } = await db.from("waypoints").select("zone").eq("id", input.waypointId).single();
    if (!data) throw new Error("Unknown delivery point");
    return data.zone as ZoneId;
  }
  // A pin carries no zone of its own; it belongs to whichever zone contains it.
  const { waypoints } = await loadTerminal();
  const x = input.pinX ?? 0, y = input.pinY ?? 0;
  let best = waypoints[0], bestD = Infinity;
  for (const w of waypoints) {
    const d = (w.x - x) ** 2 + (w.y - y) ** 2;
    if (d < bestD) { bestD = d; best = w; }
  }
  return best.zone;
}

export interface QuoteResult {
  verdict: "ACCEPT" | "WARN" | "REFUSE";
  reason: string;
  slackSeconds: number;
  goodsCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  commissionCents: number;
  blockedItems: string[];
  location: { navWaypointId: string; walkMetres: number; note: string; zone: ZoneId };
  promise: { deliverBy: number; deadline: number; inputs: Record<string, number | string> };
  lines: Array<{ productId: string; name: string; emoji: string; qty: number; unitPriceCents: number; optionIds: string[]; optionNames: string[]; optionDeltaCents: number }>;
}

/**
 * Prices come from the database, never from the client. The client sends
 * product ids and quantities; everything monetary is recomputed here.
 */
export async function quote(params: {
  merchantId: string;
  lines: CartLineInput[];
  /** Optional: omitted while live flight data is unavailable. */
  flightId?: string | null;
  location: LocationInput;
}): Promise<QuoteResult> {
  const db = createAdminClient();
  const [{ graph, zones }, merchants, flights] = await Promise.all([
    loadTerminal(), loadMerchants(), loadFlights(),
  ]);

  const merchant = merchants.find((m) => m.id === params.merchantId);
  if (!merchant) throw new Error("Unknown shop");
  // A quote without a flight is legitimate; a quote naming a flight we do not
  // have is not, because the promise would silently lose its deadline.
  let flight = null as (typeof flights)[number] | null;
  if (params.flightId) {
    flight = flights.find((f) => f.id === params.flightId) ?? null;
    if (!flight) throw new Error("Unknown flight");
  }

  const zoneId = await zoneForLocation(params.location);
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) throw new Error("Unknown zone");
  const location = { ...(await resolveLocation(params.location, zoneId)), zone: zoneId };

  const ids = params.lines.map((l) => l.productId);
  const { data: products, error } = await db.from("products").select("*").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (error) throw new Error(error.message);

  const allOptionIds = params.lines.flatMap((l) => l.optionIds ?? []);
  const { data: options } = allOptionIds.length
    ? await db.from("product_options").select("*").in("id", allOptionIds)
    : { data: [] as { id: string; name: string; price_delta_cents: number; available: boolean }[] };

  const blockedItems: string[] = [];
  const lines: QuoteResult["lines"] = [];
  let goodsCents = 0;

  for (const input of params.lines) {
    const p = (products ?? []).find((x) => x.id === input.productId);
    if (!p || !p.available || p.merchant_id !== merchant.id) continue;
    if (p.age_restricted && !zone.allowsAgeRestricted) {
      blockedItems.push(p.name);
      continue;
    }
    const qty = Math.max(1, Math.min(20, Math.floor(input.qty)));
    const chosen = (options ?? []).filter((o) => (input.optionIds ?? []).includes(o.id) && o.available);
    const optionDelta = chosen.reduce((s, o) => s + o.price_delta_cents, 0);
    const unit = p.price_cents + optionDelta;
    goodsCents += unit * qty;
    lines.push({
      productId: p.id, name: p.name, emoji: p.emoji, qty, unitPriceCents: unit,
      optionIds: chosen.map((o) => o.id), optionNames: chosen.map((o) => o.name),
      optionDeltaCents: optionDelta,
    });
  }

  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const result = assess({
    now: Date.now(),
    flight, zone, merchant, itemCount,
    queueDepth: await merchantQueueDepth(merchant.id),
    deliveryWaypointId: location.navWaypointId,
    unitWaypointId: await nearestFreeUnitWaypoint(zoneId),
    graph,
  });

  const deliveryFeeCents = lines.length ? DELIVERY_FEE_CENTS : 0;
  return {
    verdict: result.verdict,
    reason: result.reason,
    slackSeconds: result.slackSeconds,
    goodsCents,
    deliveryFeeCents,
    totalCents: goodsCents + deliveryFeeCents,
    commissionCents: Math.round(goodsCents * merchant.commissionRate),
    blockedItems,
    location,
    promise: {
      deliverBy: result.promise.deliverBy,
      deadline: result.promise.promiseDeadline,
      inputs: {
        prepSeconds: result.promise.prepSeconds,
        toMerchantSeconds: result.promise.toMerchantSeconds,
        loadingSeconds: result.promise.loadingSeconds,
        toCustomerSeconds: result.promise.toCustomerSeconds,
        handoverBufferSeconds: result.promise.handoverBufferSeconds,
        walkMetres: location.walkMetres,
        // Recorded only when a flight was known, so the stored promise shows
        // whether it ever had a boarding deadline to protect.
        ...(result.promise.gateAtQuoteTime !== null
          ? { gateAtQuoteTime: result.promise.gateAtQuoteTime }
          : {}),
        ...(result.promise.boardingAtQuoteTime !== null
          ? { boardingAtQuoteTime: result.promise.boardingAtQuoteTime }
          : {}),
      },
    },
    lines,
  };
}

async function nearestFreeUnitWaypoint(zone: ZoneId): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("robots").select("waypoint_id")
    .eq("zone", zone).in("status", ["idle", "charging"]).limit(1);
  return data?.[0]?.waypoint_id ?? null;
}

export async function placeOrder(params: {
  merchantId: string;
  lines: CartLineInput[];
  flightId?: string | null;
  location: LocationInput;
  customerId: string | null;
  passengerName?: string;
}): Promise<{ ok: true; orderId: string } | { ok: false; reason: string }> {
  const q = await quote(params);
  if (q.verdict === "REFUSE") return { ok: false, reason: q.reason };
  if (q.lines.length === 0) return { ok: false, reason: "Nothing in this order can be delivered" };

  const db = createAdminClient();
  const { data, error } = await db.rpc("create_order", {
    payload: {
      customer_id: params.customerId,
      merchant_id: params.merchantId,
      flight_id: params.flightId ?? null,
      passenger_name: params.passengerName ?? "",
      location_kind: params.location.kind,
      seat_id: params.location.seatId ?? null,
      pin_x: params.location.pinX ?? null,
      pin_y: params.location.pinY ?? null,
      nav_waypoint_id: q.location.navWaypointId,
      walk_metres: q.location.walkMetres,
      location_note: q.location.note,
      zone: q.location.zone,
      goods_cents: q.goodsCents,
      delivery_fee_cents: q.deliveryFeeCents,
      total_cents: q.totalCents,
      commission_cents: q.commissionCents,
      promise_deliver_by: new Date(q.promise.deliverBy).toISOString(),
      promise_deadline: new Date(q.promise.deadline).toISOString(),
      promise_inputs: q.promise.inputs,
      payment_provider: "mock",
      lines: q.lines.map((l) => ({
        product_id: l.productId, name: l.name, emoji: l.emoji, qty: l.qty,
        unit_price_cents: l.unitPriceCents,
        options: l.optionIds.map((id, i) => ({ option_id: id, name: l.optionNames[i], price_delta_cents: 0 })),
      })),
    },
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, orderId: data as string };
}
