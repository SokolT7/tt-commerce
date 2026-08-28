/**
 * Pure-logic tests for the FIDS mapping. No network, no credentials.
 *
 *   npm run test:fids
 */
import * as M from "../src/lib/fids/flightstats.ts";

let pass = 0, fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`}`);
};

const cfg = { appId: "x", appKey: "y", airport: "ZAG", hours: 6, boardingLeadMinutes: 35, timeZone: "Europe/Zagreb" };

console.log("\nlocalToInstant — Europe/Zagreb");
t("summer (CEST, +2)", M.localToInstant("2026-08-28", "14:35", "Europe/Zagreb")?.toISOString(), "2026-08-28T12:35:00.000Z");
t("winter (CET, +1)",  M.localToInstant("2026-01-15", "14:35", "Europe/Zagreb")?.toISOString(), "2026-01-15T13:35:00.000Z");
t("day of DST switch", M.localToInstant("2026-03-29", "05:00", "Europe/Zagreb")?.toISOString(), "2026-03-29T03:00:00.000Z");
t("malformed date", M.localToInstant("28/08/2026", "14:35", "Europe/Zagreb"), null);
t("malformed time", M.localToInstant("2026-08-28", "half two", "Europe/Zagreb"), null);

console.log("\nextractRows — envelope shape is not hard-coded");
t("top-level array", M.extractRows([{ flightNumber: "654" }]).length, 1);
t("nested under a key", M.extractRows({ fidsData: { flights: [{ flightNumber: "1" }, { flightNumber: "2" }] } }).length, 2);
t("ignores unrelated arrays", M.extractRows({ request: [{ x: 1 }], data: [{ flightNumber: "9" }] }).length, 1);
t("nothing usable", M.extractRows({ error: "no" }).length, 0);

console.log("\nmapRow");
const row = {
  airlineCode: "OU", airlineName: "Croatia Airlines", flightNumber: "654",
  destinationAirportCode: "CDG", destinationCity: "Paris", destinationCountryCode: "FR",
  gate: "7", scheduledGateDate: "2026-08-28", scheduledGateTime: "14:35", statusCode: "S",
};
const m = M.mapRow(row, cfg)!;
t("flight number formatted", m.flight_number, "OU 654");
t("departure instant", m.departs_at, "2026-08-28T12:35:00.000Z");
t("boarding = departure − 35 min", m.boarding_at, "2026-08-28T12:00:00.000Z");
t("France is EU", m.non_eu, false);
t("gate carried", m.gate, "7");
t("stable id", m.id, "OU654-2026-08-28");

t("Turkey is non-EU", M.mapRow({ ...row, destinationCountryCode: "TR" }, cfg)!.non_eu, true);
t("UK is non-EU", M.mapRow({ ...row, destinationCountryCode: "GB" }, cfg)!.non_eu, true);
t("unknown country → treated as EU", M.mapRow({ ...row, destinationCountryCode: "" }, cfg)!.non_eu, false);
t("cancelled status", M.mapRow({ ...row, statusCode: "C" }, cfg)!.status, "cancelled");
t("delayed flag", M.mapRow({ ...row, statusCode: "S", delayed: true }, cfg)!.status, "delayed");
t("estimated overrides scheduled",
  M.mapRow({ ...row, estimatedGateDate: "2026-08-28", estimatedGateTime: "15:10" }, cfg)!.departs_at,
  "2026-08-28T13:10:00.000Z");
t("no times → dropped", M.mapRow({ airlineCode: "OU", flightNumber: "1" }, cfg), null);
t("no airline → dropped", M.mapRow({ flightNumber: "1", scheduledGateDate: "2026-08-28", scheduledGateTime: "14:35" }, cfg), null);
t("missing gate → null", M.mapRow({ ...row, gate: "" }, cfg)!.gate, null);

console.log("\nbuildUrl");
const u = M.buildUrl(cfg);
t("path", u.pathname, "/flex/fids/rest/v1/json/ZAG/departures");
t("appId sent", u.searchParams.get("appId"), "x");
t("numHours sent", u.searchParams.get("numHours"), "6");
t("requests fields", (u.searchParams.get("requestedFields") ?? "").includes("scheduledGateTime"), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
