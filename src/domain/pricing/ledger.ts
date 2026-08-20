import type { FiscalDoc, Merchant, Order, OrderLine } from "@/domain/types";

export const DELIVERY_FEE_CENTS = 249;

export function goodsTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function commissionFor(merchant: Merchant, goodsCents: number): number {
  return Math.round(goodsCents * merchant.commissionRate);
}

export function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/**
 * Three separate financial documents, issued by different parties.
 * The shop is merchant of record for the goods; we only ever sell the
 * delivery service and invoice commission.
 */
export function fiscalDocsFor(order: Order, merchant: Merchant): FiscalDoc[] {
  const at = Date.now();
  return [
    {
      id: `${order.ref}-GOODS`,
      kind: "merchant-goods-receipt",
      orderId: order.id,
      issuedBy: merchant.name,
      issuedTo: order.passengerName,
      amountCents: order.goodsCents,
      at,
      simulated: true,
    },
    {
      id: `${order.ref}-FEE`,
      kind: "platform-fee-receipt",
      orderId: order.id,
      issuedBy: "Gate Delivery d.o.o.",
      issuedTo: order.passengerName,
      amountCents: order.deliveryFeeCents,
      at,
      simulated: true,
    },
    {
      id: `${order.ref}-COMM`,
      kind: "commission-invoice",
      orderId: order.id,
      issuedBy: "Gate Delivery d.o.o.",
      issuedTo: merchant.name,
      amountCents: order.commissionCents,
      at,
      simulated: true,
    },
  ];
}
