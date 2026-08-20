import { OrderApp } from "@/components/OrderApp";

/** QR deep link: a sticker on the seat encodes /order/wp/G07-A, so the
 *  delivery point is already chosen before the passenger does anything. */
export default async function OrderAtWaypoint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderApp initialWaypointId={id} />;
}
