/**
 * MICRO-PX1 (E.D., 23 Nov 2026) · «MURO DA PIANTA» / «WALL FROM PLAN»: the
 * geometry of a clean wall proxy from the clicks of the Space's tool.
 *
 * The person clicks, in plan, the corners of the wall's outline in the order of
 * its perimeter (inner corners too: an L, a T, a U), then — optionally — points
 * on the wall's head (the «bauletto»), or on the line where the next wall
 * starts when the head is not visible (the foundation of the Great Temple of
 * Sarmizegetusa). This module turns those clicks into ONE closed manifold mesh
 * with the least polygons: the sides as quads (two triangles each, the glTF way),
 * the top and the bottom as the triangulation of the outline.
 *
 * The secondary mode «axis + thickness»: the clicks are the wall's axis, an
 * open polyline; the outline is born from its offset on the two sides by half
 * the thickness, with sharp (mitre) joints, then follows the same pipeline.
 *
 * Pure: no DOM, no three.js (the engine is lazy: importing it here would pull it
 * into the page's first bundle), so the triangulation is this module's own ear
 * clipping. `scripts/check-wall-from-plan.mjs` exercises it in node.
 *
 * FRAMES. The input points are the Space's scene points, three.js Y-up. Inside,
 * the plan is (x, y) = (X, −Z) — Blender's and the map's, seen from above with
 * north up — and the height is z = Y; «counter-clockwise» is read there. The
 * output positions are Y-up again, LOCAL to `origin` (the outline's centroid in
 * plan at the lowest base point), so the sketch is placed by its pose and the
 * glb is in its own frame, as every other sketch (MICRO-SPAZIO-3D-2).
 */

export type V3 = [number, number, number];

/** a click: the point in the scene (Y-up), and the model and document it fell on */
export interface WallPoint {
  p: V3;
  /** the representation model hit (its node id), null: not on a model (a proxy, a sketch, a layer) */
  rm?: string | null;
  /** the document the model is extracted from (its node id), null when none */
  doc?: string | null;
}

export type WallMode = "outline" | "axis";

/** MICRO-PX1b · how the head's points are read:
 *  · "surface": the head is SEEN (the «bauletto»): a point inside the outline,
 *    farther than `WALL_TOL.interior` from it, is a point of the head's own
 *    surface, triangulated with the outline's corners — the head has a shape of
 *    its own, not only a profile along the sides;
 *  · "face": the head is NOT seen (a wall under another, its back hidden): the
 *    points are clicked on the line of passage of the visible face and projected
 *    on the nearest side; the hidden side's heights are ESTIMATED.
 *  A wall of PX1 (no field) reads as "face": what PX1 did, the same mesh. */
export type HeadMode = "surface" | "face";

/** how a corner's head height was found: a clicked point there, interpolated
 *  between two clicked along the perimeter, ESTIMATED (the hidden side: not a
 *  point of a document), or the height of the Tool panel (no point at all) */
export type HeadKind = "clicked" | "interpolated" | "estimated" | "height";

/** what the sketch keeps to regenerate the wall (layout.sketches) */
export interface WallInput {
  mode: WallMode;
  /** the outline's corners (mode outline) or the axis's vertices (mode axis), in order */
  plan: WallPoint[];
  /** the points on the head / on the line of passage to the wall above; none: `height` */
  top: WallPoint[];
  /** metres above each base vertex, when there are no top points */
  height: number;
  /** metres, mode axis only */
  thickness: number;
  /** MICRO-PX1b · how the head's points are read (absent: "face", PX1's) */
  headMode?: HeadMode;
  /** MICRO-PX1b · where the local frame (the glb's origin) starts in height:
   *  EM Tools' Proxy Box pivot; absent: "bottom", PX1's */
  pivot?: WallPivot;
}

export type WallPivot = "bottom" | "center" | "top";

/** Every numeric choice of the module, in metres (written in the MICRO's report). */
export const WALL_TOL = {
  /** two consecutive corners nearer than this in plan are one */
  merge: 0.01,
  /** a corner nearer than this to the line of its neighbours, in plan, is aligned… */
  collinear: 0.01,
  /** …and is merged only when its base height is within this of the line's
   *  (a corner that records a step of the terrain stays) */
  collinearZ: 0.05,
  /** a top point projected nearer than this to a corner gives that corner its
   *  height; farther, it becomes a new corner (base and top) */
  snapVertex: 0.05,
  /** the least height of the wall at a corner (a head below the base is lifted to it) */
  minHeight: 0.01,
  /** a top point farther than this from the outline in plan: warned */
  farFromContour: 1.0,
  /** MICRO-PX1b · head "surface": a top point inside the outline and farther
   *  than this from it is a point of the head's surface (nearer: on the side) */
  interior: 0.05,
  /** mode axis: a mitre longer than this many half-thicknesses (an angle under
   *  about 11.5°) is refused, not clipped — a sharp joint was asked */
  miterLimit: 10,
  /** default height (m) with no top points, and default thickness (m) */
  height: 1,
  thickness: 0.6,
} as const;

export type WallErrorCode =
  | "too_few"          // fewer than 3 corners (2 axis vertices) after merging
  | "degenerate"       // no area
  | "self_intersect"   // the outline crosses itself (edges i and j)
  | "bad_thickness"    // mode axis: thickness ≤ 0
  | "miter";           // mode axis: a joint too sharp (vertex i)
export interface WallError { code: WallErrorCode; edges?: [number, number]; at?: number }

export type WallWarningCode = "merged" | "clamped" | "far";
export interface WallWarning { code: WallWarningCode; n?: number; at?: number; distance?: number }

/** MICRO-PX1b · the hidden side's estimate: which corners, from how many
 *  clicked points of the visible side, by which rule */
export interface WallEstimate {
  /** the corners (indices of `base` / `head`) whose head is estimated */
  vertices: number[];
  /** the clicked head points the estimate read */
  from: number;
  /** "perpendicular": the visible profile's height at the foot of the
   *  perpendicular from the corner; "single": the one point's height;
   *  "nearest-inner": the nearest point of the head's surface */
  rule: "perpendicular" | "single" | "nearest-inner";
}

export interface WallMesh {
  /** Y-up, local to `origin`, flat [x, y, z, …]: base corners 0…n−1, top corners n…2n−1,
   *  then (MICRO-PX1b) the points of the head's surface 2n…2n+m−1 */
  positions: number[];
  /** triangles, outward (counter-clockwise seen from outside) */
  indices: number[];
  /** the scene point the local frame starts at (Y-up) */
  origin: V3;
  /** the corners of the outline, base and top, in the scene (Y-up), counter-clockwise in plan */
  base: V3[];
  head: V3[];
  /** MICRO-PX1b · how each corner's head height was found */
  headKind: HeadKind[];
  /** the points of the head's surface (mode "surface"), in the scene, and which top click each is */
  inner: V3[];
  innerOf: number[];
  /** what each top click became: a corner's height, a new corner, a point of the surface */
  topRole: Array<"corner" | "edge" | "inner">;
  /** the hidden side's estimate (no corner estimated: vertices empty) */
  estimate: WallEstimate;
  /** how many corners, side quads, bottom triangles (`capTriangles`), top triangles,
   *  points of the head's surface, triangles in all */
  stats: { corners: number; quads: number; capTriangles: number; topTriangles: number; inner: number; triangles: number };
  warnings: WallWarning[];
}

export type WallResult = { ok: true; mesh: WallMesh } | { ok: false; error: WallError };

// ── plan geometry (x, y, z: z is the height) ────────────────────────────────

interface P { x: number; y: number; z: number }

const toPlan = (p: V3): P => ({ x: p[0], y: -p[2], z: p[1] });
const toScene = (p: P): V3 => [p.x, p.z, -p.y];
const cross3 = (a: P, b: P, c: P): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const dist2 = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** twice the signed area of a plan polygon (> 0: counter-clockwise) */
export function signedArea2(pts: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** the nearest point of segment ab to p, in plan: its parameter and distance */
function project(p: P, a: P, b: P): { t: number; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { t, d: Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) };
}

const EPS = 1e-9;

/** do segments ab and cd meet (touching and overlapping included)? */
function segmentsMeet(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross3(c, d, a), d2 = cross3(c, d, b), d3 = cross3(a, b, c), d4 = cross3(a, b, d);
  const s = (v: number) => (Math.abs(v) <= EPS ? 0 : Math.sign(v));
  const s1 = s(d1), s2 = s(d2), s3 = s(d3), s4 = s(d4);
  if (s1 * s2 < 0 && s3 * s4 < 0) return true;
  const on = (p: P, q: P, r: P) => Math.min(p.x, q.x) - EPS <= r.x && r.x <= Math.max(p.x, q.x) + EPS
    && Math.min(p.y, q.y) - EPS <= r.y && r.y <= Math.max(p.y, q.y) + EPS;
  if (s1 === 0 && on(c, d, a)) return true;
  if (s2 === 0 && on(c, d, b)) return true;
  if (s3 === 0 && on(a, b, c)) return true;
  if (s4 === 0 && on(a, b, d)) return true;
  return false;
}

/** The first pair of edges of a closed plan polygon that cross or touch (not
 *  as neighbours), or null; a neighbour folding back on its edge counts. */
export function selfIntersection(pts: Array<{ x: number; y: number }>): [number, number] | null {
  const q = pts.map((p) => ({ x: p.x, y: p.y, z: 0 }));
  const n = q.length;
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n];
    // a fold: the next edge goes back along this one
    const c = q[(i + 2) % n];
    if (n > 2 && Math.abs(cross3(a, b, c)) <= EPS && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return [i, (i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;          // neighbours through the closing edge
      if (segmentsMeet(a, b, q[j], q[(j + 1) % n])) return [i, j];
    }
  }
  return null;
}

/** Ear clipping of a simple counter-clockwise plan polygon: n − 2 triangles of
 *  its own corners, none with another corner inside or on its border (so no
 *  T-junction: corners aligned on an edge are kept and used). */
export function triangulate(pts: Array<{ x: number; y: number }>): Array<[number, number, number]> {
  const q = pts.map((p) => ({ x: p.x, y: p.y, z: 0 }));
  const idx = q.map((_, i) => i);
  const tris: Array<[number, number, number]> = [];
  const inside = (o: P, a: P, b: P, c: P) => cross3(a, b, o) >= -EPS && cross3(b, c, o) >= -EPS && cross3(c, a, o) >= -EPS;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    const L = idx.length;
    let cut = -1;
    let best = -1, bestCross = -Infinity;
    for (let k = 0; k < L; k++) {
      const a = idx[(k - 1 + L) % L], b = idx[k], c = idx[(k + 1) % L];
      const cr = cross3(q[a], q[b], q[c]);
      if (cr > bestCross) { bestCross = cr; best = k; }
      if (cr <= EPS) continue;                        // reflex, or aligned
      let blocked = false;
      for (const o of idx) {
        if (o === a || o === b || o === c) continue;
        if (inside(q[o], q[a], q[b], q[c])) { blocked = true; break; }
      }
      if (!blocked) { cut = k; break; }
    }
    if (cut < 0) cut = best;                          // numerical dead end: the most convex corner
    tris.push([idx[(cut - 1 + L) % L], idx[cut], idx[(cut + 1) % L]]);
    idx.splice(cut, 1);
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** is a plan point inside a polygon (even-odd)? */
export function insidePolygon(pts: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** MICRO-PX1b · the triangulation of a simple counter-clockwise polygon (its
 *  corners 0…n−1) with points inside it (n…n+m−1): the ear clipping first, then
 *  each point splits the triangle it falls in (or the two of the edge it falls
 *  on), and the edges not on the outline are flipped until every pair of
 *  triangles is Delaunay in plan (Lawson) — the outline's sides are never
 *  flipped, so the boundary stays the polygon's: n − 2 + 2m triangles. */
export function triangulateWithPoints(poly: Array<{ x: number; y: number }>, inner: Array<{ x: number; y: number }>):
    Array<[number, number, number]> {
  const n = poly.length;
  const q = [...poly, ...inner].map((p) => ({ x: p.x, y: p.y, z: 0 }));
  let tris = triangulate(poly).map((t) => [...t] as [number, number, number]);
  if (!inner.length) return tris;
  const isBoundary = (a: number, b: number) => a < n && b < n && ((a + 1) % n === b || (b + 1) % n === a);
  const inCircle = (a: P, b: P, c: P, d: P): boolean => {
    // > 0: d inside the circle through a, b, c (counter-clockwise)
    const ax = a.x - d.x, ay = a.y - d.y, bx = b.x - d.x, by = b.y - d.y, cx = c.x - d.x, cy = c.y - d.y;
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
    return det > 1e-12;
  };
  const legalize = () => {
    for (let guard = 0; guard < 10000; guard++) {
      let flipped = false;
      const edge = new Map<string, number>();
      for (let t = 0; t < tris.length && !flipped; t++) {
        for (let k = 0; k < 3 && !flipped; k++) {
          const a = tris[t][k], b = tris[t][(k + 1) % 3];
          const other = edge.get(`${b}>${a}`);
          edge.set(`${a}>${b}`, t);
          if (other === undefined || isBoundary(a, b)) continue;
          const c = tris[t][(k + 2) % 3];
          const T = tris[other];
          const d = T.find((v) => v !== a && v !== b)!;
          if (!inCircle(q[a], q[b], q[c], q[d])) continue;
          // the quad a-d-b-c must be convex for the flip: the new triangles counter-clockwise
          if (cross3(q[c], q[a], q[d]) <= EPS || cross3(q[d], q[b], q[c]) <= EPS) continue;
          tris[t] = [c, a, d];
          tris[other] = [d, b, c];
          flipped = true;
        }
      }
      if (!flipped) return;
    }
  };
  inner.forEach((_, k) => {
    const v = n + k, p = q[v];
    // the triangle it falls in (or on one of its edges)
    let hit = -1, onEdge = -1;
    for (let t = 0; t < tris.length && hit < 0; t++) {
      const [a, b, c] = tris[t];
      const s0 = cross3(q[a], q[b], p), s1 = cross3(q[b], q[c], p), s2 = cross3(q[c], q[a], p);
      if (s0 >= -EPS && s1 >= -EPS && s2 >= -EPS) {
        hit = t;
        onEdge = Math.abs(s0) <= EPS ? 0 : Math.abs(s1) <= EPS ? 1 : Math.abs(s2) <= EPS ? 2 : -1;
      }
    }
    if (hit < 0) return;                              // not inside (the caller checked it is)
    const [a, b, c] = tris[hit];
    if (onEdge < 0) {
      tris.splice(hit, 1, [a, b, v], [b, c, v], [c, a, v]);
    } else {
      const e0 = tris[hit][onEdge], e1 = tris[hit][(onEdge + 1) % 3], opp = tris[hit][(onEdge + 2) % 3];
      const t2 = tris.findIndex((T, i) => i !== hit && T.includes(e0) && T.includes(e1));
      const next: Array<[number, number, number]> = [[e0, v, opp], [v, e1, opp]];
      if (t2 >= 0) {
        const o2 = tris[t2].find((x) => x !== e0 && x !== e1)!;
        next.push([e1, v, o2], [v, e0, o2]);
        tris = tris.filter((_, i) => i !== hit && i !== t2);
      } else tris = tris.filter((_, i) => i !== hit);
      tris.push(...next);
    }
    legalize();
  });
  return tris;
}

/** Mode axis: the outline of an axis polyline offset by ±thickness/2, mitre
 *  joints, square ends — the left side forward, the right side back. */
export function offsetAxis(axis: Array<{ x: number; y: number; z: number }>, thickness: number):
    { ok: true; outline: P[] } | { ok: false; error: WallError } {
  if (!(thickness > 0)) return { ok: false, error: { code: "bad_thickness" } };
  const a: P[] = [];
  for (const p of axis) if (!a.length || dist2(a[a.length - 1], p) >= WALL_TOL.merge) a.push({ x: p.x, y: p.y, z: p.z });
  if (a.length < 2) return { ok: false, error: { code: "too_few" } };
  const h = thickness / 2;
  const normals: Array<{ x: number; y: number }> = [];
  for (let k = 0; k + 1 < a.length; k++) {
    const dx = a[k + 1].x - a[k].x, dy = a[k + 1].y - a[k].y, l = Math.hypot(dx, dy);
    normals.push({ x: -dy / l, y: dx / l });
  }
  const left: P[] = [], right: P[] = [];
  for (let k = 0; k < a.length; k++) {
    let mx: number, my: number, len: number;
    if (k === 0 || k === a.length - 1) {
      const nn = normals[k === 0 ? 0 : k - 1];
      mx = nn.x; my = nn.y; len = h;
    } else {
      const n0 = normals[k - 1], n1 = normals[k];
      const sx = n0.x + n1.x, sy = n0.y + n1.y, sl = Math.hypot(sx, sy);
      if (sl < 1e-9) return { ok: false, error: { code: "miter", at: k } };
      mx = sx / sl; my = sy / sl;
      const c = mx * n1.x + my * n1.y;               // cos of half the turn
      if (c <= 1 / WALL_TOL.miterLimit) return { ok: false, error: { code: "miter", at: k } };
      len = h / c;
    }
    left.push({ x: a[k].x + mx * len, y: a[k].y + my * len, z: a[k].z });
    right.push({ x: a[k].x - mx * len, y: a[k].y - my * len, z: a[k].z });
  }
  return { ok: true, outline: [...left, ...right.reverse()] };
}

/** Consecutive corners within `merge` become one; aligned corners (in plan,
 *  inside their neighbours' segment, and with the base on the line within
 *  `collinearZ`) leave. Returns the corners kept and how many left. */
export function simplifyOutline(pts: P[]): { pts: P[]; merged: number } {
  let out: P[] = [];
  for (const p of pts) if (!out.length || dist2(out[out.length - 1], p) >= WALL_TOL.merge) out.push({ ...p });
  while (out.length > 1 && dist2(out[0], out[out.length - 1]) < WALL_TOL.merge) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const pr = project(p, a, b);
      if (pr.t <= 0 || pr.t >= 1 || pr.d >= WALL_TOL.collinear) continue;
      const zLine = a.z + (b.z - a.z) * pr.t;
      if (Math.abs(p.z - zLine) >= WALL_TOL.collinearZ) continue;
      out = out.filter((_, k) => k !== i);
      changed = true;
      break;
    }
  }
  return { pts: out, merged: pts.length - out.length };
}

// ── the wall ────────────────────────────────────────────────────────────────

/**
 * The wall of `input`: the outline (or the axis offset), simplified, checked,
 * turned counter-clockwise; the top points inserted where they fall; the head
 * interpolated; the mesh closed.
 */
export function buildWall(input: WallInput): WallResult {
  const warnings: WallWarning[] = [];
  const raw = input.plan.map((w) => toPlan(w.p));
  // everything is computed around the clicks' centroid: georeferenced
  // coordinates (hundreds of km) would eat the tolerances' digits
  const c0 = raw.length ? { x: raw.reduce((s, p) => s + p.x, 0) / raw.length, y: raw.reduce((s, p) => s + p.y, 0) / raw.length } : { x: 0, y: 0 };
  const local = (p: P): P => ({ x: p.x - c0.x, y: p.y - c0.y, z: p.z });
  let outline: P[];
  if (input.mode === "axis") {
    const off = offsetAxis(raw.map(local), input.thickness);
    if (!off.ok) return off;
    outline = off.outline;
  } else {
    outline = raw.map(local);
  }
  const simp = simplifyOutline(outline);
  if (simp.merged > 0) warnings.push({ code: "merged", n: simp.merged });
  let pts = simp.pts;
  if (pts.length < 3) return { ok: false, error: { code: "too_few" } };
  const crossing = selfIntersection(pts);
  if (crossing) return { ok: false, error: { code: "self_intersect", edges: crossing } };
  const area2 = signedArea2(pts);
  // no area: the outline's mean width (2 · area / perimeter) under the alignment tolerance
  let perim = 0;
  for (let i = 0; i < pts.length; i++) perim += dist2(pts[i], pts[(i + 1) % pts.length]);
  if (Math.abs(area2) / Math.max(perim, 1e-12) < WALL_TOL.collinear) return { ok: false, error: { code: "degenerate" } };
  if (area2 < 0) pts = pts.reverse();

  // the top points: each on the nearest edge of the outline — or, head
  // "surface" (MICRO-PX1b), inside it: a point of the head's own surface
  const headMode: HeadMode = input.headMode ?? "face";
  const known = new Map<number, number>();           // corner → head height (index into `pts` after insertion)
  const tops = input.top.map((w) => local(toPlan(w.p)));
  const topRole: Array<"corner" | "edge" | "inner"> = tops.map(() => "edge");
  const inner: Array<P & { k: number }> = [];
  if (tops.length) {
    // per edge: the parameters where a new corner goes, and the heights
    const onEdge = new Map<number, Array<{ t: number; z: number; k: number }>>();
    const atCorner = new Map<number, number>();
    tops.forEach((tp, k) => {
      let bestE = 0, best = { t: 0, d: Infinity };
      for (let e = 0; e < pts.length; e++) {
        const pr = project(tp, pts[e], pts[(e + 1) % pts.length]);
        if (pr.d < best.d - 1e-12) { best = pr; bestE = e; }
      }
      if (headMode === "surface" && best.d > WALL_TOL.interior && insidePolygon(pts, tp.x, tp.y)) {
        // two points of the surface nearer than the merge: the later one wins
        const near = inner.find((q) => dist2(q, tp) < WALL_TOL.merge);
        if (near) { topRole[near.k] = "inner"; near.z = tp.z; near.k = k; } else inner.push({ ...tp, k });
        topRole[k] = "inner";
        return;
      }
      if (best.d > WALL_TOL.farFromContour) warnings.push({ code: "far", at: k, distance: best.d });
      const a = pts[bestE], b = pts[(bestE + 1) % pts.length];
      const len = dist2(a, b);
      if (best.t * len < WALL_TOL.snapVertex) { atCorner.set(bestE, tp.z); topRole[k] = "corner"; }
      else if ((1 - best.t) * len < WALL_TOL.snapVertex) { atCorner.set((bestE + 1) % pts.length, tp.z); topRole[k] = "corner"; }
      else {
        const list = onEdge.get(bestE) ?? [];
        // two points nearer than the snap on one edge: the later one wins
        const near = list.find((x) => Math.abs(x.t - best.t) * len < WALL_TOL.snapVertex);
        if (near) { near.z = tp.z; near.k = k; } else list.push({ t: best.t, z: tp.z, k });
        onEdge.set(bestE, list);
      }
    });
    const next: P[] = [];
    for (let e = 0; e < pts.length; e++) {
      const a = pts[e], b = pts[(e + 1) % pts.length];
      if (atCorner.has(e)) known.set(next.length, atCorner.get(e)!);
      next.push(a);
      for (const x of (onEdge.get(e) ?? []).sort((u, v) => u.t - v.t)) {
        known.set(next.length, x.z);
        next.push({ x: a.x + (b.x - a.x) * x.t, y: a.y + (b.y - a.y) * x.t, z: a.z + (b.z - a.z) * x.t });
      }
    }
    pts = next;
  }
  const n = pts.length;
  // the head
  const head: number[] = new Array(n);
  const headKind: HeadKind[] = new Array(n).fill("height");
  const estimate: WallEstimate = { vertices: [], from: 0, rule: "perpendicular" };
  if (!known.size && !inner.length) {
    for (let i = 0; i < n; i++) head[i] = pts[i].z + input.height;
  } else if (!known.size) {
    // MICRO-PX1b · only points of the surface: each corner the nearest one's height, estimated
    for (let i = 0; i < n; i++) {
      let best = inner[0], bd = Infinity;
      for (const q of inner) { const d = dist2(pts[i], q); if (d < bd) { bd = d; best = q; } }
      head[i] = best.z;
      headKind[i] = "estimated";
    }
    Object.assign(estimate, { vertices: [...Array(n).keys()], from: inner.length, rule: "nearest-inner" });
  } else {
    // the perimeter's parameter of each corner
    const s: number[] = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + dist2(pts[i - 1], pts[i]));
    const P = s[n - 1] + dist2(pts[n - 1], pts[0]);
    const ks = [...known.keys()].sort((a, b) => a - b);
    for (const k of ks) { head[k] = known.get(k)!; headKind[k] = "clicked"; }
    if (ks.length === 1) {
      for (let i = 0; i < n; i++) if (i !== ks[0]) { head[i] = known.get(ks[0])!; headKind[i] = "estimated"; estimate.vertices.push(i); }
      estimate.from = 1;
      estimate.rule = "single";
    } else {
      // the gaps between consecutive known corners along the perimeter; the
      // largest is «beyond the last»: its corners are the HIDDEN side, their
      // head ESTIMATED (MICRO-PX1b): the visible profile's height at the foot
      // of the perpendicular from the corner — across a wall's thickness, the
      // point of the visible face in front of it
      const gap = (j: number) => { const a = s[ks[j]], b = s[ks[(j + 1) % ks.length]]; return ((b - a) % P + P) % P || P; };
      let J = 0;
      for (let j = 1; j < ks.length; j++) if (gap(j) > gap(J) + 1e-12) J = j;
      const inGap = new Set<number>();
      for (let j = 0; j < ks.length; j++) {
        const a = ks[j], b = ks[(j + 1) % ks.length];
        for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
          if (j === J) { inGap.add(i); continue; }
          const g = gap(j);
          const u = (((s[i] - s[a]) % P) + P) % P;
          head[i] = known.get(a)! + (known.get(b)! - known.get(a)!) * (g > 0 ? u / g : 0);
          headKind[i] = "interpolated";
        }
      }
      // the visible profile: the corners from the gap's end round to its start
      const prof: number[] = [];
      for (let i = ks[(J + 1) % ks.length]; ; i = (i + 1) % n) { prof.push(i); if (i === ks[J]) break; }
      for (const i of inGap) {
        let bh = head[prof[0]], bd = Infinity;
        for (let q = 0; q + 1 < prof.length; q++) {
          const a = prof[q], b = prof[q + 1];
          const pr = project(pts[i], pts[a], pts[b]);
          if (pr.d < bd - 1e-12) { bd = pr.d; bh = head[a] + (head[b] - head[a]) * pr.t; }
        }
        if (prof.length === 1) bh = head[prof[0]];
        head[i] = bh;
        headKind[i] = "estimated";
        estimate.vertices.push(i);
      }
      estimate.from = ks.length;
      estimate.vertices.sort((a, b) => a - b);
    }
  }
  for (let i = 0; i < n; i++) if (head[i] < pts[i].z + WALL_TOL.minHeight) {
    head[i] = pts[i].z + WALL_TOL.minHeight;
    warnings.push({ code: "clamped", at: i });
  }

  // the faces: the bottom the outline's triangulation, the top the same with
  // the points of the head's surface (MICRO-PX1b)
  const caps = triangulate(pts);
  // the base under a point of the surface: the bottom's plane there
  const baseAt = (p: P): number => {
    for (const [a, b, c] of caps) {
      const d = cross3(pts[a], pts[b], pts[c]);
      if (Math.abs(d) < 1e-15) continue;
      const l0 = cross3(pts[b], pts[c], p) / d, l1 = cross3(pts[c], pts[a], p) / d, l2 = 1 - l0 - l1;
      if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) return l0 * pts[a].z + l1 * pts[b].z + l2 * pts[c].z;
    }
    return Math.min(...pts.map((q) => q.z));
  };
  for (const q of inner) {
    const z0 = baseAt(q);
    if (q.z < z0 + WALL_TOL.minHeight) { q.z = z0 + WALL_TOL.minHeight; warnings.push({ code: "clamped", at: n + inner.indexOf(q) }); }
  }
  const topCaps = inner.length ? triangulateWithPoints(pts, inner) : caps;
  const m = inner.length;
  const vTop = (v: number) => (v < n ? n + v : 2 * n + (v - n));
  const indices: number[] = [];
  for (const [a, b, c] of topCaps) indices.push(vTop(a), vTop(b), vTop(c));   // top, up
  for (const [a, b, c] of caps) indices.push(a, c, b);                  // bottom, down
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);                         // a side, out
  }
  const zMin = Math.min(...pts.map((p) => p.z));
  const zMax = Math.max(...head, ...inner.map((q) => q.z));
  // MICRO-PX1b · the pivot (EM Tools' Proxy Box: TOP / CENTER / BOTTOM): where the local frame starts in height
  const pivot = input.pivot ?? "bottom";
  const zO = pivot === "top" ? zMax : pivot === "center" ? (zMin + zMax) / 2 : zMin;
  const ox = pts.reduce((sum, p) => sum + p.x, 0) / n, oy = pts.reduce((sum, p) => sum + p.y, 0) / n;
  const positions: number[] = [];
  const ring = (z: (i: number) => number) => { for (let i = 0; i < n; i++) positions.push(pts[i].x - ox, z(i) - zO, -(pts[i].y - oy)); };
  ring((i) => pts[i].z);
  ring((i) => head[i]);
  for (const q of inner) positions.push(q.x - ox, q.z - zO, -(q.y - oy));
  const world = (p: P): P => ({ x: p.x + c0.x, y: p.y + c0.y, z: p.z });
  return { ok: true, mesh: {
    positions, indices,
    origin: toScene(world({ x: ox, y: oy, z: zO })),
    base: pts.map((p) => toScene(world(p))),
    head: pts.map((p, i) => toScene(world({ ...p, z: head[i] }))),
    headKind,
    inner: inner.map((q) => toScene(world(q))),
    innerOf: inner.map((q) => q.k),
    topRole,
    estimate,
    stats: { corners: n, quads: n, capTriangles: caps.length, topTriangles: topCaps.length, inner: m, triangles: indices.length / 3 },
    warnings,
  } };
}

// ── what a check (and the Item panel) reads of a mesh ───────────────────────

/** every undirected edge shared by exactly two triangles, in opposite directions */
export function isClosedManifold(indices: number[]): boolean {
  const count = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k], b = indices[t + (k + 1) % 3];
      const key = `${a}>${b}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  for (const [key, c] of count) {
    const [a, b] = key.split(">");
    if (c !== 1 || count.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** the signed volume (divergence theorem): > 0 when the normals point out */
export function meshVolume(positions: number[], indices: number[]): number {
  let v = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]]);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

/** a default input (the Tool panel's values) */
export function emptyWall(mode: WallMode = "outline", height: number = WALL_TOL.height, thickness: number = WALL_TOL.thickness): WallInput {
  return { mode, plan: [], top: [], height, thickness };
}

/** A wall input read back from a layout (plain data): null when it is not one. */
export function readWallInput(v: unknown): WallInput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const pt = (x: unknown): WallPoint | null => {
    const r = x as Record<string, unknown> | null;
    const p = r?.p;
    if (!Array.isArray(p) || p.length !== 3 || !p.every((c) => Number.isFinite(Number(c)))) return null;
    return { p: p.map(Number) as V3, rm: typeof r!.rm === "string" ? r!.rm : null, doc: typeof r!.doc === "string" ? r!.doc : null };
  };
  const list = (x: unknown) => (Array.isArray(x) ? x.map(pt).filter((q): q is WallPoint => !!q) : []);
  const plan = list(o.plan);
  if (!plan.length) return null;
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : d);
  return { mode: o.mode === "axis" ? "axis" : "outline", plan, top: list(o.top),
           height: num(o.height, WALL_TOL.height), thickness: num(o.thickness, WALL_TOL.thickness),
           // MICRO-PX1b · absent (a wall of PX1): "face" and "bottom", the mesh it had
           ...(o.headMode === "surface" || o.headMode === "face" ? { headMode: o.headMode } : {}),
           ...(o.pivot === "center" || o.pivot === "top" || o.pivot === "bottom" ? { pivot: o.pivot } : {}) };
}

// ── MICRO-PX1b · the corrections: pure edits of the inputs ──────────────────

/** the least points of the plan: three corners, or two vertices of an axis */
export const planMin = (mode: WallMode): number => (mode === "axis" ? 2 : 3);

export type WallEdit =
  | { op: "move"; which: "plan" | "top"; k: number; to: WallPoint }
  /** a corner inserted in the plan after the k-th (on the side k → k+1) */
  | { op: "insert"; after: number; point: WallPoint }
  | { op: "remove"; which: "plan" | "top"; k: number }
  /** a point of the head added (MICRO-PX1b C: «Aggiungi punti alti») */
  | { op: "add-top"; point: WallPoint };

/** An edit of the inputs: a new input, or why not (`too_few`: the plan would
 *  go under its least; `range`: no such point). The input is never changed. */
export function editWall<T extends WallInput>(input: T, e: WallEdit): { ok: true; input: T } | { ok: false; why: "too_few" | "range" } {
  const copy = (w: WallPoint): WallPoint => ({ p: [...w.p] as V3, rm: w.rm ?? null, doc: w.doc ?? null });
  const plan = input.plan.map(copy), top = input.top.map(copy);
  if (e.op === "move") {
    const list = e.which === "plan" ? plan : top;
    if (e.k < 0 || e.k >= list.length) return { ok: false, why: "range" };
    list[e.k] = copy(e.to);
  } else if (e.op === "insert") {
    if (e.after < 0 || e.after >= plan.length) return { ok: false, why: "range" };
    plan.splice(e.after + 1, 0, copy(e.point));
  } else if (e.op === "remove") {
    const list = e.which === "plan" ? plan : top;
    if (e.k < 0 || e.k >= list.length) return { ok: false, why: "range" };
    if (e.which === "plan" && plan.length - 1 < planMin(input.mode)) return { ok: false, why: "too_few" };
    list.splice(e.k, 1);
  } else {
    top.push(copy(e.point));
  }
  return { ok: true, input: { ...input, plan, top } };
}

/** The sides of the plan where a corner can be inserted: the midpoint of each
 *  pair of consecutive clicks (closed for an outline, open for an axis), the
 *  base's height interpolated — the handles «+» of the Space. */
export function wallSides(input: Pick<WallInput, "mode" | "plan">): Array<{ after: number; p: V3 }> {
  const n = input.plan.length;
  const out: Array<{ after: number; p: V3 }> = [];
  const last = input.mode === "axis" ? n - 1 : n;
  for (let k = 0; k < last && n >= 2; k++) {
    const a = input.plan[k].p, b = input.plan[(k + 1) % n].p;
    out.push({ after: k, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
  }
  return out;
}

/** A short signature of an input — the preview is built again only when it changes. */
export function wallSig(input: WallInput, extra = ""): string {
  const r = (v: number) => Math.round(v * 1e4);
  const pl = (l: WallPoint[]) => l.map((w) => w.p.map(r).join(",")).join(";");
  return `${input.mode}|${pl(input.plan)}|${pl(input.top)}|${r(input.height)}|${r(input.thickness)}|${input.headMode ?? ""}|${input.pivot ?? ""}|${extra}`;
}

/** The documents the clicks fell on, in order of first appearance (C: «each
 *  point remembers its document»); `null` stands for a click on no model. */
export function wallDocuments(input: Pick<WallInput, "plan" | "top">): Array<string | null> {
  const out: Array<string | null> = [];
  for (const w of [...input.plan, ...input.top]) {
    const d = w.doc ?? null;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** The clicks as Blender's frame (Z up: x, −Z, Y), how EM Tools' Proxy Box
 *  stores an extractor's position (attributes x, y, z). */
export function blenderXYZ(p: V3): V3 {
  return [p[0], -p[2], p[1]];
}

/** A sketch's pose moved after the wall was built (G / R / S): the inputs
 *  carried along, so the wall built again stands where it is seen. The pose is
 *  three.js's (position, Euler XYZ in radians, scale) about the mesh's origin
 *  `origin` at build time; the points (scene frame) are moved by it. */
export function bakePose(input: WallInput, origin: V3, pose: { position: V3; rotation: V3; scale: V3 }): WallInput {
  const [a, b, c] = pose.rotation;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // three's Euler XYZ: R = Rx · Ry · Rz
  const R = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  const move = (w: WallPoint): WallPoint => {
    const d = [0, 1, 2].map((k) => (w.p[k] - origin[k]) * pose.scale[k]);
    const p = [0, 1, 2].map((k) => pose.position[k] + R[k][0] * d[0] + R[k][1] * d[1] + R[k][2] * d[2]) as V3;
    return { ...w, p };
  };
  const s = (Math.abs(pose.scale[0]) + Math.abs(pose.scale[2])) / 2;
  return { ...input, plan: input.plan.map(move), top: input.top.map(move),
           height: input.height * Math.abs(pose.scale[1]), thickness: input.thickness * s };
}

/** Is the pose the one the wall was built with (at its origin, upright, scale 1)? */
export function poseIsBuilt(origin: V3, pose: { position: V3; rotation: V3; scale: V3 }, eps = 1e-9): boolean {
  return pose.position.every((v, k) => Math.abs(v - origin[k]) <= eps)
    && pose.rotation.every((v) => Math.abs(v) <= eps) && pose.scale.every((v) => Math.abs(v - 1) <= eps);
}
