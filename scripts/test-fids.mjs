/**
 * Checks the FlightStats FIDS credentials in .env.local and shows what the
 * live board returns.
 *
 * Credentials are read from the file and never printed — only a masked
 * fingerprint, so the output is safe to paste anywhere.
 *
 *   node scripts/test-fids.mjs
 */
import { readFileSync } from "node:fs";

const env = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("No .env.local found. Copy .env.example to .env.local first.");
  process.exit(1);
}

const appId = (process.env.FLIGHTSTATS_APP_ID ?? env.FLIGHTSTATS_APP_ID ?? "").trim();
const appKey = (process.env.FLIGHTSTATS_APP_KEY ?? env.FLIGHTSTATS_APP_KEY ?? "").trim();
const airport = (env.FIDS_AIRPORT || "ZAG").trim();
const hours = Number(env.FIDS_HOURS || 6);

const mask = (s) => (s.length < 8 ? "*".repeat(s.length) : `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`);

if (!appId || !appKey) {
  console.error("FLIGHTSTATS_APP_ID and FLIGHTSTATS_APP_KEY are not set in .env.local.");
  console.error("Get them from developer.flightstats.com → My Account → Applications.");
  process.exit(1);
}

console.log(`airport   ${airport}   window ${hours}h`);
console.log(`appId     ${mask(appId)}`);
console.log(`appKey    ${mask(appKey)}\n`);

const fields = ["flightId","airlineCode","airlineName","flightNumber",
  "destinationAirportCode","destinationCity","destinationCountryCode","gate","terminal",
  "scheduledGateTime","scheduledGateDate","estimatedGateTime","estimatedGateDate",
  "statusCode","delayed","remarks"];

const url = new URL(`https://api.flightstats.com/flex/fids/rest/v1/json/${airport}/departures`);
url.searchParams.set("appId", appId);
url.searchParams.set("appKey", appKey);
url.searchParams.set("numHours", String(hours));
url.searchParams.set("requestedFields", fields.join(","));

let res;
try {
  res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
} catch (e) {
  console.error(`Could not reach FlightStats: ${e.message}`);
  process.exit(1);
}

const body = await res.text();

if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  if (/not active|inactive|pending/i.test(body)) {
    console.error("\nThe application is not active yet.");
    console.error("New applications are approved manually by Cirium — you get an email.");
    console.error("Check its State on developer.flightstats.com -> Applications.");
    console.error("Nothing is wrong with the key or the request.");
  } else if (res.status === 401 || res.status === 403) {
    console.error("\nThat is an authorisation failure. Usually one of:");
    console.error("  • the app id or key is wrong, or they belong to different applications");
    console.error("  • the FIDS API is not enabled for this application");
    console.error("  • the trial has expired or the rate limit is exceeded");
  }
  console.error(`\n${body.slice(0, 600)}`);
  process.exit(1);
}

let payload;
try { payload = JSON.parse(body); }
catch { console.error("Response was not JSON:\n" + body.slice(0, 400)); process.exit(1); }

// Find the flight array without assuming the envelope key.
const seen = new Set();
const findRows = (node) => {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  if (Array.isArray(node)) {
    const rows = node.filter((r) => r && typeof r === "object" && "flightNumber" in r);
    if (rows.length) return rows;
    for (const c of node) { const hit = findRows(c); if (hit) return hit; }
    return null;
  }
  for (const v of Object.values(node)) { const hit = findRows(v); if (hit) return hit; }
  return null;
};

const rows = findRows(payload) ?? [];
console.log(`HTTP ${res.status} — ${rows.length} departures in the next ${hours}h`);
console.log(`envelope keys: ${Object.keys(payload).join(", ")}\n`);

for (const r of rows.slice(0, 8)) {
  console.log(`  ${String(r.airlineCode ?? "").padEnd(3)}${String(r.flightNumber ?? "").padEnd(6)} ` +
    `${String(r.destinationAirportCode ?? "—").padEnd(4)} gate ${String(r.gate ?? "—").padEnd(4)} ` +
    `${String(r.scheduledGateDate ?? "")} ${String(r.scheduledGateTime ?? "")} ` +
    `${r.delayed ? "DELAYED" : ""}`);
}

if (rows.length === 0) {
  console.log("  (no departures returned — try a larger FIDS_HOURS, or check the airport code)");
} else {
  console.log("\nFirst row, all fields returned:");
  console.log(JSON.stringify(rows[0], null, 2));
}
