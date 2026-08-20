import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await engine().snapshot();
  return Response.json(snap);
}
