import { OrderApp } from "@/components/OrderApp";

/**
 * Seat QR deep link. The sticker on the seat encodes /order/s/<token>, so the
 * delivery point is already the passenger's exact seat before they do anything.
 */
export default async function OrderAtSeat({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderApp seatToken={token} />;
}
