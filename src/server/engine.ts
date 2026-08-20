import { RouteGraph } from "@/domain/spatial/graph";
import { SimulatedFleetAdapter } from "@/domain/fleet/simulated";
import type { FleetEvent, UnitState } from "@/domain/fleet/adapter";
import { assess } from "@/domain/acceptance/engine";
import type { AcceptanceResult } from "@/domain/acceptance/engine";
import { transition } from "@/domain/orders/machine";
import { commissionFor, DELIVERY_FEE_CENTS, fiscalDocsFor, goodsTotal } from "@/domain/pricing/ledger";
import { ROUTE_EDGES, WAYPOINTS, ZONES } from "@/seed/terminal";
import { MERCHANTS, PRODUCTS } from "@/seed/merchants";
import { buildFlights, PASSENGER_NAMES } from "@/seed/flights";
import { MemoryRepository, OrderRepository } from "@/store/memory";
import type { FiscalDoc, Flight, Merchant, Order, OrderLine, Product, Zone } from "@/domain/types";
import { EventBus } from "./bus";

export interface IncidentEntry {
  id: string;
  at: number;
  severity: "info" | "warn" | "critical";
  message: string;
}

export interface CartLine { productId: string; qty: number }

/**
 * The demo engine: wires the domain together, drives the simulation loop and
 * broadcasts a snapshot to every surface.
 *
 * Everything it calls into (graph, state machine, acceptance, adapter) is
 * production code. This orchestration file is the demo-grade seam.
 */
export class Engine {
  readonly graph: RouteGraph;
  readonly zones = new Map(ZONES.map((z) => [z.id, z] as const));
  readonly merchants = new MemoryRepository<Merchant>(MERCHANTS);
  readonly products = new MemoryRepository<Product>(PRODUCTS);
  readonly flights = new MemoryRepository<Flight>([]);
  readonly orders = new OrderRepository();
  readonly fiscal = new MemoryRepository<FiscalDoc>();
  readonly bus = new EventBus();

  fleet: SimulatedFleetAdapter;
  incidents: IncidentEntry[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBroadcast = 0;
  private lastTick = Date.now();

  constructor() {
    this.graph = new RouteGraph(WAYPOINTS, ROUTE_EDGES);
    this.fleet = this.buildFleet();
    this.resetScenario();
    this.start();
  }

  /* --------------------------------------------------------------- */

  private buildFleet(): SimulatedFleetAdapter {
    const speeds: Record<string, number> = {};
    for (const z of ZONES) speeds[z.id] = z.speedLimitMps;
    const fleet = new SimulatedFleetAdapter(
      this.graph,
      [
        { id: "SB-01", name: "Speedybot 01", zone: "airside-schengen", dockId: "DOCK-1", compartments: 6 },
        { id: "SB-02", name: "Speedybot 02", zone: "airside-schengen", dockId: "DOCK-2", compartments: 6 },
      ],
      speeds,
    );
    fleet.subscribe((e) => this.onFleetEvent(e));
    return fleet;
  }

  start() {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.fleet.tick(dt, now);
    this.sweepPromises(now);
    if (now - this.lastBroadcast >= 500) {
      this.lastBroadcast = now;
      this.broadcast();
    }
  }

  /** Re-evaluate every in-flight promise. Boarding times and gates move. */
  private sweepPromises(now: number) {
    for (const o of this.orders.live()) {
      if (o.slaMissed) continue;
      if (["ARRIVED", "HANDED_OVER"].includes(o.state)) continue;
      if (now > o.promise.promiseDeadline) {
        o.slaMissed = true;
        o.refundedCents = o.deliveryFeeCents;
        this.incident("warn", `${o.ref} missed its promise — delivery fee refunded automatically`);
      }
    }
  }

  incident(severity: IncidentEntry["severity"], message: string) {
    this.incidents.unshift({
      id: `I${++this.seq}`, at: Date.now(), severity, message,
    });
    this.incidents = this.incidents.slice(0, 60);
  }

  /* ---------------------------- fleet events ---------------------------- */

  private onFleetEvent(e: FleetEvent) {
    if (e.type === "arrived") {
      const order = this.orders.all().find((o) => o.missionId === e.missionId && o.robotId === e.unitId);
      if (!order) return;
      if (order.state === "ROBOT_ASSIGNED") {
        transition(order, "AT_MERCHANT", "Unit at the shop");
      } else if (order.state === "IN_TRANSIT") {
        transition(order, "ARRIVED", `Arrived at ${this.graph.waypoint(e.waypointId)?.name ?? e.waypointId}`);
      }
      this.broadcast();
    }

    if (e.type === "compartment_closed") {
      const order = this.orders.all().find(
        (o) => o.robotId === e.unitId && o.compartmentId === e.compartmentId &&
          ["AT_MERCHANT", "ARRIVED", "NO_SHOW"].includes(o.state),
      );
      if (!order) return;
      if (order.state === "AT_MERCHANT") {
        transition(order, "LOADED", "Sealed in the compartment");
        transition(order, "IN_TRANSIT", "On the way to the passenger");
      } else {
        transition(order, "HANDED_OVER", "Passenger collected the order");
        this.complete(order);
      }
      this.broadcast();
    }

    if (e.type === "blocked") {
      this.incident("warn", `${e.unitId} blocked — path obstruction, ${e.durationSec}s`);
      this.broadcast();
    }
    if (e.type === "unblocked") {
      this.incident("info", `${e.unitId} resumed`);
      this.broadcast();
    }
    if (e.type === "fault" && e.severity === "critical") {
      this.incident("critical", `${e.unitId} fault: ${e.code}`);
      this.broadcast();
    }
    if (e.type === "estop") {
      this.incident("critical", `${e.unitId} halted by emergency hold`);
    }
  }

  /* ------------------------------- quoting ------------------------------ */

  zoneOf(waypointId: string): Zone {
    const wp = this.graph.waypoint(waypointId);
    return this.zones.get(wp?.zone ?? "airside-schengen")!;
  }

  private queueDepth(merchantId: string): number {
    return this.orders.byMerchant(merchantId).filter(
      (o) => ["SENT_TO_MERCHANT", "ACCEPTED", "PREPARING"].includes(o.state),
    ).length;
  }

  private nearestFreeUnitWaypoint(zoneId: string): string | null {
    const free = this.fleet.listUnitsSync().filter(
      (u) => u.zone === zoneId && !u.missionId && u.status !== "fault" && u.status !== "held",
    );
    return free[0]?.waypointId ?? null;
  }

  private get lastUnits(): UnitState[] {
    return this.fleet.listUnitsSync();
  }

  quote(
    merchantId: string,
    lines: CartLine[],
    flightId: string,
    deliveryWaypointId: string,
  ): AcceptanceResult & { goodsCents: number; deliveryFeeCents: number; blockedItems: string[] } {
    const merchant = this.merchants.get(merchantId)!;
    const flight = this.flights.get(flightId)!;
    const zone = this.zoneOf(deliveryWaypointId);
    const resolved = this.resolveLines(lines);
    const blockedItems = resolved
      .filter((r) => r.product.ageRestricted && !zone.allowsAgeRestricted)
      .map((r) => r.product.name);
    const deliverable = resolved.filter(
      (r) => !(r.product.ageRestricted && !zone.allowsAgeRestricted),
    );
    const itemCount = deliverable.reduce((n, r) => n + r.line.qty, 0);

    const result = assess({
      now: Date.now(),
      flight,
      zone,
      merchant,
      itemCount,
      queueDepth: this.queueDepth(merchantId),
      deliveryWaypointId,
      unitWaypointId: this.nearestFreeUnitWaypoint(zone.id),
      graph: this.graph,
    });

    const goodsCents = goodsTotal(
      deliverable.map((r) => ({
        productId: r.product.id, name: r.product.name, emoji: r.product.emoji,
        qty: r.line.qty, unitPriceCents: r.product.priceCents,
      })),
    );

    return { ...result, goodsCents, deliveryFeeCents: DELIVERY_FEE_CENTS, blockedItems };
  }

  private resolveLines(lines: CartLine[]) {
    return lines
      .map((line) => ({ line, product: this.products.get(line.productId)! }))
      .filter((r) => r.product && r.product.available);
  }

  /* ------------------------------- ordering ----------------------------- */

  placeOrder(input: {
    merchantId: string;
    lines: CartLine[];
    flightId: string;
    deliveryWaypointId: string;
    passengerName?: string;
  }): { ok: true; order: Order } | { ok: false; reason: string } {
    const merchant = this.merchants.get(input.merchantId);
    const flight = this.flights.get(input.flightId);
    if (!merchant || !flight) return { ok: false, reason: "Unknown merchant or flight" };

    const zone = this.zoneOf(input.deliveryWaypointId);
    const q = this.quote(input.merchantId, input.lines, input.flightId, input.deliveryWaypointId);
    if (q.verdict === "REFUSE") return { ok: false, reason: q.reason };

    const resolved = this.resolveLines(input.lines).filter(
      (r) => !(r.product.ageRestricted && !zone.allowsAgeRestricted),
    );
    if (resolved.length === 0) return { ok: false, reason: "Nothing in this order can be delivered" };

    const orderLines: OrderLine[] = resolved.map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      emoji: r.product.emoji,
      qty: r.line.qty,
      unitPriceCents: r.product.priceCents,
    }));

    const goodsCents = goodsTotal(orderLines);
    const id = `o${++this.seq}`;
    const ref = `ZAG-${String(1000 + this.seq)}`;

    const order: Order = {
      id, ref, state: "DRAFT",
      merchantId: merchant.id,
      lines: orderLines,
      flightId: flight.id,
      passengerName: input.passengerName ?? PASSENGER_NAMES[this.seq % PASSENGER_NAMES.length],
      deliveryWaypointId: input.deliveryWaypointId,
      zone: zone.id,
      goodsCents,
      deliveryFeeCents: DELIVERY_FEE_CENTS,
      totalCents: goodsCents + DELIVERY_FEE_CENTS,
      commissionCents: commissionFor(merchant, goodsCents),
      promise: q.promise,
      createdAt: Date.now(),
      history: [{ at: Date.now(), state: "DRAFT" }],
      handoverCode: String(Math.floor(1000 + Math.random() * 9000)),
    };

    transition(order, "VALIDATED", q.reason);
    transition(order, "AUTHORIZED", "Payment authorised (simulated)");
    transition(order, "SENT_TO_MERCHANT", `Sent to ${merchant.name}`);
    this.orders.put(order);
    this.incident("info", `${ref} placed — ${merchant.name} → ${this.graph.waypoint(order.deliveryWaypointId)?.name}`);
    this.broadcast();
    return { ok: true, order };
  }

  merchantAccept(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o || o.state !== "SENT_TO_MERCHANT") return;
    transition(o, "ACCEPTED", "Shop accepted");
    transition(o, "PREPARING", "Preparing");
    this.broadcast();
  }

  merchantReject(orderId: string, reason: string) {
    const o = this.orders.get(orderId);
    if (!o || o.state !== "SENT_TO_MERCHANT") return;
    o.rejectionReason = reason;
    o.refundedCents = o.totalCents;
    transition(o, "REJECTED", reason);
    this.incident("warn", `${o.ref} rejected by shop — ${reason}`);
    this.broadcast();
  }

  async merchantReady(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o || o.state !== "PREPARING") return;
    transition(o, "READY", "Ready for collection");
    await this.dispatch(o);
    this.broadcast();
  }

  /** READY → assign a unit and create the two-stop mission. */
  private async dispatch(o: Order) {
    const merchant = this.merchants.get(o.merchantId)!;
    const units = await this.fleet.listUnits();
    const unit = units.find(
      (u) => u.zone === o.zone && !u.missionId &&
        (u.status === "idle" || u.status === "charging") && u.batteryPct > 15,
    );
    if (!unit) {
      this.incident("warn", `${o.ref} waiting — no free unit in ${o.zone}`);
      return;
    }
    const compartment = unit.compartments.find((c) => !c.occupied);
    if (!compartment) {
      this.incident("warn", `${o.ref} waiting — no free compartment on ${unit.id}`);
      return;
    }

    const missionId = await this.fleet.createMission({
      zone: o.zone,
      unitId: unit.id,
      stops: [
        { waypointId: merchant.waypointId, kind: "pickup", orderId: o.id, compartmentId: compartment.id },
        { waypointId: o.deliveryWaypointId, kind: "dropoff", orderId: o.id, compartmentId: compartment.id },
      ],
    });

    o.missionId = missionId;
    o.robotId = unit.id;
    o.compartmentId = compartment.id;
    transition(o, "ROBOT_ASSIGNED", `${unit.name} assigned, ${compartment.label}`);
  }

  /** Merchant loads the compartment — opens then locks, which advances the mission. */
  async merchantLoad(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o || o.state !== "AT_MERCHANT" || !o.robotId || !o.compartmentId) return;
    await this.fleet.openCompartment(o.robotId, o.compartmentId, "merchant");
    await this.fleet.lockCompartment(o.robotId, o.compartmentId);
  }

  /** Passenger enters the handover code on the unit's screen. */
  async handover(orderId: string, code: string): Promise<{ ok: boolean; reason?: string }> {
    const o = this.orders.get(orderId);
    if (!o) return { ok: false, reason: "Unknown order" };
    if (!["ARRIVED", "NO_SHOW"].includes(o.state)) {
      return { ok: false, reason: "This order is not waiting for handover" };
    }
    if (code.trim() !== o.handoverCode) return { ok: false, reason: "That code doesn't match" };
    await this.fleet.openCompartment(o.robotId!, o.compartmentId!, "passenger");
    return { ok: true };
  }

  /** Passenger confirms they've taken it — closes the compartment. */
  async handoverComplete(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o || !o.robotId || !o.compartmentId) return;
    await this.fleet.lockCompartment(o.robotId, o.compartmentId);
  }

  private complete(o: Order) {
    transition(o, "COMPLETED", "Complete");
    const merchant = this.merchants.get(o.merchantId)!;
    for (const doc of fiscalDocsFor(o, merchant)) this.fiscal.put(doc);
    this.incident("info", `${o.ref} completed — ${merchant.name}`);
  }

  /* ------------------------- catalogue management ----------------------- */

  upsertProduct(p: Product) {
    this.products.put(p);
    this.broadcast();
  }

  toggleProduct(productId: string) {
    const p = this.products.get(productId);
    if (!p) return;
    p.available = !p.available;
    this.broadcast();
  }

  deleteProduct(productId: string) {
    this.products.remove(productId);
    this.broadcast();
  }

  setPrepMinutes(merchantId: string, minutes: number) {
    const m = this.merchants.get(merchantId);
    if (!m) return;
    m.prepMinutes = Math.max(1, Math.min(30, minutes));
    this.broadcast();
  }

  /* ---------------------------- demo controls --------------------------- */

  async injectGateChange(flightId?: string) {
    const live = this.orders.live().filter((o) => ["IN_TRANSIT", "ROBOT_ASSIGNED", "PREPARING", "AT_MERCHANT"].includes(o.state));
    const target = flightId
      ? this.flights.get(flightId)
      : this.flights.get(live[0]?.flightId ?? "ou654");
    if (!target) return;

    const zone = this.zones.get("airside-schengen")!;
    const candidates = WAYPOINTS.filter(
      (w) => w.kind === "gate" && w.zone === zone.id && w.gate !== target.gate,
    );
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    const oldGate = target.gate;
    target.gate = next.gate!;
    target.status = "gate-change";
    this.incident("critical", `${target.number} gate change: ${oldGate} → ${target.gate}`);

    for (const o of this.orders.live()) {
      if (o.flightId !== target.id) continue;
      o.deliveryWaypointId = next.id;
      o.history.push({ at: Date.now(), state: o.state, note: `Gate change ${oldGate} → ${target.gate}, rerouting` });
      if (o.missionId && ["IN_TRANSIT", "ROBOT_ASSIGNED", "AT_MERCHANT"].includes(o.state)) {
        // Re-evaluate the promise against the new walk...
        const merchant = this.merchants.get(o.merchantId)!;
        const extra = this.graph.travelSeconds(merchant.waypointId, next.id, zone.speedLimitMps);
        o.promise = { ...o.promise, toCustomerSeconds: extra };

        // ...then re-target the DROPOFF STOP, not the unit. Steering the unit
        // alone leaves the mission pointing at the old gate, and the unit
        // arrives somewhere its mission does not recognise and stalls.
        const mission = await this.fleet.getMission(o.missionId);
        const dropIndex = mission?.stops.findIndex(
          (s) => s.kind === "dropoff" && s.orderId === o.id,
        ) ?? -1;
        if (dropIndex >= 0) {
          await this.fleet.updateMissionStop(o.missionId, dropIndex, next.id);
        }
      }
    }
    this.broadcast();
  }

  injectBlock() {
    const busy = this.lastUnits.find((u) => u.status === "in_transit" || u.status === "to_merchant");
    const unitId = busy?.id ?? "SB-01";
    this.fleet.injectBlock(unitId, 20);
    this.broadcast();
  }

  injectNoShow() {
    const arrived = this.orders.all().find((o) => o.state === "ARRIVED");
    if (!arrived) {
      this.incident("info", "No order is currently awaiting handover");
      return;
    }
    transition(arrived, "NO_SHOW", "Passenger not at the delivery point");
    this.incident("warn", `${arrived.ref} — passenger not found, holding then escalating to a runner`);
    this.broadcast();
  }

  async setEmergencyHold(held: boolean) {
    await this.fleet.emergencyHold("airside-schengen", held);
    this.incident(held ? "critical" : "info", held
      ? "EMERGENCY HOLD — all units stopped, escape routes cleared"
      : "Emergency hold released — units resuming");
    this.broadcast();
  }

  clearFaults() {
    for (const u of this.lastUnits) this.fleet.clearFault(u.id);
    this.incident("info", "Faults cleared by operator");
    this.broadcast();
  }

  resetScenario() {
    const now = Date.now();
    this.orders.clear();
    this.fiscal.clear();
    this.incidents = [];
    this.flights.replaceAll(buildFlights(now));
    this.products.replaceAll(PRODUCTS.map((p) => ({ ...p })));
    this.merchants.replaceAll(MERCHANTS.map((m) => ({ ...m })));
    this.fleet = this.buildFleet();
    this.incident("info", "Scenario reset — flight board rebuilt, fleet docked");
    this.broadcast();
  }

  /* ------------------------------ snapshot ------------------------------ */

  async snapshot() {
    const units = await this.fleet.listUnits();
    return {
      now: Date.now(),
      zones: ZONES,
      waypoints: WAYPOINTS,
      edges: ROUTE_EDGES,
      merchants: this.merchants.all(),
      products: this.products.all(),
      flights: this.flights.all().sort((a, b) => a.boardingAt - b.boardingAt),
      orders: this.orders.all().sort((a, b) => b.createdAt - a.createdAt),
      units: units.map((u) => ({ ...u, etaSeconds: this.fleet.etaSecondsFor(u.id) })),
      incidents: this.incidents,
      fiscal: this.fiscal.all(),
      held: this.fleet.isHeld("airside-schengen"),
    };
  }

  broadcast() {
    void this.snapshot().then((s) => this.bus.publish(JSON.stringify(s)));
  }
}

export type Snapshot = Awaited<ReturnType<Engine["snapshot"]>>;

/** Survive Next.js hot reloads — one engine per process, not per module eval. */
const g = globalThis as unknown as { __gateEngine?: Engine };
export function engine(): Engine {
  if (!g.__gateEngine) g.__gateEngine = new Engine();
  return g.__gateEngine;
}
