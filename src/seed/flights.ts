import type { Flight } from "@/domain/types";

const MIN = 60_000;

/**
 * Six seeded ZAG departures, generated relative to the moment the scenario is
 * reset so the demo is always "live". Deliberately includes:
 *   - OU 654 to Paris at gate 7  → the main demo flight
 *   - LH 1727 to Munich, boarding in 12 minutes → triggers the REFUSAL case
 *   - Two non-Schengen departures → demonstrate the sealed zone
 */
export function buildFlights(now: number): Flight[] {
  return [
    {
      id: "ou654", number: "OU 654", carrier: "Croatia Airlines",
      destination: "Paris Charles de Gaulle", destinationCode: "CDG", nonEu: false,
      gate: "7", boardingAt: now + 42 * MIN, departsAt: now + 62 * MIN, status: "on-time",
    },
    {
      id: "lh1727", number: "LH 1727", carrier: "Lufthansa",
      destination: "Munich", destinationCode: "MUC", nonEu: false,
      gate: "3", boardingAt: now + 12 * MIN, departsAt: now + 32 * MIN, status: "on-time",
    },
    {
      id: "ou490", number: "OU 490", carrier: "Croatia Airlines",
      destination: "Frankfurt", destinationCode: "FRA", nonEu: false,
      gate: "5", boardingAt: now + 55 * MIN, departsAt: now + 75 * MIN, status: "on-time",
    },
    {
      id: "ou340", number: "OU 340", carrier: "Croatia Airlines",
      destination: "Amsterdam", destinationCode: "AMS", nonEu: false,
      gate: "8", boardingAt: now + 78 * MIN, departsAt: now + 98 * MIN, status: "on-time",
    },
    {
      id: "fr4834", number: "FR 4834", carrier: "Ryanair",
      destination: "London Stansted", destinationCode: "STN", nonEu: true,
      gate: "12", boardingAt: now + 70 * MIN, departsAt: now + 90 * MIN, status: "on-time",
    },
    {
      id: "tk1054", number: "TK 1054", carrier: "Turkish Airlines",
      destination: "Istanbul", destinationCode: "IST", nonEu: true,
      gate: "13", boardingAt: now + 95 * MIN, departsAt: now + 115 * MIN, status: "on-time",
    },
  ];
}

export const PASSENGER_NAMES = [
  "M. Novak", "I. Horvat", "A. Kovačević", "L. Marić", "P. Babić", "S. Jurić",
];
