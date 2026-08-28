"use client";

import type { RouteEdge, Waypoint, ZoneId } from "@/domain/types";
import type { UnitState } from "@/domain/fleet/adapter";

/** Y is exaggerated: the real pier is ~360 m long and ~30 m wide, which draws
 *  as an unreadable hairline. This is a schematic, not a survey drawing. */
const Y_SCALE = 2.4;
const PAD = 26;

const ZONE_COLOUR: Record<ZoneId, string> = {
  landside: "#3d5a73",
  "airside-schengen": "#0e6e5c",
  "airside-non-schengen": "#9e6410",
  arrivals: "#6a4a6e",
};

export interface MapUnit extends UnitState {
  etaSeconds?: number;
}

export function TerminalMap({
  waypoints,
  edges,
  units = [],
  zones,
  highlightWaypointId,
  selectableKinds,
  onSelect,
  onPinDrop,
  pin,
  seat,
  dark = false,
  showLabels = true,
  className = "",
}: {
  waypoints: Waypoint[];
  edges: RouteEdge[];
  units?: MapUnit[];
  zones?: ZoneId[];
  highlightWaypointId?: string | null;
  selectableKinds?: Waypoint["kind"][];
  onSelect?: (w: Waypoint) => void;
  /** Tapping the map reports terminal coordinates in metres. */
  onPinDrop?: (x: number, y: number) => void;
  pin?: { x: number; y: number } | null;
  seat?: { x: number; y: number; label: string } | null;
  dark?: boolean;
  showLabels?: boolean;
  className?: string;
}) {
  const inScope = zones ? waypoints.filter((w) => zones.includes(w.zone)) : waypoints;
  const ids = new Set(inScope.map((w) => w.id));
  const scopedEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const byId = new Map(inScope.map((w) => [w.id, w]));

  if (inScope.length === 0) return null;

  const xs = inScope.map((w) => w.x);
  const ys = inScope.map((w) => w.y * Y_SCALE);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;
  const w = maxX - minX;
  const h = maxY - minY;

  const line = dark ? "#2c3233" : "#d3d7d2";
  const ink = dark ? "#e8ebe8" : "#14171a";
  const muted = dark ? "#8c948f" : "#6e7570";
  const surface = dark ? "#181c1d" : "#ffffff";

  const px = (v: number) => v;
  const py = (v: number) => v * Y_SCALE;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPinDrop) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    // Map the click back through the viewBox into terminal metres.
    const vx = minX + ((e.clientX - rect.left) / rect.width) * w;
    const vy = minY + ((e.clientY - rect.top) / rect.height) * h;
    onPinDrop(Math.round(vx * 10) / 10, Math.round((vy / Y_SCALE) * 10) / 10);
  };

  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block",
               cursor: onPinDrop ? "crosshair" : undefined, touchAction: "manipulation" }}
      role={onPinDrop ? "application" : "img"}
      onClick={handleClick}
      aria-label="Schematic map of the terminal showing delivery points and units"
    >
      {/* corridors */}
      {scopedEdges.map((e) => {
        const a = byId.get(e.from)!;
        const b = byId.get(e.to)!;
        return (
          <line
            key={`${e.from}-${e.to}`}
            x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)}
            stroke={line} strokeWidth={3.5} strokeLinecap="round"
          />
        );
      })}

      {/* waypoints */}
      {inScope.map((wp) => {
        const colour = ZONE_COLOUR[wp.zone];
        const isHighlight = wp.id === highlightWaypointId;
        const selectable = selectableKinds?.includes(wp.kind) ?? false;
        const r = wp.kind === "gate" ? 4.5 : wp.kind === "merchant" ? 4.5 : 4;

        return (
          <g
            key={wp.id}
            onClick={selectable && onSelect ? () => onSelect(wp) : undefined}
            style={{ cursor: selectable && onSelect ? "pointer" : "default" }}
          >
            {isHighlight && (
              <circle cx={px(wp.x)} cy={py(wp.y)} r={r + 3.5} fill={colour} opacity={0.25} className="pulse-ring" />
            )}
            {wp.kind === "merchant" ? (
              <rect
                x={px(wp.x) - r} y={py(wp.y) - r} width={r * 2} height={r * 2} rx={2}
                fill={isHighlight ? colour : surface} stroke={colour} strokeWidth={2.5}
              />
            ) : wp.kind === "dock" ? (
              <rect
                x={px(wp.x) - r} y={py(wp.y) - r} width={r * 2} height={r * 2} rx={r}
                fill={surface} stroke={muted} strokeWidth={1.4} strokeDasharray="2 1.5"
              />
            ) : (
              <circle
                cx={px(wp.x)} cy={py(wp.y)} r={r}
                fill={isHighlight ? colour : surface} stroke={colour}
                strokeWidth={isHighlight ? 2.4 : 1.6}
              />
            )}
            {/* one label per gate — the A waypoint carries it, so paired
                seating points don't stack two numbers on top of each other */}
            {showLabels && wp.kind === "gate" && wp.id.endsWith("-A") && (
              <text
                x={px(wp.x)} y={py(wp.y) - r - 4} textAnchor="middle"
                fontSize={7} fontWeight={600} fill={isHighlight ? colour : ink}
                fontFamily="var(--font-mono)"
              >
                {wp.gate}
              </text>
            )}
            {showLabels && wp.kind === "merchant" && (
              <text
                x={px(wp.x)} y={py(wp.y) + (wp.y > 0 ? r + 8 : -r - 5)} textAnchor="middle"
                fontSize={5.5} fill={muted} fontFamily="var(--font-mono)"
              >
                {wp.name.split(" —")[0]}
              </text>
            )}
          </g>
        );
      })}

      {/* the passenger's own position: a scanned seat, or a dropped pin */}
      {seat && (
        <g transform={`translate(${px(seat.x)} ${py(seat.y)})`}>
          <circle r={13} fill="#0e6e5c" opacity={0.18} className="pulse-ring" />
          <rect x={-7} y={-7} width={14} height={14} rx={3} fill="#0e6e5c" stroke={surface} strokeWidth={2} />
          <text y={-13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0e6e5c"
                fontFamily="var(--font-mono)">{seat.label}</text>
        </g>
      )}
      {pin && (
        <g transform={`translate(${px(pin.x)} ${py(pin.y)})`}>
          <circle r={13} fill="#a8332b" opacity={0.18} className="pulse-ring" />
          <path d="M0,2 C-6,-6 -9,-10 -9,-14 A9,9 0 0 1 9,-14 C9,-10 6,-6 0,2 Z"
                fill="#a8332b" stroke={surface} strokeWidth={1.8} />
          <circle cx={0} cy={-14} r={3.2} fill={surface} />
        </g>
      )}

      {/* units */}
      {units.map((u) => {
        const busy = ["in_transit", "to_merchant", "returning"].includes(u.status);
        const bad = ["fault", "blocked", "held"].includes(u.status);
        const colour = bad ? "#a8332b" : busy ? "#0e6e5c" : muted;
        return (
          <g key={u.id} transform={`translate(${px(u.x)} ${py(u.y)})`}>
            <circle r={10} fill={colour} opacity={0.16} />
            <rect x={-5} y={-6.5} width={10} height={13} rx={2.5} fill={colour} stroke={surface} strokeWidth={1.2} />
            <circle cx={0} cy={-2.4} r={1.5} fill={surface} />
            {/* offset to the side: above collides with gate numbers, below
                collides with merchant labels */}
            <text x={8} y={2} textAnchor="start" fontSize={5.5} fill={colour} fontFamily="var(--font-mono)" fontWeight={600}>
              {u.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
