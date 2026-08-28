/**
 * Cirium / FlightStats FIDS API client.
 *
 *   https://api.flightstats.com/flex/fids/rest/v1/{format}/{airport}/{departures|arrivals}
 *
 * Two things about this API shape the code below:
 *
 * 1. It is built for departure boards, so it returns display strings
 *    (`scheduledGateTime` = "14:35", `scheduledGateDate` = "2026-08-28")
 *    rather than instants. They are combined and interpreted in the airport's
 *    local timezone.
 *
 * 2. It publishes DEPARTURE times, never boarding times. Our acceptance engine
 *    works against boarding, so boarding is derived by subtracting a lead. That
 *    is an assumption, not data — see FIDS_BOARDING_LEAD_MINUTES.
 */

const BASE = "https://api.flightstats.com/flex/fids/rest/v1/json";

/** Only what we actually map. Requesting fewer fields keeps the response small. */
export const REQUESTED_FIELDS = [
  "flightId", "airlineCode", "airlineName", "flightNumber",
  "destinationAirportCode", "destinationCity", "destinationCountryCode",
  "gate", "terminal",
  "scheduledGateTime", "scheduledGateDate",
  "estimatedGateTime", "estimatedGateDate",
  "statusCode", "delayed", "remarks",
] as const;

/** EU customs/VAT territory. Anything outside it is duty-free eligible. */
const EU = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

export interface FidsConfig {
  appId: string;
  appKey: string;
  airport: string;
  hours: number;
  boardingLeadMinutes: number;
  timeZone: string;
}

export function fidsConfigFromEnv(): FidsConfig | null {
  const appId = process.env.FLIGHTSTATS_APP_ID?.trim();
  const appKey = process.env.FLIGHTSTATS_APP_KEY?.trim();
  if (!appId || !appKey) return null;   // seeded board stays in use
  return {
    appId, appKey,
    airport: process.env.FIDS_AIRPORT?.trim() || "ZAG",
    hours: Number(process.env.FIDS_HOURS ?? 6),
    boardingLeadMinutes: Number(process.env.FIDS_BOARDING_LEAD_MINUTES ?? 35),
    timeZone: process.env.FIDS_TIMEZONE?.trim() || "Europe/Zagreb",
  };
}

export function buildUrl(cfg: FidsConfig, direction: "departures" | "arrivals" = "departures") {
  const url = new URL(`${BASE}/${cfg.airport}/${direction}`);
  url.searchParams.set("appId", cfg.appId);
  url.searchParams.set("appKey", cfg.appKey);
  url.searchParams.set("requestedFields", REQUESTED_FIELDS.join(","));
  url.searchParams.set("numHours", String(cfg.hours));
  return url;
}

type Raw = Record<string, unknown>;

/**
 * The envelope key has changed across versions of this API, so rather than
 * hard-coding one, find the first array whose objects carry a flightNumber.
 */
export function extractRows(payload: unknown): Raw[] {
  const seen = new Set<unknown>();
  const walk = (node: unknown): Raw[] | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      const rows = node.filter((r): r is Raw => !!r && typeof r === "object" && "flightNumber" in r);
      if (rows.length > 0) return rows;
      for (const item of node) { const hit = walk(item); if (hit) return hit; }
      return null;
    }
    for (const value of Object.values(node as Raw)) {
      const hit = walk(value);
      if (hit) return hit;
    }
    return null;
  };
  return walk(payload) ?? [];
}

/** Offset of a timezone from UTC at a given instant, in minutes. */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return (asUtc - at.getTime()) / 60000;
}

/** "2026-08-28" + "14:35" in a named zone → a correct instant. */
export function localToInstant(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!d || !t) return null;
  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // Apply the offset twice: the first pass can land on the wrong side of a
  // DST boundary, the second settles it.
  let guess = new Date(naive - tzOffsetMinutes(new Date(naive), timeZone) * 60000);
  guess = new Date(naive - tzOffsetMinutes(guess, timeZone) * 60000);
  return guess;
}

export interface MappedFlight {
  id: string;
  flight_number: string;
  carrier: string;
  destination: string;
  destination_code: string;
  non_eu: boolean;
  gate: string | null;
  boarding_at: string;
  departs_at: string;
  status: string;
}

const str = (r: Raw, k: string): string =>
  typeof r[k] === "string" ? (r[k] as string).trim() : "";

export function mapRow(r: Raw, cfg: FidsConfig): MappedFlight | null {
  const airline = str(r, "airlineCode");
  const number = str(r, "flightNumber");
  if (!airline || !number) return null;

  // Prefer the estimated gate time when the airline has revised it.
  const date = str(r, "estimatedGateDate") || str(r, "scheduledGateDate");
  const time = str(r, "estimatedGateTime") || str(r, "scheduledGateTime");
  const departs = localToInstant(date, time, cfg.timeZone);
  if (!departs) return null;

  const boarding = new Date(departs.getTime() - cfg.boardingLeadMinutes * 60000);
  const country = str(r, "destinationCountryCode").toUpperCase();

  const statusCode = str(r, "statusCode").toUpperCase();
  const status =
    statusCode === "C" ? "cancelled" :
    statusCode === "D" ? "diverted" :
    r.delayed === true ? "delayed" : "on-time";

  return {
    id: `${airline}${number}-${date}`.toUpperCase(),
    flight_number: `${airline} ${number}`,
    carrier: str(r, "airlineName") || airline,
    destination: str(r, "destinationCity") || str(r, "destinationAirportCode"),
    destination_code: str(r, "destinationAirportCode"),
    // Unknown country is treated as EU, so we never wrongly offer duty-free.
    non_eu: country ? !EU.has(country) : false,
    gate: str(r, "gate") || null,
    boarding_at: boarding.toISOString(),
    departs_at: departs.toISOString(),
    status,
  };
}

export interface FetchResult {
  flights: MappedFlight[];
  rawCount: number;
  sample: Raw | null;
}

export async function fetchDepartures(cfg: FidsConfig): Promise<FetchResult> {
  const res = await fetch(buildUrl(cfg).toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Never echo the URL back — it carries appId and appKey.
    throw new Error(
      res.status === 401 || res.status === 403
        ? "FlightStats rejected the credentials. Check FLIGHTSTATS_APP_ID and FLIGHTSTATS_APP_KEY."
        : `FlightStats returned ${res.status}. ${body.slice(0, 200)}`,
    );
  }

  const payload = await res.json();
  const rows = extractRows(payload);
  const flights: MappedFlight[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const m = mapRow(row, cfg);
    if (m && !seen.has(m.id)) { seen.add(m.id); flights.push(m); }
  }
  flights.sort((a, b) => a.boarding_at.localeCompare(b.boarding_at));
  return { flights, rawCount: rows.length, sample: rows[0] ?? null };
}
