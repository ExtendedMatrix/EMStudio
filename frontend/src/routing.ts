// Orthogonal edge routing, yEd-style: squared polylines, arrowheads at the
// target, and "bridge" arcs where a horizontal run crosses a vertical run of
// another edge. Routes are cached per scene + edge-filter key and recomputed
// on any document mutation (scenes are rebuilt then).
import { visibleBoxOf, type Scene } from "./scene";
import type { Box } from "./shape-geom";

/**
 * TOCCARE · an edge starts and ends on what is DRAWN (`visibleBoxOf`), not on the
 * node box: for a document the box is 90 wide around a 23 px sheet, and ports
 * spread along the box put the connector's foot in empty canvas. For every other
 * type the two rects coincide, so their routes do not change.
 */
function boxesOf(scene: Scene): Map<string, Box> {
  const m = new Map<string, Box>();
  for (const n of scene.byId.values()) m.set(n.id, visibleBoxOf(n));
  return m;
}

export interface EdgeRoute {
  /** polyline points, world space (first = source anchor, last = target) */
  pts: { x: number; y: number }[];
  /** per-segment bridge crossings: bridges[i] = xs on segment i (sorted) */
  bridges: number[][];
}

/** Edge types with no inherent direction — drawn without arrowheads. */
export const SYMMETRIC_EDGES = new Set([
  "has_same_time",
  "is_physically_equal_to",
  "equals",
  "bonded_to",
  "is_bonded_to",
  "contrasts_with",
]);

const EPS = 0.5;

/**
 * Port assignment: multiple edges leaving/entering the same node side get
 * distinct anchor positions spread along the side (yEd-style ports),
 * ordered by the position of the opposite endpoint so fans don't cross.
 */
function computePorts(scene: Scene, vb: Map<string, Box>): Map<string, number> {
  interface Slot {
    edge: number;
    end: "s" | "t";
    otherPos: number;
  }
  const sides = new Map<string, Slot[]>(); // `${nodeId}|${side}` → slots
  const push = (
    nodeId: string,
    side: string,
    edge: number,
    end: "s" | "t",
    otherPos: number,
  ): void => {
    const key = `${nodeId}|${side}`;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key)!.push({ edge, end, otherPos });
  };

  for (let i = 0; i < scene.edges.length; i++) {
    const e = scene.edges[i];
    const a = vb.get(e.source)!;
    const b = vb.get(e.target)!;
    if (b.y >= a.y + a.h - 2) {
      push(e.source, "bottom", i, "s", b.x + b.w / 2);
      push(e.target, "top", i, "t", a.x + a.w / 2);
    } else if (a.y >= b.y + b.h - 2) {
      push(e.source, "top", i, "s", b.x + b.w / 2);
      push(e.target, "bottom", i, "t", a.x + a.w / 2);
    } else if (b.x + b.w / 2 >= a.x + a.w / 2) {
      push(e.source, "right", i, "s", b.y + b.h / 2);
      push(e.target, "left", i, "t", a.y + a.h / 2);
    } else {
      push(e.source, "left", i, "s", b.y + b.h / 2);
      push(e.target, "right", i, "t", a.y + a.h / 2);
    }
  }

  // distribute anchors along each side
  const ports = new Map<string, number>(); // `${edge}|${end}` → coordinate
  for (const [key, slots] of sides) {
    const nodeId = key.slice(0, key.lastIndexOf("|"));
    const side = key.slice(key.lastIndexOf("|") + 1);
    const n = vb.get(nodeId)!;
    slots.sort(
      (a, b) => a.otherPos - b.otherPos || a.edge - b.edge,
    );
    const m = slots.length;
    slots.forEach((slot, k) => {
      const f = (k + 1) / (m + 1);
      const coord =
        side === "top" || side === "bottom" ? n.x + n.w * f : n.y + n.h * f;
      ports.set(`${slot.edge}|${slot.end}`, coord);
    });
  }
  return ports;
}

function routeOne(
  scene: Scene,
  si: number,
  ports: Map<string, number>,
  vb: Map<string, Box>,
): { x: number; y: number }[] {
  const e = scene.edges[si];
  const a = vb.get(e.source)!;
  const b = vb.get(e.target)!;
  const sp = ports.get(`${si}|s`);
  const tp = ports.get(`${si}|t`);
  const acx = sp ?? a.x + a.w / 2;
  const bcx = tp ?? b.x + b.w / 2;
  const acy = sp ?? a.y + a.h / 2;
  const bcy = tp ?? b.y + b.h / 2;

  // predominantly vertical when there is a real vertical gap
  if (b.y >= a.y + a.h - 2) {
    const y0 = a.y + a.h;
    const y1 = b.y;
    if (Math.abs(acx - bcx) < EPS)
      return [
        { x: acx, y: y0 },
        { x: bcx, y: y1 },
      ];
    const my = (y0 + y1) / 2;
    return [
      { x: acx, y: y0 },
      { x: acx, y: my },
      { x: bcx, y: my },
      { x: bcx, y: y1 },
    ];
  }
  if (a.y >= b.y + b.h - 2) {
    const y0 = a.y;
    const y1 = b.y + b.h;
    if (Math.abs(acx - bcx) < EPS)
      return [
        { x: acx, y: y0 },
        { x: bcx, y: y1 },
      ];
    const my = (y0 + y1) / 2;
    return [
      { x: acx, y: y0 },
      { x: acx, y: my },
      { x: bcx, y: my },
      { x: bcx, y: y1 },
    ];
  }
  // same vertical band → horizontal route (ports are y coordinates here)
  const sy = acy;
  const ty = bcy;
  if (b.x + b.w / 2 >= a.x + a.w / 2) {
    const x0 = a.x + a.w;
    const x1 = b.x;
    if (Math.abs(sy - ty) < EPS || x1 <= x0)
      return [
        { x: x0, y: sy },
        { x: Math.max(x1, x0 + 4), y: ty },
      ];
    const mx = (x0 + x1) / 2;
    return [
      { x: x0, y: sy },
      { x: mx, y: sy },
      { x: mx, y: ty },
      { x: x1, y: ty },
    ];
  }
  const x0 = a.x;
  const x1 = b.x + b.w;
  if (Math.abs(sy - ty) < EPS || x0 <= x1)
    return [
      { x: x0, y: sy },
      { x: Math.min(x1, x0 - 4), y: ty },
    ];
  const mx = (x0 + x1) / 2;
  return [
    { x: x0, y: sy },
    { x: mx, y: sy },
    { x: mx, y: ty },
    { x: x1, y: ty },
  ];
}

interface VSeg {
  x: number;
  y0: number;
  y1: number;
  owner: number;
}

export function routeScene(scene: Scene, visible: boolean[]): EdgeRoute[] {
  const vb = boxesOf(scene);
  const ports = computePorts(scene, vb);
  const routes: EdgeRoute[] = scene.edges.map((_, i) => ({
    pts: routeOne(scene, i, ports, vb),
    bridges: [],
  }));

  // vertical segments of visible edges, sorted by x for fast range lookup
  const verticals: VSeg[] = [];
  routes.forEach((r, i) => {
    if (!visible[i]) return;
    for (let s = 0; s < r.pts.length - 1; s++) {
      const p = r.pts[s];
      const q = r.pts[s + 1];
      if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) > EPS) {
        verticals.push({
          x: p.x,
          y0: Math.min(p.y, q.y),
          y1: Math.max(p.y, q.y),
          owner: i,
        });
      }
    }
  });
  verticals.sort((a, b) => a.x - b.x);
  const xs = verticals.map((v) => v.x);
  const lowerBound = (x: number): number => {
    let lo = 0,
      hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const MARGIN = 4; // don't draw bridges glued to a corner
  routes.forEach((r, i) => {
    if (!visible[i]) return;
    r.bridges = r.pts.map(() => []);
    for (let s = 0; s < r.pts.length - 1; s++) {
      const p = r.pts[s];
      const q = r.pts[s + 1];
      if (Math.abs(p.y - q.y) > EPS) continue; // not horizontal
      const y = p.y;
      const xlo = Math.min(p.x, q.x) + MARGIN;
      const xhi = Math.max(p.x, q.x) - MARGIN;
      if (xhi <= xlo) continue;
      const found: number[] = [];
      for (let k = lowerBound(xlo); k < verticals.length && xs[k] <= xhi; k++) {
        const v = verticals[k];
        if (v.owner === i) continue;
        if (y > v.y0 + MARGIN && y < v.y1 - MARGIN) found.push(v.x);
      }
      // sort along drawing direction
      found.sort(p.x <= q.x ? (a, b) => a - b : (a, b) => b - a);
      r.bridges[s] = found;
    }
  });

  return routes;
}

/** Trace a routed edge into the current path, with bridge bumps. */
export function traceRoute(
  ctx: CanvasRenderingContext2D,
  r: EdgeRoute,
  bridgeRadius: number,
): void {
  const pts = r.pts;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let s = 0; s < pts.length - 1; s++) {
    const p = pts[s];
    const q = pts[s + 1];
    const xsOn = bridgeRadius > 0 ? (r.bridges[s] ?? []) : [];
    if (!xsOn.length || Math.abs(p.y - q.y) > EPS) {
      ctx.lineTo(q.x, q.y);
      continue;
    }
    const ltr = p.x <= q.x;
    for (const bx of xsOn) {
      if (ltr) {
        ctx.lineTo(bx - bridgeRadius, p.y);
        ctx.arc(bx, p.y, bridgeRadius, Math.PI, 0, false);
      } else {
        ctx.lineTo(bx + bridgeRadius, p.y);
        ctx.arc(bx, p.y, bridgeRadius, 0, Math.PI, true);
      }
    }
    ctx.lineTo(q.x, q.y);
  }
}

/** The arrowhead's triangle added to the current path (a batch fills once). */
export function arrowheadPath(ctx: CanvasRenderingContext2D, r: EdgeRoute, size: number): void {
  const pts = r.pts;
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  if (!tip || !prev) return;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ux * size - uy * size * 0.45, tip.y - uy * size + ux * size * 0.45);
  ctx.lineTo(tip.x - ux * size + uy * size * 0.45, tip.y - uy * size - ux * size * 0.45);
  ctx.closePath();
}

/** Filled arrowhead at the route end, pointing along the last segment. */
export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  r: EdgeRoute,
  size: number,
  color: string,
): void {
  const pts = r.pts;
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ux * size - uy * size * 0.45, tip.y - uy * size + ux * size * 0.45);
  ctx.lineTo(tip.x - ux * size + uy * size * 0.45, tip.y - uy * size - ux * size * 0.45);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
