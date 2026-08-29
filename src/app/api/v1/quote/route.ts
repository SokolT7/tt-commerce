import { quote } from "@/server/ordering";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.merchantId || !body?.location) {
      return Response.json({ error: "merchantId and location are required" }, { status: 400 });
    }
    return Response.json(await quote(body));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not price this order" }, { status: 400 });
  }
}
