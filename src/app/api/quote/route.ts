import { engine } from "@/server/engine";
import type { CartLine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    merchantId: string;
    lines: CartLine[];
    flightId: string;
    deliveryWaypointId: string;
  };
  if (!body.merchantId || !body.flightId || !body.deliveryWaypointId) {
    return Response.json({ error: "merchantId, flightId and deliveryWaypointId are required" }, { status: 400 });
  }
  return Response.json(
    engine().quote(body.merchantId, body.lines ?? [], body.flightId, body.deliveryWaypointId),
  );
}
