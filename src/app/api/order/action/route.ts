import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

type Action =
  | "accept" | "reject" | "ready" | "load"
  | "handover" | "handover-complete";

export async function POST(req: Request) {
  const { orderId, action, reason, code } = (await req.json()) as {
    orderId: string; action: Action; reason?: string; code?: string;
  };
  const eng = engine();
  const order = eng.orders.get(orderId);
  if (!order) return Response.json({ error: "Unknown order" }, { status: 404 });

  switch (action) {
    case "accept":
      eng.merchantAccept(orderId);
      break;
    case "reject":
      eng.merchantReject(orderId, reason ?? "Item unavailable");
      break;
    case "ready":
      await eng.merchantReady(orderId);
      break;
    case "load":
      await eng.merchantLoad(orderId);
      break;
    case "handover": {
      const r = await eng.handover(orderId, code ?? "");
      if (!r.ok) return Response.json({ error: r.reason }, { status: 400 });
      break;
    }
    case "handover-complete":
      await eng.handoverComplete(orderId);
      break;
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  return Response.json({ order: eng.orders.get(orderId) });
}
