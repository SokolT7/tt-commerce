import type { ZoneId } from "@/domain/types";

/**
 * THE fleet abstraction.
 *
 * Three implementations sit behind this interface:
 *   CourierAdapter    — a human runner with a phone (production Release 1)
 *   SimulatedAdapter  — the demo and the permanent CI regression harness
 *   AlphaAdapter      — Suzhou Alpha Robotics Speedybot Max (production Release 3)
 *
 * Nothing above this interface knows which one is running. Swapping the
 * delivery mechanism swaps an implementation; it does not rewrite the product.
 *
 * Send this interface to Alpha Robotics and ask which methods they support,
 * rather than waiting for their documentation.
 */

export type UnitStatus =
  | "idle"
  | "to_merchant"
  | "loading"
  | "in_transit"
  | "awaiting_handover"
  | "returning"
  | "charging"
  | "held"
  | "blocked"
  | "fault";

export interface Compartment {
  id: string;
  label: string;
  occupied: boolean;
  locked: boolean;
  orderId: string | null;
}

export interface UnitState {
  id: string;
  name: string;
  zone: ZoneId;
  status: UnitStatus;
  batteryPct: number;
  charging: boolean;
  /** Last waypoint actually reached. */
  waypointId: string | null;
  x: number;
  y: number;
  heading: number;
  compartments: Compartment[];
  missionId: string | null;
  /** Remaining path as waypoint ids, for the ops map. */
  pathAhead: string[];
}

export type StopKind = "pickup" | "dropoff";

export interface MissionStop {
  waypointId: string;
  kind: StopKind;
  orderId: string;
  compartmentId?: string;
  done?: boolean;
}

export interface MissionSpec {
  zone: ZoneId;
  unitId?: string;
  stops: MissionStop[];
}

export interface MissionState {
  id: string;
  unitId: string;
  zone: ZoneId;
  stops: MissionStop[];
  currentStopIndex: number;
  status: "active" | "complete" | "cancelled";
  etaSeconds: number;
  startedAt: number;
}

export type FleetEvent =
  | { type: "pose"; unitId: string; x: number; y: number; heading: number }
  | { type: "arrived"; unitId: string; waypointId: string; missionId: string; stopIndex: number }
  | { type: "blocked"; unitId: string; durationSec: number }
  | { type: "unblocked"; unitId: string }
  | { type: "compartment_opened"; unitId: string; compartmentId: string; byWhom: string }
  | { type: "compartment_closed"; unitId: string; compartmentId: string }
  | { type: "battery"; unitId: string; percent: number; charging: boolean }
  | { type: "fault"; unitId: string; code: string; severity: "warn" | "critical" }
  | { type: "estop"; unitId: string; source: string }
  | { type: "mission_complete"; unitId: string; missionId: string };

export type Unsubscribe = () => void;

export interface FleetAdapter {
  /* discovery & state */
  listUnits(): Promise<UnitState[]>;
  getUnit(id: string): Promise<UnitState | null>;

  /* missions */
  createMission(spec: MissionSpec): Promise<string>;
  getMission(id: string): Promise<MissionState | null>;
  cancelMission(id: string, reason: string): Promise<void>;
  /** Re-target a stop that has not happened yet. Gate changes are the single
   *  most common exception in a terminal, so this is not optional — ask any
   *  candidate vendor whether their API supports it. */
  updateMissionStop(missionId: string, stopIndex: number, waypointId: string): Promise<void>;
  navigateTo(unitId: string, waypointId: string): Promise<void>;
  returnToDock(unitId: string): Promise<void>;

  /* cargo */
  openCompartment(unitId: string, compartmentId: string, byWhom: string): Promise<void>;
  lockCompartment(unitId: string, compartmentId: string): Promise<void>;

  /* safety & policy */
  setSpeedLimit(unitId: string, metresPerSecond: number): Promise<void>;
  emergencyHold(zone: ZoneId, held: boolean): Promise<void>;

  /* telemetry — push, not poll */
  subscribe(handler: (e: FleetEvent) => void): Unsubscribe;
}
