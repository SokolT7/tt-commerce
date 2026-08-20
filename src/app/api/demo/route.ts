import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

/** Demo controls. Not part of the product — these exist so the failures that
 *  make the demo credible can be injected on cue from the ops console. */
export async function POST(req: Request) {
  const { action } = (await req.json()) as {
    action: "gate-change" | "no-show" | "block" | "hold-on" | "hold-off" | "clear-faults" | "reset";
  };
  const eng = engine();

  switch (action) {
    case "gate-change": await eng.injectGateChange(); break;
    case "no-show": eng.injectNoShow(); break;
    case "block": eng.injectBlock(); break;
    case "hold-on": await eng.setEmergencyHold(true); break;
    case "hold-off": await eng.setEmergencyHold(false); break;
    case "clear-faults": eng.clearFaults(); break;
    case "reset": eng.resetScenario(); break;
    default: return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
