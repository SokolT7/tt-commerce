import { engine } from "@/server/engine";
import type { Product } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action: "upsert" | "toggle" | "delete" | "prep";
    product?: Product;
    productId?: string;
    merchantId?: string;
    minutes?: number;
  };
  const eng = engine();

  switch (body.action) {
    case "upsert":
      if (!body.product?.name?.trim()) {
        return Response.json({ error: "A product needs a name" }, { status: 400 });
      }
      eng.upsertProduct({
        ...body.product,
        id: body.product.id || `p${Date.now().toString(36)}`,
        priceCents: Math.max(0, Math.round(body.product.priceCents)),
      });
      break;
    case "toggle":
      eng.toggleProduct(body.productId!);
      break;
    case "delete":
      eng.deleteProduct(body.productId!);
      break;
    case "prep":
      eng.setPrepMinutes(body.merchantId!, body.minutes ?? 4);
      break;
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
