import type { Order, OrderState } from "@/domain/types";

/**
 * The order state machine. One definition, owned here, rendered by every
 * surface. Never let two services disagree about where an order is.
 */

export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  DRAFT: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["AUTHORIZED", "CANCELLED"],
  AUTHORIZED: ["SENT_TO_MERCHANT", "CANCELLED"],
  SENT_TO_MERCHANT: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "ABORTED"],
  PREPARING: ["READY", "ABORTED"],
  READY: ["ROBOT_ASSIGNED", "ABORTED"],
  ROBOT_ASSIGNED: ["AT_MERCHANT", "ABORTED"],
  AT_MERCHANT: ["LOADED", "ABORTED"],
  LOADED: ["IN_TRANSIT", "ABORTED"],
  IN_TRANSIT: ["ARRIVED", "ABORTED"],
  ARRIVED: ["HANDED_OVER", "NO_SHOW", "ABORTED"],
  HANDED_OVER: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  ABORTED: [],
  NO_SHOW: ["HANDED_OVER", "ABORTED"],
};

/** Terminal states — nothing leaves these. */
export const TERMINAL_STATES: OrderState[] = [
  "COMPLETED", "REJECTED", "CANCELLED", "ABORTED",
];

export const LIVE_STATES: OrderState[] = (
  Object.keys(TRANSITIONS) as OrderState[]
).filter((s) => !TERMINAL_STATES.includes(s));

export function canTransition(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: OrderState, to: OrderState) {
    super(`Invalid order transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Mutates the order in place and appends to its history. */
export function transition(order: Order, to: OrderState, note?: string): Order {
  if (!canTransition(order.state, to)) {
    throw new InvalidTransitionError(order.state, to);
  }
  order.state = to;
  order.history.push({ at: Date.now(), state: to, note });
  return order;
}

/** Customer-facing copy for each state. */
export const STATE_COPY: Record<OrderState, { label: string; detail: string }> = {
  DRAFT: { label: "Building your order", detail: "Nothing charged yet" },
  VALIDATED: { label: "Checking your flight", detail: "Making sure we can reach you in time" },
  AUTHORIZED: { label: "Payment authorised", detail: "Sending to the shop" },
  SENT_TO_MERCHANT: { label: "Sent to the shop", detail: "Waiting for them to accept" },
  ACCEPTED: { label: "Shop accepted", detail: "They're starting your order" },
  PREPARING: { label: "Being prepared", detail: "Your order is being made" },
  READY: { label: "Ready for collection", detail: "Waiting for a delivery unit" },
  ROBOT_ASSIGNED: { label: "Delivery unit assigned", detail: "On its way to the shop" },
  AT_MERCHANT: { label: "At the shop", detail: "Loading your order" },
  LOADED: { label: "Loaded and sealed", detail: "Setting off to you" },
  IN_TRANSIT: { label: "On its way to you", detail: "Track it on the map" },
  ARRIVED: { label: "Arrived", detail: "Enter your code on the screen" },
  HANDED_OVER: { label: "Handed over", detail: "Enjoy — have a good flight" },
  COMPLETED: { label: "Complete", detail: "Thanks for ordering" },
  REJECTED: { label: "Shop couldn't take it", detail: "You have not been charged" },
  CANCELLED: { label: "Cancelled", detail: "You have not been charged" },
  ABORTED: { label: "We couldn't finish", detail: "Refunded in full" },
  NO_SHOW: { label: "Waiting for you", detail: "We couldn't find you at the delivery point" },
};

/** Rough progress for the tracking bar, 0–1. */
export function progressOf(state: OrderState): number {
  const order: OrderState[] = [
    "AUTHORIZED", "SENT_TO_MERCHANT", "ACCEPTED", "PREPARING", "READY",
    "ROBOT_ASSIGNED", "AT_MERCHANT", "LOADED", "IN_TRANSIT", "ARRIVED",
    "HANDED_OVER", "COMPLETED",
  ];
  const i = order.indexOf(state);
  if (i < 0) return 0;
  return (i + 1) / order.length;
}
