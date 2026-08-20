import { engine } from "@/server/engine";
import type { CartLine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    merchantId: string;
    lines: CartLine[];
    flightId: string;
    deliveryWaypointId: string;
    passengerName?: string;
  };
  const result = engine().placeOrder(body);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 409 });
  return Response.json({ order: result.order });
}
