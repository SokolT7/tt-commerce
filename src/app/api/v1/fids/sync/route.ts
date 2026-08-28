import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDepartures, fidsConfigFromEnv } from "@/lib/fids/flightstats";

export const dynamic = "force-dynamic";

/**
 * Pulls the live departure board and replaces the flight table with it.
 *
 * Callable two ways: by a signed-in platform administrator from the dashboard,
 * or by a scheduler presenting FIDS_SYNC_SECRET as a bearer token.
 */
async function authorise(req: Request): Promise<boolean> {
  const secret = process.env.FIDS_SYNC_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${secret}`) return true;
  }
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const db = createAdminClient();
  const { data } = await db.from("platform_admins")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
}

export async function POST(req: Request) {
  if (!await authorise(req)) {
    return Response.json({ error: "Not authorised" }, { status: 403 });
  }

  const cfg = fidsConfigFromEnv();
  if (!cfg) {
    return Response.json({
      error: "No FlightStats credentials configured. Set FLIGHTSTATS_APP_ID and FLIGHTSTATS_APP_KEY in .env.local.",
    }, { status: 400 });
  }

  // dryRun returns what the mapping produced without writing anything, so the
  // field mapping can be confirmed against a real response before it is trusted.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  let result;
  try {
    result = await fetchDepartures(cfg);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "FlightStats request failed" },
      { status: 502 },
    );
  }

  if (dryRun) {
    return Response.json({
      dryRun: true,
      airport: cfg.airport,
      rowsReturned: result.rawCount,
      mapped: result.flights.length,
      boardingLeadMinutes: cfg.boardingLeadMinutes,
      timeZone: cfg.timeZone,
      flights: result.flights.slice(0, 10),
      sampleRawRow: result.sample,
    });
  }

  if (result.flights.length === 0) {
    return Response.json({
      error: `FlightStats returned ${result.rawCount} rows but none could be mapped. Run with ?dryRun=1 to inspect the raw shape.`,
    }, { status: 422 });
  }

  const db = createAdminClient();

  // Replace rather than merge: a flight that has dropped off the live board
  // should not linger and keep being offered to passengers. Orders reference
  // flights by id, so only rows with no orders attached are removed.
  const keep = result.flights.map((f) => f.id);
  const { data: referenced } = await db.from("orders").select("flight_id");
  const referencedIds = new Set((referenced ?? []).map((r) => r.flight_id).filter(Boolean) as string[]);

  const { data: existing } = await db.from("flights").select("id");
  const stale = (existing ?? [])
    .map((r) => r.id)
    .filter((id) => !keep.includes(id) && !referencedIds.has(id));

  if (stale.length > 0) await db.from("flights").delete().in("id", stale);

  const { error } = await db.from("flights").upsert(result.flights, { onConflict: "id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    airport: cfg.airport,
    synced: result.flights.length,
    removed: stale.length,
    rowsReturned: result.rawCount,
    nextBoarding: result.flights[0]?.boarding_at ?? null,
  });
}
