import type { RouteGraph } from "@/domain/spatial/graph";
import type { ZoneId } from "@/domain/types";
import type {
  Compartment, FleetAdapter, FleetEvent, MissionSpec, MissionState,
  UnitState, Unsubscribe,
} from "./adapter";

/**
 * SimulatedFleetAdapter — a virtual Speedybot Max walking the route graph.
 *
 * This is NOT scaffolding to be thrown away. It becomes the permanent CI
 * regression harness: the whole platform can be tested end to end on every
 * commit with no robot in the room. Production keeps it forever.
 *
 * The tick is driven externally so tests can advance a deterministic clock.
 */

interface SimUnit extends UnitState {
  /** Remaining waypoints to visit, excluding the one we're standing at. */
  pathAhead: string[];
  /** Metres already travelled along the current leg. */
  legProgress: number;
  legMetres: number;
  /** Coordinates of the waypoint we left, for interpolation. */
  fromX: number;
  fromY: number;
  speedMps: number;
  blockedUntilMs: number;
  homeDockId: string;
}

export interface SimUnitSeed {
  id: string;
  name: string;
  zone: ZoneId;
  dockId: string;
  compartments: number;
}

const DRAIN_PCT_PER_SEC = 0.012;
const CHARGE_PCT_PER_SEC = 0.25;
const LOW_BATTERY_PCT = 15;

export class SimulatedFleetAdapter implements FleetAdapter {
  private units = new Map<string, SimUnit>();
  private missions = new Map<string, MissionState>();
  private handlers = new Set<(e: FleetEvent) => void>();
  private heldZones = new Set<ZoneId>();
  private seq = 0;
  private lastPoseEmit = 0;

  constructor(
    private readonly graph: RouteGraph,
    seeds: SimUnitSeed[],
    private readonly speedByZone: Record<string, number>,
  ) {
    for (const s of seeds) {
      const dock = graph.waypoint(s.dockId);
      if (!dock) throw new Error(`Unknown dock waypoint: ${s.dockId}`);
      this.units.set(s.id, {
        id: s.id,
        name: s.name,
        zone: s.zone,
        status: "idle",
        batteryPct: 92,
        charging: true,
        waypointId: s.dockId,
        x: dock.x,
        y: dock.y,
        heading: 0,
        compartments: Array.from({ length: s.compartments }, (_, i) => ({
          id: `C${i + 1}`,
          label: `Compartment ${i + 1}`,
          occupied: false,
          locked: true,
          orderId: null,
        })),
        missionId: null,
        pathAhead: [],
        legProgress: 0,
        legMetres: 0,
        fromX: dock.x,
        fromY: dock.y,
        speedMps: this.speedByZone[s.zone] ?? 1.2,
        blockedUntilMs: 0,
        homeDockId: s.dockId,
      });
    }
  }

  /* ------------------------------ events ------------------------------ */

  private emit(e: FleetEvent) {
    for (const h of this.handlers) h(e);
  }

  subscribe(handler: (e: FleetEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /* ------------------------------ queries ----------------------------- */

  private snapshot(u: SimUnit): UnitState {
    return {
      id: u.id, name: u.name, zone: u.zone, status: u.status,
      batteryPct: Math.round(u.batteryPct * 10) / 10,
      charging: u.charging, waypointId: u.waypointId,
      x: Math.round(u.x * 10) / 10, y: Math.round(u.y * 10) / 10,
      heading: Math.round(u.heading), compartments: u.compartments.map((c) => ({ ...c })),
      missionId: u.missionId, pathAhead: [...u.pathAhead],
    };
  }

  async listUnits(): Promise<UnitState[]> {
    return this.listUnitsSync();
  }

  /** Simulator-only: the orchestrator's quoting path needs a unit position
   *  synchronously. A real adapter would use a cached last-known state. */
  listUnitsSync(): UnitState[] {
    return [...this.units.values()].map((u) => this.snapshot(u));
  }

  async getUnit(id: string): Promise<UnitState | null> {
    const u = this.units.get(id);
    return u ? this.snapshot(u) : null;
  }

  async getMission(id: string): Promise<MissionState | null> {
    const m = this.missions.get(id);
    return m ? { ...m, stops: m.stops.map((s) => ({ ...s })) } : null;
  }

  /* ----------------------------- missions ----------------------------- */

  async createMission(spec: MissionSpec): Promise<string> {
    const unit = spec.unitId
      ? this.units.get(spec.unitId)
      : this.pickFreeUnit(spec.zone);
    if (!unit) throw new Error(`No available unit in zone ${spec.zone}`);
    if (unit.zone !== spec.zone) {
      throw new Error("A mission may never cross a zone boundary");
    }

    const id = `M${String(++this.seq).padStart(4, "0")}`;
    const mission: MissionState = {
      id,
      unitId: unit.id,
      zone: spec.zone,
      stops: spec.stops.map((s) => ({ ...s, done: false })),
      currentStopIndex: 0,
      status: "active",
      etaSeconds: 0,
      startedAt: Date.now(),
    };
    this.missions.set(id, mission);
    unit.missionId = id;
    unit.charging = false;
    this.routeToCurrentStop(unit, mission);
    return id;
  }

  async cancelMission(id: string, reason: string): Promise<void> {
    const m = this.missions.get(id);
    if (!m) return;
    m.status = "cancelled";
    const u = this.units.get(m.unitId);
    if (u) {
      u.missionId = null;
      for (const c of u.compartments) {
        c.occupied = false;
        c.orderId = null;
        c.locked = true;
      }
      this.sendHome(u);
    }
    this.emit({ type: "fault", unitId: m.unitId, code: `mission_cancelled:${reason}`, severity: "warn" });
  }

  async updateMissionStop(missionId: string, stopIndex: number, waypointId: string): Promise<void> {
    const m = this.missions.get(missionId);
    if (!m || m.status !== "active") return;
    const stop = m.stops[stopIndex];
    if (!stop || stop.done) return;
    if (!this.graph.waypoint(waypointId)) return;

    stop.waypointId = waypointId;

    // If the unit is already driving to this stop, re-route it now. Without
    // this the unit arrives somewhere the mission is not expecting and stalls.
    if (stopIndex === m.currentStopIndex) {
      const u = this.units.get(m.unitId);
      if (u) this.routeToCurrentStop(u, m);
    }
  }

  async navigateTo(unitId: string, waypointId: string): Promise<void> {
    const u = this.units.get(unitId);
    if (!u) return;
    this.setPath(u, waypointId);
    u.status = "in_transit";
    u.charging = false;
  }

  async returnToDock(unitId: string): Promise<void> {
    const u = this.units.get(unitId);
    if (u) this.sendHome(u);
  }

  /* ------------------------------ cargo ------------------------------- */

  async openCompartment(unitId: string, compartmentId: string, byWhom: string): Promise<void> {
    const u = this.units.get(unitId);
    const c = u?.compartments.find((x) => x.id === compartmentId);
    if (!u || !c) return;
    c.locked = false;
    this.emit({ type: "compartment_opened", unitId, compartmentId, byWhom });
  }

  /** Close and lock. Completing the current stop is driven by this. */
  async lockCompartment(unitId: string, compartmentId: string): Promise<void> {
    const u = this.units.get(unitId);
    const c = u?.compartments.find((x) => x.id === compartmentId);
    if (!u || !c) return;
    c.locked = true;
    this.emit({ type: "compartment_closed", unitId, compartmentId });

    const m = u.missionId ? this.missions.get(u.missionId) : null;
    if (!m || m.status !== "active") return;
    const stop = m.stops[m.currentStopIndex];
    if (!stop || stop.compartmentId !== compartmentId) return;

    if (stop.kind === "pickup") {
      c.occupied = true;
      c.orderId = stop.orderId;
    } else {
      c.occupied = false;
      c.orderId = null;
    }
    stop.done = true;
    m.currentStopIndex += 1;

    if (m.currentStopIndex >= m.stops.length) {
      m.status = "complete";
      u.missionId = null;
      this.emit({ type: "mission_complete", unitId: u.id, missionId: m.id });
      this.sendHome(u);
    } else {
      this.routeToCurrentStop(u, m);
    }
  }

  /* --------------------------- safety/policy -------------------------- */

  async setSpeedLimit(unitId: string, metresPerSecond: number): Promise<void> {
    const u = this.units.get(unitId);
    if (u) u.speedMps = metresPerSecond;
  }

  async emergencyHold(zone: ZoneId, held: boolean): Promise<void> {
    if (held) {
      this.heldZones.add(zone);
      for (const u of this.units.values()) {
        if (u.zone === zone && u.status !== "charging") {
          u.status = "held";
          this.emit({ type: "estop", unitId: u.id, source: "emergency_hold" });
        }
      }
    } else {
      this.heldZones.delete(zone);
      for (const u of this.units.values()) {
        if (u.zone === zone && u.status === "held") {
          u.status = u.pathAhead.length > 0 ? "in_transit" : "idle";
        }
      }
    }
  }

  isHeld(zone: ZoneId): boolean {
    return this.heldZones.has(zone);
  }

  /* -------------------------- demo-only controls ---------------------- *
   * Not part of FleetAdapter — these exist so the ops console can inject
   * the failures that make the demo credible.                             */

  injectBlock(unitId: string, seconds: number): void {
    const u = this.units.get(unitId);
    if (!u) return;
    u.blockedUntilMs = Date.now() + seconds * 1000;
    u.status = "blocked";
    this.emit({ type: "blocked", unitId, durationSec: seconds });
  }

  injectFault(unitId: string, code: string): void {
    const u = this.units.get(unitId);
    if (!u) return;
    u.status = "fault";
    this.emit({ type: "fault", unitId, code, severity: "critical" });
  }

  clearFault(unitId: string): void {
    const u = this.units.get(unitId);
    if (!u) return;
    u.blockedUntilMs = 0;
    u.status = u.pathAhead.length > 0 ? "in_transit" : "idle";
    this.emit({ type: "unblocked", unitId });
  }

  /* ------------------------------ routing ----------------------------- */

  private pickFreeUnit(zone: ZoneId): SimUnit | undefined {
    return [...this.units.values()].find(
      (u) => u.zone === zone && !u.missionId &&
        (u.status === "idle" || u.status === "charging") &&
        u.batteryPct > LOW_BATTERY_PCT,
    );
  }

  private routeToCurrentStop(u: SimUnit, m: MissionState) {
    const stop = m.stops[m.currentStopIndex];
    if (!stop) return;
    this.setPath(u, stop.waypointId);
    u.status = stop.kind === "pickup" ? "to_merchant" : "in_transit";
  }

  private sendHome(u: SimUnit) {
    this.setPath(u, u.homeDockId);
    u.status = "returning";
  }

  private setPath(u: SimUnit, targetId: string) {
    const from = u.waypointId ?? u.homeDockId;
    const p = this.graph.path(from, targetId);
    if (!p) {
      this.emit({ type: "fault", unitId: u.id, code: "no_route", severity: "critical" });
      u.status = "fault";
      return;
    }
    u.pathAhead = p.waypointIds.slice(1);
    this.beginLeg(u);
  }

  private beginLeg(u: SimUnit) {
    u.fromX = u.x;
    u.fromY = u.y;
    u.legProgress = 0;
    const next = u.pathAhead[0] ? this.graph.waypoint(u.pathAhead[0]) : null;
    if (!next) {
      u.legMetres = 0;
      return;
    }
    const dx = next.x - u.x;
    const dy = next.y - u.y;
    u.legMetres = Math.sqrt(dx * dx + dy * dy);
    u.heading = (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  /* ------------------------------- tick ------------------------------- */

  /** Advance the simulation. Called by the server loop, or by tests. */
  tick(dtMs: number, now = Date.now()): void {
    for (const u of this.units.values()) {
      if (u.status === "blocked" && now >= u.blockedUntilMs) {
        u.blockedUntilMs = 0;
        u.status = u.pathAhead.length > 0 ? "in_transit" : "idle";
        this.emit({ type: "unblocked", unitId: u.id });
      }

      const frozen =
        u.status === "held" || u.status === "blocked" || u.status === "fault" ||
        u.status === "loading" || u.status === "awaiting_handover";

      if (u.status === "charging" || (u.charging && u.status === "idle")) {
        const before = u.batteryPct;
        u.batteryPct = Math.min(100, u.batteryPct + CHARGE_PCT_PER_SEC * (dtMs / 1000));
        if (Math.floor(before) !== Math.floor(u.batteryPct)) {
          this.emit({ type: "battery", unitId: u.id, percent: Math.round(u.batteryPct), charging: true });
        }
        continue;
      }

      if (frozen || u.pathAhead.length === 0) {
        if (u.pathAhead.length === 0 && u.status === "returning") {
          u.status = "charging";
          u.charging = true;
        }
        continue;
      }

      // Move along the current leg.
      const advance = u.speedMps * (dtMs / 1000);
      u.legProgress += advance;
      u.batteryPct = Math.max(0, u.batteryPct - DRAIN_PCT_PER_SEC * (dtMs / 1000));

      if (u.legProgress >= u.legMetres) {
        const reachedId = u.pathAhead.shift()!;
        const reached = this.graph.waypoint(reachedId)!;
        u.waypointId = reachedId;
        u.x = reached.x;
        u.y = reached.y;

        if (u.pathAhead.length > 0) {
          this.beginLeg(u);
        } else {
          this.onArrive(u, reachedId);
        }
      } else {
        const t = u.legMetres === 0 ? 1 : u.legProgress / u.legMetres;
        const next = this.graph.waypoint(u.pathAhead[0])!;
        u.x = u.fromX + (next.x - u.fromX) * t;
        u.y = u.fromY + (next.y - u.fromY) * t;
      }
    }

    // Pose events are throttled — 500 ms is plenty for a smooth map.
    if (now - this.lastPoseEmit >= 500) {
      this.lastPoseEmit = now;
      for (const u of this.units.values()) {
        this.emit({ type: "pose", unitId: u.id, x: u.x, y: u.y, heading: u.heading });
      }
    }
  }

  private onArrive(u: SimUnit, waypointId: string) {
    const m = u.missionId ? this.missions.get(u.missionId) : null;
    if (!m || m.status !== "active") {
      if (u.status === "returning") {
        u.status = "charging";
        u.charging = true;
      } else {
        u.status = "idle";
      }
      return;
    }
    const stop = m.stops[m.currentStopIndex];
    if (!stop || stop.waypointId !== waypointId) {
      u.status = "idle";
      return;
    }
    u.status = stop.kind === "pickup" ? "loading" : "awaiting_handover";
    this.emit({
      type: "arrived",
      unitId: u.id,
      waypointId,
      missionId: m.id,
      stopIndex: m.currentStopIndex,
    });
  }

  /** Straight-line-free ETA for the remaining mission, in seconds. */
  etaSecondsFor(unitId: string): number {
    const u = this.units.get(unitId);
    if (!u || u.pathAhead.length === 0) return 0;
    let metres = Math.max(0, u.legMetres - u.legProgress);
    for (let i = 0; i < u.pathAhead.length - 1; i++) {
      const a = this.graph.waypoint(u.pathAhead[i])!;
      const b = this.graph.waypoint(u.pathAhead[i + 1])!;
      metres += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }
    return Math.round(metres / u.speedMps + u.pathAhead.length * 2.5);
  }

  freeCompartment(unitId: string): Compartment | undefined {
    return this.units.get(unitId)?.compartments.find((c) => !c.occupied);
  }
}
