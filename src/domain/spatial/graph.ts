import type { PathResult, RouteEdge, Waypoint } from "@/domain/types";

/**
 * Route graph over surveyed waypoints.
 *
 * A delivery unit navigates to NAMED WAYPOINTS on a pre-surveyed map, never to
 * arbitrary coordinates a customer picked. The whole product is built on that.
 */
export class RouteGraph {
  private readonly nodes = new Map<string, Waypoint>();
  private readonly adj = new Map<string, { to: string; metres: number }[]>();

  constructor(waypoints: Waypoint[], edges: RouteEdge[]) {
    for (const w of waypoints) {
      this.nodes.set(w.id, w);
      this.adj.set(w.id, []);
    }
    for (const e of edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) {
        throw new Error(`Route edge references unknown waypoint: ${e.from} → ${e.to}`);
      }
      this.adj.get(e.from)!.push({ to: e.to, metres: e.metres });
      this.adj.get(e.to)!.push({ to: e.from, metres: e.metres });
    }
  }

  waypoint(id: string): Waypoint | undefined {
    return this.nodes.get(id);
  }

  all(): Waypoint[] {
    return [...this.nodes.values()];
  }

  /** Dijkstra. Small graph, so a linear scan for the minimum is fine. */
  path(fromId: string, toId: string): PathResult | null {
    if (fromId === toId) return { waypointIds: [fromId], metres: 0 };
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;

    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const unvisited = new Set(this.nodes.keys());
    for (const id of unvisited) dist.set(id, Infinity);
    dist.set(fromId, 0);

    while (unvisited.size > 0) {
      let current: string | null = null;
      let best = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id)!;
        if (d < best) {
          best = d;
          current = id;
        }
      }
      if (current === null || best === Infinity) break;
      if (current === toId) break;
      unvisited.delete(current);

      for (const edge of this.adj.get(current)!) {
        if (!unvisited.has(edge.to)) continue;
        const alt = best + edge.metres;
        if (alt < dist.get(edge.to)!) {
          dist.set(edge.to, alt);
          prev.set(edge.to, current);
        }
      }
    }

    if (!prev.has(toId) && fromId !== toId) return null;

    const ids: string[] = [toId];
    let cursor = toId;
    while (cursor !== fromId) {
      const p = prev.get(cursor);
      if (!p) return null;
      ids.unshift(p);
      cursor = p;
    }
    return { waypointIds: ids, metres: dist.get(toId)! };
  }

  /**
   * Honest traversal estimate: distance at operating speed, plus a fixed
   * per-waypoint cost for the turns, doors and crowd negotiation that a
   * straight-line speed calculation always flatters away.
   */
  travelSeconds(fromId: string, toId: string, speedMps: number): number {
    const p = this.path(fromId, toId);
    if (!p) return Infinity;
    const hops = Math.max(0, p.waypointIds.length - 1);
    return Math.round(p.metres / speedMps + hops * 2.5);
  }
}

/** Euclidean distance with a detour factor — real walking paths are not straight. */
export function metresBetween(a: Waypoint, b: Waypoint, detour = 1.15): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy) * detour);
}
