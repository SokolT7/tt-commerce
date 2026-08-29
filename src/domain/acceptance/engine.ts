import type { Flight, Merchant, Promise_, Zone } from "@/domain/types";
import type { RouteGraph } from "@/domain/spatial/graph";

/**
 * Flight-aware acceptance — the single most important rule in the system.
 *
 * Never accept an order you cannot deliver before boarding. This prevents the
 * failure mode that destroys trust in gate delivery, and it must re-run on
 * every flight-board change for every in-flight order, because boarding times
 * and gates move.
 */

export type AcceptanceVerdict = "ACCEPT" | "WARN" | "REFUSE";

export interface AcceptanceInput {
  now: number;
  /**
   * Null while live flight data is unavailable. Without a boarding time there
   * is no deadline to protect, so the engine quotes a delivery estimate and
   * only refuses for reasons it can still see — an unreachable route, or a
   * zone that is not served.
   */
  flight: Flight | null;
  zone: Zone;
  merchant: Merchant;
  itemCount: number;
  /** How many orders the merchant already has in the queue. */
  queueDepth: number;
  deliveryWaypointId: string;
  /** Where the nearest free unit is right now. */
  unitWaypointId: string | null;
  graph: RouteGraph;
}

export interface AcceptanceResult {
  verdict: AcceptanceVerdict;
  promise: Promise_;
  /** Seconds of slack against the promise deadline. Negative means too late. */
  slackSeconds: number;
  reason: string;
}

const LOADING_SECONDS = 45;
const HANDOVER_BUFFER_SECONDS = 90;
/** Within this much of the deadline we still offer, but warn. */
const GRACE_SECONDS = 180;

/** Prep estimate: declared time, corrected for the hour and the queue. */
export function prepSecondsFor(
  merchant: Merchant,
  now: number,
  itemCount: number,
  queueDepth: number,
): number {
  const hour = new Date(now).getHours();
  const baseMinutes = merchant.prepByHour?.[hour] ?? merchant.prepMinutes;
  const itemLoad = Math.max(0, itemCount - 2) * 20;
  const queueLoad = queueDepth * 45;
  return Math.round(baseMinutes * 60 + itemLoad + queueLoad);
}

export function assess(input: AcceptanceInput): AcceptanceResult {
  const {
    now, flight, zone, merchant, itemCount, queueDepth,
    deliveryWaypointId, unitWaypointId, graph,
  } = input;

  const speed = zone.speedLimitMps;
  const prepSeconds = prepSecondsFor(merchant, now, itemCount, queueDepth);

  const toMerchantSeconds = unitWaypointId
    ? graph.travelSeconds(unitWaypointId, merchant.waypointId, speed)
    : 120; // no free unit: assume one frees up and comes from the retail core

  const toCustomerSeconds = graph.travelSeconds(
    merchant.waypointId,
    deliveryWaypointId,
    speed,
  );

  // The unit fetches while the shop prepares — these overlap.
  const untilLoaded = Math.max(prepSeconds, toMerchantSeconds) + LOADING_SECONDS;
  const totalSeconds = untilLoaded + toCustomerSeconds + HANDOVER_BUFFER_SECONDS;

  const deliverBy = now + totalSeconds * 1000;
  // No flight means no boarding deadline. The promise then bounds only the
  // delivery itself, so a late delivery is still detectable.
  const promiseDeadline = flight
    ? flight.boardingAt - zone.safetyMarginMin * 60_000
    : deliverBy + GRACE_SECONDS * 1000;
  const slackSeconds = Math.round((promiseDeadline - deliverBy) / 1000);

  const promise: Promise_ = {
    quotedAt: now,
    deliverBy,
    promiseDeadline,
    prepSeconds,
    toMerchantSeconds,
    loadingSeconds: LOADING_SECONDS,
    toCustomerSeconds,
    handoverBufferSeconds: HANDOVER_BUFFER_SECONDS,
    boardingAtQuoteTime: flight?.boardingAt ?? null,
    gateAtQuoteTime: flight?.gate ?? null,
  };

  if (!Number.isFinite(toCustomerSeconds) || !Number.isFinite(toMerchantSeconds)) {
    return {
      verdict: "REFUSE",
      promise,
      slackSeconds: -1,
      reason: `We can't reach ${zone.short} from ${merchant.name} — that route crosses a sealed boundary.`,
    };
  }

  if (!zone.orderable) {
    return {
      verdict: "REFUSE",
      promise,
      slackSeconds,
      reason: `Delivery doesn't reach ${zone.name} yet. Passport control is a sealed boundary — collect in store instead.`,
    };
  }

  if (slackSeconds >= 0) {
    const minutes = Math.round(slackSeconds / 60);
    const eta = Math.max(1, Math.round(totalSeconds / 60));
    return {
      verdict: "ACCEPT",
      promise,
      slackSeconds,
      reason: flight
        ? `Arrives about ${minutes} min before boarding.`
        : `Arrives in about ${eta} min.`,
    };
  }

  if (slackSeconds >= -GRACE_SECONDS) {
    return {
      verdict: "WARN",
      promise,
      slackSeconds,
      reason: "This is tight against boarding. We'd rather you collected in store.",
    };
  }

  const short = Math.abs(Math.round(slackSeconds / 60));
  return {
    verdict: "REFUSE",
    promise,
    slackSeconds,
    reason: `Boarding is too soon — we'd be about ${short} min late. Collect in store instead?`,
  };
}
