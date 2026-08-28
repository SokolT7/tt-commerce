import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { RouteGraph } from "@/domain/spatial/graph";
import type {
  Flight, Merchant, MerchantKind, Product, ProductCategory, RouteEdge, Waypoint, Zone, ZoneId,
} from "@/domain/types";

/**
 * Reads reference data out of Supabase and hands it to the domain layer in the
 * shapes it already expects. The domain code is unchanged from the demo — only
 * where the data comes from has moved.
 */

type Cached<T> = { value: T; at: number };
const TTL_MS = 30_000;
let graphCache: Cached<{ graph: RouteGraph; waypoints: Waypoint[]; edges: RouteEdge[]; zones: Zone[] }> | null = null;

export async function loadTerminal() {
  if (graphCache && Date.now() - graphCache.at < TTL_MS) return graphCache.value;
  const db = createAdminClient();

  const [zonesRes, wpRes, edgeRes] = await Promise.all([
    db.from("zones").select("*"),
    db.from("waypoints").select("*"),
    db.from("route_edges").select("*"),
  ]);
  if (zonesRes.error) throw zonesRes.error;
  if (wpRes.error) throw wpRes.error;
  if (edgeRes.error) throw edgeRes.error;

  const zones: Zone[] = zonesRes.data.map((z) => ({
    id: z.id as ZoneId,
    name: z.name,
    short: z.short_name,
    speedLimitMps: Number(z.speed_limit_mps),
    safetyMarginMin: z.safety_margin_min,
    orderable: z.orderable,
    allowsAgeRestricted: z.allows_age_restricted,
  }));

  const waypoints: Waypoint[] = wpRes.data.map((w) => ({
    id: w.id,
    zone: w.zone as ZoneId,
    kind: w.kind as Waypoint["kind"],
    name: w.name,
    landmark: w.landmark,
    gate: w.gate ?? undefined,
    x: Number(w.x),
    y: Number(w.y),
  }));

  const edges: RouteEdge[] = edgeRes.data.map((e) => ({
    from: e.from_waypoint,
    to: e.to_waypoint,
    metres: Number(e.metres),
  }));

  const value = { graph: new RouteGraph(waypoints, edges), waypoints, edges, zones };
  graphCache = { value, at: Date.now() };
  return value;
}

export function invalidateTerminalCache() {
  graphCache = null;
}

export async function loadMerchants(): Promise<Merchant[]> {
  const db = createAdminClient();
  const [{ data: rows, error }, { data: overrides }] = await Promise.all([
    db.from("merchants").select("*").order("name"),
    db.from("merchant_prep_overrides").select("*"),
  ]);
  if (error) throw error;

  const byMerchant = new Map<string, Record<number, number>>();
  for (const o of overrides ?? []) {
    const m = byMerchant.get(o.merchant_id) ?? {};
    m[o.hour_of_day] = o.prep_minutes;
    byMerchant.set(o.merchant_id, m);
  }

  return (rows ?? []).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    kind: m.kind as MerchantKind,
    zone: m.zone as ZoneId,
    waypointId: m.waypoint_id,
    blurb: m.blurb,
    prepMinutes: m.prep_minutes,
    prepByHour: byMerchant.get(m.id),
    commissionRate: Number(m.commission_rate),
    open: m.open,
    colour: m.colour,
    logoUrl: m.logo_url ?? undefined,
  }));
}

export async function loadProducts(merchantId?: string): Promise<Product[]> {
  const db = createAdminClient();
  let q = db.from("products").select("*").order("sort_order");
  if (merchantId) q = q.eq("merchant_id", merchantId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toProduct);
}

export function toProduct(p: {
  id: string; merchant_id: string; category_id: string | null; name: string;
  description: string; price_cents: number; available: boolean; age_restricted: boolean;
  allergens: string[]; emoji: string; image_url: string | null; sort_order: number;
}): Product {
  return {
    id: p.id,
    merchantId: p.merchant_id,
    categoryId: p.category_id ?? undefined,
    name: p.name,
    description: p.description,
    category: "food" as ProductCategory,
    priceCents: p.price_cents,
    available: p.available,
    ageRestricted: p.age_restricted,
    allergens: p.allergens,
    emoji: p.emoji,
    imageUrl: p.image_url ?? undefined,
    sortOrder: p.sort_order,
  };
}

export async function loadFlights(): Promise<Flight[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("flights").select("*").order("boarding_at");
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id,
    number: f.flight_number,
    carrier: f.carrier,
    destination: f.destination,
    destinationCode: f.destination_code,
    nonEu: f.non_eu,
    gate: f.gate ?? "",
    boardingAt: new Date(f.boarding_at).getTime(),
    departsAt: new Date(f.departs_at).getTime(),
    status: f.status as Flight["status"],
  }));
}

/** How many orders this shop is already working on — feeds the prep estimate. */
export async function merchantQueueDepth(merchantId: string): Promise<number> {
  const db = createAdminClient();
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .in("state", ["SENT_TO_MERCHANT", "ACCEPTED", "PREPARING"]);
  if (error) throw error;
  return count ?? 0;
}
