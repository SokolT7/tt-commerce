import type { RouteEdge, Waypoint, Zone } from "@/domain/types";
import { metresBetween } from "@/domain/spatial/graph";

/**
 * Franjo Tuđman Airport (ZAG) — schematic terminal model.
 *
 * ⚠️  The gate layout and walking distances are a plausible RECONSTRUCTION,
 *     not a survey. Confirmed real references: gates 4/5 and 12/13 exist, and
 *     the Schengen / non-Schengen split runs through departures airside.
 *     Verify exact numbering, the zone split and real distances with MZLZ
 *     before the pilot. Say so if asked directly in a demo.
 *
 * Coordinates are metres on a schematic plan: x runs along the pier from the
 * landside hall (negative) through security (0) out to the far gates.
 */

export const ZONES: Zone[] = [
  {
    id: "landside",
    name: "Landside — public hall",
    short: "Landside",
    speedLimitMps: 1.0,
    safetyMarginMin: 20,
    orderable: false,
    allowsAgeRestricted: false,
  },
  {
    id: "airside-schengen",
    name: "Airside — Schengen departures",
    short: "Airside Schengen",
    speedLimitMps: 1.2,
    safetyMarginMin: 15,
    orderable: true,
    allowsAgeRestricted: false,
  },
  {
    id: "airside-non-schengen",
    name: "Airside — non-Schengen departures",
    short: "Non-Schengen",
    speedLimitMps: 1.2,
    // Larger margin: the passenger still has passport control ahead of them.
    safetyMarginMin: 22,
    orderable: false,
    allowsAgeRestricted: false,
  },
  {
    id: "arrivals",
    name: "Arrivals",
    short: "Arrivals",
    speedLimitMps: 1.0,
    safetyMarginMin: 0,
    orderable: false,
    allowsAgeRestricted: false,
  },
];

export const WAYPOINTS: Waypoint[] = [
  /* ---------- Landside (separate graph component: security screening) ------ */
  { id: "L-CHECKIN", zone: "landside", kind: "holding", name: "Check-in island", landmark: "Between check-in rows 3 and 4", x: -60, y: 0 },
  { id: "M-CAFENERO", zone: "landside", kind: "merchant", merchantId: "cafenero", name: "Café Nero — counter", landmark: "Departures hall, left of check-in", x: -70, y: 14 },
  { id: "M-TISAK", zone: "landside", kind: "merchant", merchantId: "tisak", name: "Tisak — kiosk", landmark: "Opposite the information desk", x: -50, y: -14 },
  { id: "M-CAKES", zone: "landside", kind: "merchant", merchantId: "cakes", name: "Cakes & Bakes — counter", landmark: "Upper level, by the escalators", x: -85, y: -14 },
  { id: "L-SECENTRY", zone: "landside", kind: "holding", name: "Security entrance", landmark: "Start of the screening queue", x: -20, y: 0 },

  /* ---------- Airside Schengen — the demo zone ---------------------------- */
  { id: "SEC-EXIT", zone: "airside-schengen", kind: "holding", name: "Security exit", landmark: "Where the screening lanes open into the shops", x: 0, y: 0 },
  { id: "DOCK-1", zone: "airside-schengen", kind: "dock", name: "Charging dock 1", landmark: "Service alcove behind duty free", x: 14, y: 16 },
  { id: "M-AELIA", zone: "airside-schengen", kind: "merchant", merchantId: "aelia", name: "Aelia Duty Free — back of house", landmark: "Staff door, right of the main entrance", x: 28, y: -13 },
  { id: "M-NEEDSTOP", zone: "airside-schengen", kind: "merchant", merchantId: "needstop", name: "NeedStop — collection point", landmark: "End of the counter, by the fridges", x: 52, y: 12 },
  { id: "G01-A", zone: "airside-schengen", kind: "gate", gate: "1", name: "Gate 1 — seating", landmark: "First seating bank past the shops", x: 70, y: 0 },
  { id: "G02-A", zone: "airside-schengen", kind: "gate", gate: "2", name: "Gate 2 — seating", landmark: "Beside the water fountain", x: 85, y: 0 },
  { id: "G03-A", zone: "airside-schengen", kind: "gate", gate: "3", name: "Gate 3 — seating", landmark: "Opposite the Gate Café", x: 100, y: 0 },
  { id: "M-GATECAFE", zone: "airside-schengen", kind: "merchant", merchantId: "gatecafe", name: "Gate Café — counter", landmark: "Between gates 3 and 4", x: 100, y: 13 },
  { id: "G04-A", zone: "airside-schengen", kind: "gate", gate: "4", name: "Gate 4 — seating", landmark: "Centre of the gate 4 bank", x: 115, y: 0 },
  { id: "G04-B", zone: "airside-schengen", kind: "gate", gate: "4", name: "Gate 4 — play area", landmark: "By the children's play area", x: 115, y: 9 },
  { id: "M-PUB", zone: "airside-schengen", kind: "merchant", merchantId: "pub", name: "The Pub — service end", landmark: "Left of the bar, by the standing tables", x: 122, y: -13 },
  { id: "G05-A", zone: "airside-schengen", kind: "gate", gate: "5", name: "Gate 5 — seating", landmark: "Centre of the gate 5 bank", x: 130, y: 0 },
  { id: "G05-B", zone: "airside-schengen", kind: "gate", gate: "5", name: "Gate 5 — window side", landmark: "Against the apron windows", x: 130, y: -9 },
  { id: "G06-A", zone: "airside-schengen", kind: "gate", gate: "6", name: "Gate 6 — seating", landmark: "Under the flight information screen", x: 145, y: 0 },
  { id: "M-APRON", zone: "airside-schengen", kind: "merchant", merchantId: "apron", name: "Apron View — pass", landmark: "Service pass at the restaurant entrance", x: 150, y: 13 },
  { id: "G07-A", zone: "airside-schengen", kind: "gate", gate: "7", name: "Gate 7 — north pillar", landmark: "By the tall pillar between gates 6 and 7", x: 160, y: 0 },
  { id: "G07-B", zone: "airside-schengen", kind: "gate", gate: "7", name: "Gate 7 — window side", landmark: "Against the windows facing the apron", x: 160, y: 9 },
  { id: "G08-A", zone: "airside-schengen", kind: "gate", gate: "8", name: "Gate 8 — seating", landmark: "Last bank before the pier narrows", x: 175, y: 0 },
  { id: "HOLD-1", zone: "airside-schengen", kind: "holding", name: "Holding point — far pier", landmark: "Service recess by gate 8", x: 182, y: 13 },
  { id: "DOCK-2", zone: "airside-schengen", kind: "dock", name: "Charging dock 2", landmark: "Service alcove at the pier end", x: 178, y: -14 },
  { id: "G09-A", zone: "airside-schengen", kind: "gate", gate: "9", name: "Gate 9 — seating", landmark: "Facing passport control", x: 190, y: 0 },

  /* ---------- Airside non-Schengen ---------------------------------------- *
   * Deliberately NOT connected to the Schengen component. Passport control is
   * a sealed boundary — a unit cannot cross it. Reaching these gates in
   * production requires the transfer-hatch pattern, not a longer route.       */
  { id: "DOCK-3", zone: "airside-non-schengen", kind: "dock", name: "Charging dock 3", landmark: "Non-Schengen service alcove", x: 210, y: -14 },
  { id: "G10-A", zone: "airside-non-schengen", kind: "gate", gate: "10", name: "Gate 10 — seating", landmark: "First bank past passport control", x: 215, y: 0 },
  { id: "G11-A", zone: "airside-non-schengen", kind: "gate", gate: "11", name: "Gate 11 — seating", landmark: "Beside the transfer desk", x: 230, y: 0 },
  { id: "G12-A", zone: "airside-non-schengen", kind: "gate", gate: "12", name: "Gate 12 — seating", landmark: "Centre of the gate 12 bank", x: 245, y: 0 },
  { id: "G12-B", zone: "airside-non-schengen", kind: "gate", gate: "12", name: "Gate 12 — play area", landmark: "By the children's play area", x: 245, y: 9 },
  { id: "G13-A", zone: "airside-non-schengen", kind: "gate", gate: "13", name: "Gate 13 — seating", landmark: "Centre of the gate 13 bank", x: 260, y: 0 },
  { id: "G13-B", zone: "airside-non-schengen", kind: "gate", gate: "13", name: "Gate 13 — window side", landmark: "Against the apron windows", x: 260, y: 9 },
  { id: "G14-A", zone: "airside-non-schengen", kind: "gate", gate: "14", name: "Gate 14 — seating", landmark: "Far end of the non-Schengen pier", x: 275, y: 0 },
];

/** Adjacency, declared once. Distances are computed from the plan geometry. */
const ADJACENCY: [string, string][] = [
  // Landside component
  ["M-CAKES", "M-CAFENERO"],
  ["M-CAFENERO", "L-CHECKIN"],
  ["L-CHECKIN", "M-TISAK"],
  ["L-CHECKIN", "L-SECENTRY"],

  // Airside Schengen: retail core
  ["SEC-EXIT", "DOCK-1"],
  ["SEC-EXIT", "M-AELIA"],
  ["M-AELIA", "M-NEEDSTOP"],
  ["M-NEEDSTOP", "G01-A"],

  // Airside Schengen: pier spine
  ["G01-A", "G02-A"],
  ["G02-A", "G03-A"],
  ["G03-A", "M-GATECAFE"],
  ["G03-A", "G04-A"],
  ["G04-A", "G04-B"],
  ["G04-A", "M-PUB"],
  ["G04-A", "G05-A"],
  ["G05-A", "G05-B"],
  ["G05-A", "G06-A"],
  ["G06-A", "M-APRON"],
  ["G06-A", "G07-A"],
  ["G07-A", "G07-B"],
  ["G07-A", "G08-A"],
  ["G08-A", "HOLD-1"],
  ["G08-A", "DOCK-2"],
  ["G08-A", "G09-A"],

  // Non-Schengen component — no edge crosses passport control, by design
  ["DOCK-3", "G10-A"],
  ["G10-A", "G11-A"],
  ["G11-A", "G12-A"],
  ["G12-A", "G12-B"],
  ["G12-A", "G13-A"],
  ["G13-A", "G13-B"],
  ["G13-A", "G14-A"],
];

const byId = new Map(WAYPOINTS.map((w) => [w.id, w]));

export const ROUTE_EDGES: RouteEdge[] = ADJACENCY.map(([from, to]) => ({
  from,
  to,
  metres: metresBetween(byId.get(from)!, byId.get(to)!),
}));
