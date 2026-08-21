import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every LAN address this machine currently has.
 *
 * `next dev` blocks cross-origin requests, and opening the demo on a phone or
 * tablet means loading it over a LAN IP rather than localhost — which makes
 * every client-side request cross-origin, so pages render but the SSE stream
 * is refused and each surface sits on "connecting".
 *
 * Detected at startup rather than hardcoded, because the address changes with
 * the network — a phone hotspot hands out 172.20.10.x, home Wi-Fi 192.168.x.x.
 * Restart `npm run dev` after switching networks.
 */
function lanOrigins(): string[] {
  const found = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) found.add(address.address);
    }
  }
  return [...found];
}

const nextConfig: NextConfig = {
  // The dev overlay badge sits on top of every surface. This is a demo that
  // gets shown on real devices in real meetings — it has no place there.
  devIndicators: false,

  allowedDevOrigins: lanOrigins(),
};

export default nextConfig;
