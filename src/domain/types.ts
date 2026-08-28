/**
 * Shared domain types.
 *
 * This file is production code. Nothing here knows about React, Next.js,
 * the in-memory store, or whether the delivery mechanism is a robot,
 * a simulator, or a human runner with a phone.
 */

/* ------------------------------------------------------------------ *
 * Spatial
 * ------------------------------------------------------------------ */

export type ZoneId =
  | "landside"
  | "airside-schengen"
  | "airside-non-schengen"
  | "arrivals";

export interface Zone {
  id: ZoneId;
  name: string;
  short: string;
  /** Operating speed cap for delivery units in this zone (m/s). */
  speedLimitMps: number;
  /** Minutes of headroom required before boarding time. Larger where a
   *  passenger still has a border control between them and the aircraft. */
  safetyMarginMin: number;
  /** Whether passengers can order for delivery into this zone today. */
  orderable: boolean;
  /** Whether age-restricted goods may be handed over by an unattended unit. */
  allowsAgeRestricted: boolean;
}

export type WaypointKind = "gate" | "merchant" | "dock" | "holding";

export interface Waypoint {
  id: string;
  zone: ZoneId;
  kind: WaypointKind;
  /** Operational name, e.g. "Gate 7 — north pillar". */
  name: string;
  /** How a passenger finds it on foot. */
  landmark: string;
  gate?: string;
  merchantId?: string;
  /** Schematic terminal coordinates in metres. */
  x: number;
  y: number;
}

export interface RouteEdge {
  from: string;
  to: string;
  metres: number;
}

export interface PathResult {
  waypointIds: string[];
  metres: number;
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export type MerchantKind = "cafe" | "market" | "restaurant" | "bar" | "retail";

export interface Merchant {
  id: string;
  /** Stable, human-readable key used in URLs. */
  slug?: string;
  name: string;
  kind: MerchantKind;
  zone: ZoneId;
  /** Back-of-house collection waypoint. */
  waypointId: string;
  blurb: string;
  /** Declared preparation minutes, overridden per hour where set. */
  prepMinutes: number;
  prepByHour?: Record<number, number>;
  commissionRate: number;
  open: boolean;
  colour: string;
  logoUrl?: string;
}

export type ProductCategory =
  | "hot-drinks"
  | "cold-drinks"
  | "food"
  | "snacks"
  | "croatian"
  | "beauty"
  | "alcohol";

export interface Product {
  id: string;
  merchantId: string;
  /** Row in product_categories. Free-form categories replaced the fixed enum. */
  categoryId?: string;
  name: string;
  description: string;
  category?: ProductCategory;
  /** Cents, to avoid float money. */
  priceCents: number;
  available: boolean;
  /** Age-restricted goods cannot be handed over by an unattended unit.
   *  They stay in the catalogue, marked collect-in-store. */
  ageRestricted: boolean;
  allergens?: string[];
  emoji: string;
  imageUrl?: string;
  sortOrder?: number;
}

/* ------------------------------------------------------------------ *
 * Delivery location
 *
 * A passenger can say where they are in three ways. All three resolve to a
 * single dispatchable waypoint plus the distance they will walk, because a
 * unit navigates to surveyed points and cannot drive between rows of seating.
 * ------------------------------------------------------------------ */

export type DeliveryLocationKind = "seat" | "pin" | "waypoint";

export interface Seat {
  id: string;
  zone: ZoneId;
  gate?: string;
  rowLabel: string;
  seatLabel: string;
  x: number;
  y: number;
  navWaypointId: string;
  walkMetres: number;
}

export interface DeliveryLocation {
  kind: DeliveryLocationKind;
  seatId?: string;
  pinX?: number;
  pinY?: number;
  waypointId?: string;
  /** Resolved by the server — where the unit is actually dispatched. */
  navWaypointId: string;
  walkMetres: number;
  note: string;
  zone: ZoneId;
}

/* ------------------------------------------------------------------ *
 * Flights
 * ------------------------------------------------------------------ */

export interface Flight {
  id: string;
  number: string;
  carrier: string;
  destination: string;
  destinationCode: string;
  /** Whether the destination is outside the EU customs/VAT territory. */
  nonEu: boolean;
  gate: string;
  /** Epoch millis. Boarding time is what the promise engine works against. */
  boardingAt: number;
  departsAt: number;
  status: "on-time" | "delayed" | "boarding" | "gate-change";
}

export interface BoardingPass {
  flightId: string;
  passengerName: string;
  seat: string;
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export type OrderState =
  | "DRAFT"
  | "VALIDATED"
  | "AUTHORIZED"
  | "SENT_TO_MERCHANT"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "ROBOT_ASSIGNED"
  | "AT_MERCHANT"
  | "LOADED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "HANDED_OVER"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "ABORTED"
  | "NO_SHOW";

export interface OrderLine {
  productId: string;
  name: string;
  emoji: string;
  qty: number;
  /** Price snapshot at time of sale — never read live from the catalogue. */
  unitPriceCents: number;
}

/**
 * The quoted deadline AND every input used to compute it.
 * Needed to adjudicate SLA refunds and to improve the prep-time model.
 */
export interface Promise_ {
  quotedAt: number;
  deliverBy: number;
  promiseDeadline: number;
  prepSeconds: number;
  toMerchantSeconds: number;
  loadingSeconds: number;
  toCustomerSeconds: number;
  handoverBufferSeconds: number;
  boardingAtQuoteTime: number;
  gateAtQuoteTime: string;
}

export interface Order {
  id: string;
  ref: string;
  state: OrderState;
  merchantId: string;
  lines: OrderLine[];
  flightId: string;
  passengerName: string;
  deliveryWaypointId: string;
  zone: ZoneId;

  goodsCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  commissionCents: number;

  promise: Promise_;
  createdAt: number;
  history: OrderEvent[];

  missionId?: string;
  robotId?: string;
  compartmentId?: string;
  handoverCode?: string;

  rejectionReason?: string;
  slaMissed?: boolean;
  refundedCents?: number;
}

export interface OrderEvent {
  at: number;
  state: OrderState;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * Three separate financial documents, modelled apart from day one.
 * Retrofitting this split under Croatian Fiscalization 2.0 means redoing
 * every ledger entry under audit.
 */
export type FiscalDocKind =
  | "merchant-goods-receipt"
  | "platform-fee-receipt"
  | "commission-invoice";

export interface FiscalDoc {
  id: string;
  kind: FiscalDocKind;
  orderId: string;
  issuedBy: string;
  issuedTo: string;
  amountCents: number;
  at: number;
  /** Demo only. Production fiscalises in real time via a certified provider. */
  simulated: true;
}
